/**
 * WebSocket messages for room + live pointers (shared client/server contract).
 */

export type PlayerSlot = 0 | 1;

/** Live drag under cursor (board/world space) — for remote ghost preview. */
export type TableDragKind =
  | 'none'
  | 'unit'
  | 'big'
  | 'large'
  | 'huge'
  | 'terrain'
  | 'ether'
  | 'godLoose';

export type TableDragState = {
  kind: TableDragKind;
  index: number | null;
  worldX: number | null;
  worldY: number | null;
  overQ: number | null;
  overR: number | null;
};

export const EMPTY_TABLE_DRAG: TableDragState = {
  kind: 'none',
  index: null,
  worldX: null,
  worldY: null,
  overQ: null,
  overR: null,
};

export type ClientToServerMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomId: string; role: 'player' | 'spectator' }
  | { type: 'pointer'; boardX: number; boardY: number }
  | { type: 'tableDrag'; drag: TableDragState }
  | { type: 'syncBoard'; payload: object }
  | { type: 'ping'; t: number };

export type ServerToClientMessage =
  | {
      type: 'roomCreated';
      roomId: string;
      yourId: string;
      role: 'player';
      playerSlot: PlayerSlot;
    }
  | {
      type: 'joined';
      roomId: string;
      yourId: string;
      role: 'player' | 'spectator';
      playerSlot: PlayerSlot | null;
    }
  | { type: 'joinError'; message: string }
  | {
      type: 'pointer';
      fromId: string;
      boardX: number;
      boardY: number;
    }
  | { type: 'peerLeft'; id: string }
  | { type: 'peerJoined'; id: string; role: 'player' | 'spectator'; playerSlot: PlayerSlot | null }
  | { type: 'boardState'; payload: object }
  | { type: 'peerTableDrag'; fromId: string; drag: TableDragState }
  | { type: 'pong'; t: number };

export function parseClientMessage(raw: string): ClientToServerMessage | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const t = (o as { type?: string }).type;
    if (t === 'createRoom') return { type: 'createRoom' };
    if (t === 'joinRoom') {
      const roomId = (o as { roomId?: string }).roomId;
      const role = (o as { role?: string }).role;
      if (typeof roomId !== 'string' || (role !== 'player' && role !== 'spectator')) return null;
      return { type: 'joinRoom', roomId, role };
    }
    if (t === 'pointer') {
      const boardX = (o as { boardX?: number }).boardX;
      const boardY = (o as { boardY?: number }).boardY;
      if (typeof boardX !== 'number' || typeof boardY !== 'number') return null;
      return { type: 'pointer', boardX, boardY };
    }
    if (t === 'tableDrag') {
      const drag = parseTableDragState((o as { drag?: unknown }).drag);
      if (!drag) return null;
      return { type: 'tableDrag', drag };
    }
    if (t === 'syncBoard') {
      const payload = (o as { payload?: unknown }).payload;
      if (payload === null || typeof payload !== 'object') return null;
      return { type: 'syncBoard', payload: payload as object };
    }
    if (t === 'ping') {
      const tt = (o as { t?: number }).t;
      if (typeof tt !== 'number') return null;
      return { type: 'ping', t: tt };
    }
    return null;
  } catch {
    return null;
  }
}

const TABLE_DRAG_KINDS = new Set<TableDragKind>([
  'none',
  'unit',
  'big',
  'large',
  'huge',
  'terrain',
  'ether',
  'godLoose',
]);

function parseTableDragState(raw: unknown): TableDragState | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const kind = d.kind;
  if (typeof kind !== 'string' || !TABLE_DRAG_KINDS.has(kind as TableDragKind)) return null;
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const index =
    d.index === null || d.index === undefined
      ? null
      : typeof d.index === 'number' && Number.isInteger(d.index) && d.index >= 0
        ? d.index
        : null;
  return {
    kind: kind as TableDragKind,
    index,
    worldX: numOrNull(d.worldX),
    worldY: numOrNull(d.worldY),
    overQ: numOrNull(d.overQ),
    overR: numOrNull(d.overR),
  };
}
