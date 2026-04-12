/**
 * Minimal multiplayer room server: create/join room, broadcast pointers.
 * Run: npm run dev:server  (listens on 0.0.0.0:PORT)
 */

import { randomUUID } from 'node:crypto';
import * as http from 'node:http';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerToClientMessage } from '../src/multiplayer/protocol.ts';
import { parseClientMessage } from '../src/multiplayer/protocol.ts';

import {
  createOfficialScenarioCatalog,
  type OfficialScenarioCatalog,
} from './officialScenarioCatalog.ts';

const PORT = Number(process.env.MP_PORT ?? 3333);

/** How long an empty room (no sockets) is kept so reconnect / reload can restore boardState. */
const ROOM_EMPTY_TTL_MS = Math.max(
  0,
  Number(process.env.MP_ROOM_EMPTY_TTL_MS ?? 10 * 60 * 1000) || 10 * 60 * 1000,
);

/** Max raw UTF-8 bytes accepted for PUT /api/scenarios/official/:id body. */
export const OFFICIAL_SCENARIO_PUT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const OFFICIAL_SCENARIO_RATE_LIMIT_WINDOW_MS = 60_000;
function officialScenarioRateLimitPerWindow(): number {
  return Math.max(1, Number(process.env.SCENARIOS_OFFICIAL_RATE_LIMIT_PER_MIN ?? 20) || 20);
}
function isOfficialScenarioEditEnabled(): boolean {
  const raw = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  if (raw === undefined) return true;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

const OFFICIAL_SCENARIOS_BASE = '/api/scenarios/official';

type Role = 'player' | 'spectator';

type Attached = {
  id: string;
  roomId: string | null;
  role: Role | null;
  playerSlot: 0 | 1 | null;
};

type Room = {
  players: [WebSocket | null, WebSocket | null];
  spectators: Set<WebSocket>;
  /** Latest full-table JSON snapshot from clients. */
  boardState: object | null;
  /** When the room became empty (no sockets); null if anyone is connected. */
  emptySince: number | null;
  emptyExpireTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();
const wsMeta = new WeakMap<WebSocket, Attached>();
const officialScenarioPutRateCounters = new Map<string, { windowStartedAt: number; count: number }>();

function clientIpKey(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim().length > 0) {
    return fwd.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimitedOfficialScenarioPut(req: IncomingMessage, nowMs: number): boolean {
  const limitPerWindow = officialScenarioRateLimitPerWindow();
  const key = clientIpKey(req);
  const existing = officialScenarioPutRateCounters.get(key);
  if (!existing || nowMs - existing.windowStartedAt >= OFFICIAL_SCENARIO_RATE_LIMIT_WINDOW_MS) {
    officialScenarioPutRateCounters.set(key, { windowStartedAt: nowMs, count: 1 });
    return false;
  }
  existing.count += 1;
  if (existing.count > limitPerWindow) {
    return true;
  }
  return false;
}

function isRoomSocketEmpty(room: Room): boolean {
  return (
    room.players[0] === null &&
    room.players[1] === null &&
    room.spectators.size === 0
  );
}

function clearRoomEmptySchedule(room: Room): void {
  if (room.emptyExpireTimer !== null) {
    clearTimeout(room.emptyExpireTimer);
    room.emptyExpireTimer = null;
  }
  room.emptySince = null;
}

function scheduleRoomDeleteIfEmpty(roomId: string, room: Room): void {
  if (!isRoomSocketEmpty(room)) return;
  clearRoomEmptySchedule(room);
  room.emptySince = Date.now();
  if (ROOM_EMPTY_TTL_MS <= 0) {
    rooms.delete(roomId);
    return;
  }
  room.emptyExpireTimer = setTimeout(() => {
    room.emptyExpireTimer = null;
    const r = rooms.get(roomId);
    if (!r) return;
    if (!isRoomSocketEmpty(r)) return;
    rooms.delete(roomId);
  }, ROOM_EMPTY_TTL_MS);
}

function reviveRoomOnJoin(room: Room): void {
  clearRoomEmptySchedule(room);
}

/** Wall-clock safety if timers are delayed (sleep, debugger). */
function purgeExpiredEmptyRooms(): void {
  if (ROOM_EMPTY_TTL_MS <= 0) return;
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (!isRoomSocketEmpty(room)) continue;
    if (room.emptySince === null) continue;
    if (now - room.emptySince < ROOM_EMPTY_TTL_MS) continue;
    clearRoomEmptySchedule(room);
    rooms.delete(id);
  }
}

function isRoomExpiredTombstone(room: Room): boolean {
  if (!isRoomSocketEmpty(room)) return false;
  if (room.emptySince === null) return false;
  return Date.now() - room.emptySince >= ROOM_EMPTY_TTL_MS;
}

function send(ws: WebSocket, msg: ServerToClientMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastRoom(
  roomId: string,
  msg: ServerToClientMessage,
  except?: WebSocket,
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const w of room.players) {
    if (w && w !== except) send(w, msg);
  }
  for (const w of room.spectators) {
    if (w !== except) send(w, msg);
  }
}

/** Voice/WebRTC signaling: players only (spectators do not participate). */
function broadcastRoomPlayers(
  roomId: string,
  msg: ServerToClientMessage,
  except?: WebSocket,
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const w of room.players) {
    if (w && w !== except) send(w, msg);
  }
}

/** Broadcast to every WebSocket client attached to the room server (all rooms + lobby). */
function broadcastAllSockets(wss: WebSocketServer, msg: ServerToClientMessage): void {
  for (const client of wss.clients) {
    send(client, msg);
  }
}

function removeFromRoom(ws: WebSocket): void {
  const m = wsMeta.get(ws);
  if (!m?.roomId) return;
  const room = rooms.get(m.roomId);
  if (!room) {
    m.roomId = null;
    m.role = null;
    m.playerSlot = null;
    return;
  }
  if (m.playerSlot === 0) room.players[0] = null;
  else if (m.playerSlot === 1) room.players[1] = null;
  else if (m.role === 'spectator') room.spectators.delete(ws);

  const leftId = m.id;
  const leftRole = m.role ?? 'spectator';
  const leftSlot = m.playerSlot;
  const roomId = m.roomId;
  broadcastRoom(
    roomId,
    {
      type: 'peerLeft',
      id: leftId,
      role: leftRole,
      playerSlot: leftSlot,
    },
    ws,
  );

  if (isRoomSocketEmpty(room)) {
    scheduleRoomDeleteIfEmpty(roomId, room);
  }

  m.roomId = null;
  m.role = null;
  m.playerSlot = null;
}

function genRoomId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return s;
}

