/**
 * Minimal multiplayer room server: create/join room, broadcast pointers.
 * Run: npm run dev:server  (listens on 0.0.0.0:PORT)
 */

import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerToClientMessage } from '../src/multiplayer/protocol.ts';
import { parseClientMessage } from '../src/multiplayer/protocol.ts';

const PORT = Number(process.env.MP_PORT ?? 3333);

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
};

const rooms = new Map<string, Room>();
const wsMeta = new WeakMap<WebSocket, Attached>();

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
  broadcastRoom(
    m.roomId,
    {
      type: 'peerLeft',
      id: leftId,
      role: leftRole,
      playerSlot: leftSlot,
    },
    ws,
  );

  const empty =
    room.players[0] === null &&
    room.players[1] === null &&
    room.spectators.size === 0;
  if (empty) rooms.delete(m.roomId);

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

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

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
      let roomId = genRoomId();
      while (rooms.has(roomId)) roomId = genRoomId();
      const room: Room = {
        players: [ws, null],
        spectators: new Set(),
        boardState: null,
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
      const room = rooms.get(msg.roomId);
      if (!room) {
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

    if (msg.type === 'tableDrag') {
      if (!meta.roomId) return;
      broadcastRoom(
        meta.roomId,
        { type: 'peerTableDrag', fromId: meta.id, drag: msg.drag },
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

console.log(`[mp] WebSocket room server on ws://0.0.0.0:${PORT} (LAN: ws://<your-ip>:${PORT})`);
