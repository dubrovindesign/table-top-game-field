import type { ClientToServerMessage } from './protocol.ts';
import { EMPTY_TABLE_DRAG, type TableDragState } from './protocol.ts';

const MOVE_THROTTLE_MS = 42;

let sendFn: ((msg: ClientToServerMessage) => void) | null = null;
let active = false;
let lastSentJson = '';
let lastSendMs = 0;

export function setTableDragOutboundTransport(
  send: ((msg: ClientToServerMessage) => void) | null,
): void {
  sendFn = send;
  if (!send) {
    active = false;
    lastSentJson = '';
    lastSendMs = 0;
  }
}

export function setTableDragOutboundActive(on: boolean): void {
  active = on && sendFn !== null;
  if (!active) {
    if (sendFn && lastSentJson !== '' && lastSentJson !== JSON.stringify(EMPTY_TABLE_DRAG)) {
      sendFn({ type: 'tableDrag', drag: EMPTY_TABLE_DRAG });
    }
    lastSentJson = '';
    lastSendMs = 0;
  }
}

/**
 * Call each animation frame while in a room. Sends `tableDrag` when state changes,
 * throttling in-kind moves to ~24 Hz.
 */
export function tickTableDragOutbound(capture: () => TableDragState): void {
  if (!active || !sendFn) return;
  const d = capture();
  const j = JSON.stringify(d);
  if (j === lastSentJson) return;

  const now = performance.now();
  let prev: TableDragState | null = null;
  try {
    prev = lastSentJson ? (JSON.parse(lastSentJson) as TableDragState) : null;
  } catch {
    prev = null;
  }

  const kindOrIndexChanged =
    !prev ||
    prev.kind !== d.kind ||
    prev.index !== d.index ||
    (d.kind === 'none') !== (prev.kind === 'none');

  if (!kindOrIndexChanged && d.kind !== 'none' && now - lastSendMs < MOVE_THROTTLE_MS) {
    return;
  }

  sendFn({ type: 'tableDrag', drag: d });
  lastSentJson = j;
  lastSendMs = now;
}