function newEmptyRoomFields(): Pick<
  Room,
  'boardState' | 'emptySince' | 'emptyExpireTimer'
> {
  return {
    boardState: null,
    emptySince: null,
    emptyExpireTimer: null,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  res.end(JSON.stringify(body));
}

function scenarioApiPathSegments(
  pathname: string,
): 'list' | { id: string } | null | 'invalid_path' {
  if (pathname === OFFICIAL_SCENARIOS_BASE || pathname === `${OFFICIAL_SCENARIOS_BASE}/`) {
    return 'list';
  }
  const prefix = `${OFFICIAL_SCENARIOS_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (rest === '' || rest.includes('/')) return null;
  try {
    return { id: decodeURIComponent(rest) };
  } catch {
    return 'invalid_path';
  }
}

async function readBodyWithByteLimit(
  req: IncomingMessage,
  limitBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413 }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limitBytes) {
      return { ok: false, status: 413 };
    }
    chunks.push(buf);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

async function handleOfficialScenariosHttp(
  req: IncomingMessage,
  res: ServerResponse,
  catalog: OfficialScenarioCatalog,
  parsed: 'list' | { id: string },
  wss: WebSocketServer,
): Promise<void> {
  if (parsed === 'list') {
    if (req.method === 'GET') {
      sendJson(res, 200, {
        scenarios: catalog.list(),
        catalogUpdatedAt: catalog.catalogUpdatedAt(),
      });
      return;
    }
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const { id } = parsed;

  if (req.method === 'GET') {
    const scenario = catalog.getById(id);
    if (!scenario) {
      sendJson(res, 404, { error: 'Scenario not found', code: 'NOT_FOUND' });
      return;
    }
    sendJson(res, 200, { scenario });
    return;
  }

  if (req.method === 'PUT') {
    if (!isOfficialScenarioEditEnabled()) {
      sendJson(res, 409, {
        error: 'Official scenario editing is disabled',
        code: 'EDIT_DISABLED',
      });
      return;
    }
    if (isRateLimitedOfficialScenarioPut(req, Date.now())) {
      sendJson(res, 429, {
        error: 'Rate limit exceeded for official scenario updates.',
        code: 'RATE_LIMITED',
      });
      return;
    }

    const read = await readBodyWithByteLimit(req, OFFICIAL_SCENARIO_PUT_MAX_BODY_BYTES);
    if (!read.ok) {
      req.destroy();
      sendJson(res, 413, { error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }

    let raw: unknown;
    try {
      raw = read.text.length === 0 ? null : JSON.parse(read.text);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
      return;
    }

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_BODY' });
      return;
    }

    const bodyId = (raw as { id?: unknown }).id;
    if (bodyId !== id) {
      sendJson(res, 400, {
        error: 'Scenario id in URL and body must match',
        code: 'ID_MISMATCH',
      });
      return;
    }

    try {
      const scenario = catalog.update(raw);
      sendJson(res, 200, { scenario });
      broadcastAllSockets(wss, {
        type: 'officialScenariosUpdated',
        catalogUpdatedAt: catalog.catalogUpdatedAt(),
        changedIds: [id],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /Official scenario catalog update:/i.test(message) ||
        /document kind must be "official"/i.test(message)
      ) {
        sendJson(res, 400, { error: message, code: 'VALIDATION_ERROR' });
      } else {
        console.error('[mp] PUT /api/scenarios/official/:id failed', err);
        sendJson(res, 500, { error: 'Internal server error', code: 'INTERNAL' });
      }
    }
    return;
  }

  res.setHeader('Allow', 'GET, PUT');
  sendJson(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  catalog: OfficialScenarioCatalog,
  wss: WebSocketServer,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    const isOfficialScenariosRoute =
      pathname === OFFICIAL_SCENARIOS_BASE ||
      pathname === `${OFFICIAL_SCENARIOS_BASE}/` ||
      pathname.startsWith(`${OFFICIAL_SCENARIOS_BASE}/`);

    if (isOfficialScenariosRoute) {
      const parsed = scenarioApiPathSegments(pathname);
      if (parsed === 'invalid_path') {
        sendJson(res, 400, {
          error: 'Invalid scenario path segment encoding',
          code: 'INVALID_PATH',
        });
        return;
      }
      if (parsed === null) {
        sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      await handleOfficialScenariosHttp(req, res, catalog, parsed, wss);
      return;
    }

    sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
  } catch (err) {
    console.error('[mp] HTTP handler error', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error', code: 'INTERNAL' });
    }
  }
}

function clearAllRoomState(): void {
  for (const room of rooms.values()) {
    clearRoomEmptySchedule(room);
  }
  rooms.clear();
  officialScenarioPutRateCounters.clear();
}

function attachRoomSocketHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    const id = randomUUID();
    wsMeta.set(ws, { id, roomId: null, role: null, playerSlot: null });

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString();
      const msg = parseClientMessage(raw);
      if (!msg) {
        try {
          const o = JSON.parse(raw) as { type?: string };
          if (o?.type === 'syncBoard') {
            console.warn(
              '[mp] syncBoard ignored: invalid JSON payload (expect { type, payload: object }) — client/server protocol mismatch?',
            );
          }
        } catch {
          /* ignore */
        }
        return;
      }

      if (msg.type === 'ping') {
        send(ws, { type: 'pong', t: msg.t });
        return;
      }

      const meta = wsMeta.get(ws)!;

      if (msg.type === 'createRoom') {
        if (meta.roomId) {
          send(ws, { type: 'joinError', message: 'Already in a room' });
          return;
        }
        purgeExpiredEmptyRooms();
        let roomId = genRoomId();
        while (rooms.has(roomId)) roomId = genRoomId();
        const emptyFields = newEmptyRoomFields();
        const room: Room = {
          players: [ws, null],
          spectators: new Set(),
          ...emptyFields,
        };
        rooms.set(roomId, room);
        meta.roomId = roomId;
        meta.role = 'player';
        meta.playerSlot = 0;
        const out: ServerToClientMessage = {
          type: 'roomCreated',
          roomId,
          yourId: meta.id,
          role: 'player',
          playerSlot: 0,
        };
        send(ws, out);
        return;
      }

      if (msg.type === 'joinRoom') {
        if (meta.roomId) {
          send(ws, { type: 'joinError', message: 'Already in a room' });
          return;
        }
        purgeExpiredEmptyRooms();
        let room = rooms.get(msg.roomId);
        if (!room || isRoomExpiredTombstone(room)) {
          if (room && isRoomExpiredTombstone(room)) {
            clearRoomEmptySchedule(room);
            rooms.delete(msg.roomId);
          }
          send(ws, { type: 'joinError', message: 'Room not found' });
          return;
        }
        if (msg.role === 'player') {
          if (!room.players[0]) {
            room.players[0] = ws;
            meta.roomId = msg.roomId;
            meta.role = 'player';
            meta.playerSlot = 0;
          } else if (!room.players[1]) {
            room.players[1] = ws;
            meta.roomId = msg.roomId;
            meta.role = 'player';
            meta.playerSlot = 1;
          } else {
            send(ws, { type: 'joinError', message: 'Table is full (2 players)' });
            return;
          }
        } else {
          room.spectators.add(ws);
          meta.roomId = msg.roomId;
          meta.role = 'spectator';
          meta.playerSlot = null;
        }
        reviveRoomOnJoin(room);
        send(ws, {
          type: 'joined',
          roomId: msg.roomId,
          yourId: meta.id,
          role: meta.role,
          playerSlot: meta.playerSlot,
        });
        broadcastRoom(
          msg.roomId,
          {
            type: 'peerJoined',
            id: meta.id,
            role: meta.role,
            playerSlot: meta.playerSlot,
          },
          ws,
        );
        const rAfter = rooms.get(msg.roomId);
        if (rAfter != null && rAfter.boardState != null) {
          send(ws, { type: 'boardState', payload: rAfter.boardState });
        }
        return;
      }

      if (msg.type === 'syncBoard') {
        if (!meta.roomId) return;
        const room = rooms.get(meta.roomId);
        if (!room) return;
        let size = 0;
        try {
          size = JSON.stringify(msg.payload).length;
        } catch {
          return;
        }
        if (size > 4_000_000) return;

        let prevJson = '';
        try {
          prevJson = room.boardState !== null ? JSON.stringify(room.boardState) : '';
        } catch {
          return;
        }
        let nextJson = '';
        try {
          nextJson = JSON.stringify(msg.payload);
        } catch {
          return;
        }
        if (prevJson === nextJson) return;

        room.boardState = msg.payload;
        broadcastRoom(
          meta.roomId,
          { type: 'boardState', payload: room.boardState },
          ws,
        );
        return;
      }

      if (msg.type === 'pointer') {
        if (!meta.roomId) return;
        broadcastRoom(
          meta.roomId,
          {
            type: 'pointer',
            fromId: meta.id,
            boardX: msg.boardX,
            boardY: msg.boardY,
          },
          ws,
        );
        return;
      }

      if (msg.type === 'pingIntent') {
        if (!meta.roomId) return;
        broadcastRoom(
          meta.roomId,
          {
            type: 'peerPingIntent',
            fromId: meta.id,
            boardX: msg.boardX,
            boardY: msg.boardY,
          },
          ws,
        );
        return;
      }

      if (msg.type === 'tableDrag') {
        if (!meta.roomId) return;
        broadcastRoom(
          meta.roomId,
          { type: 'peerTableDrag', fromId: meta.id, drag: msg.drag },
          ws,
        );
        return;
      }

      if (msg.type === 'crystalWalletDelta') {
        if (!meta.roomId) return;
        broadcastRoom(
          meta.roomId,
          {
            type: 'peerCrystalWalletDelta',
            fromId: meta.id,
            slot: msg.slot,
            crystalId: msg.crystalId,
            delta: msg.delta,
          },
          ws,
        );
        return;
      }

      if (msg.type === 'webrtcSignal') {
        if (!meta.roomId) return;
        if (meta.role !== 'player') return;
        broadcastRoomPlayers(
          meta.roomId,
          { type: 'webrtcSignal', fromId: meta.id, payload: msg.payload },
          ws,
        );
        return;
      }
    });

    ws.on('close', () => {
      removeFromRoom(ws);
    });
  });
}

export type StartRoomServerOptions = {
  port: number;
  officialCatalog?: OfficialScenarioCatalog;
};

export async function startRoomServer(options: StartRoomServerOptions): Promise<{
  port: number;
  httpServer: http.Server;
  wss: WebSocketServer;
  officialCatalog: OfficialScenarioCatalog;
  close: () => Promise<void>;
}> {
  const officialCatalog =
    options.officialCatalog ??
    createOfficialScenarioCatalog({
      nowIso: () => new Date().toISOString(),
      storageFilePath:
        process.env.OFFICIAL_SCENARIOS_STORAGE_PATH ??
        path.resolve(process.cwd(), 'server', 'data', 'official-scenarios.json'),
    });

  const wssHolder: { current: WebSocketServer | null } = { current: null };
  const httpServer = http.createServer((req, res) => {
    void handleHttpRequest(req, res, officialCatalog, wssHolder.current!);
  });

  const wss = new WebSocketServer({ server: httpServer });
  wssHolder.current = wss;

  attachRoomSocketHandlers(wss);

  await new Promise<void>((resolve, reject) => {
    const onErr = (err: unknown): void => {
      httpServer.off('error', onErr);
      reject(err);
    };
    httpServer.once('error', onErr);
    httpServer.listen(options.port, '0.0.0.0', () => {
      httpServer.off('error', onErr);
      resolve();
    });
  });

  const addr = httpServer.address();
  const port =
    typeof addr === 'object' && addr !== null && 'port' in addr ? addr.port : options.port;

  return {
    port,
    httpServer,
    wss,
    officialCatalog,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((wsErr) => {
          if (wsErr) {
            reject(wsErr);
            return;
          }
          httpServer.close((httpErr) => {
            if (httpErr) {
              reject(httpErr);
              return;
            }
            clearAllRoomState();
            resolve();
          });
        });
      }),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  void (async () => {
    try {
      const { port } = await startRoomServer({ port: PORT });
      console.log(
        `[mp] room server on http://0.0.0.0:${port} (LAN: http://<your-ip>:${port}) WebSocket same port; emptyRoomTTL=${ROOM_EMPTY_TTL_MS}ms; PUT /api/scenarios/official/:id when SCENARIOS_OFFICIAL_EDIT_ENABLED=true`,
      );
    } catch (e) {
      console.error('[mp] failed to start room server', e);
      process.exitCode = 1;
    }
  })();
}
