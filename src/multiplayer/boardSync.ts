import type { ClientToServerMessage } from './protocol.ts';

type BoardApi = {
  capture: () => unknown;
  apply: (payload: unknown) => void;
};

let api: BoardApi | null = null;
let sendFn: ((msg: ClientToServerMessage) => void) | null = null;
let mpActive = false;
let applyingRemote = false;
let lastSentJson = '';
let dirty = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const TICK_MS = 180;

function flushSend(): void {
  if (!mpActive || applyingRemote || !api || !sendFn) return;
  try {
    const state = api.capture();
    const json = JSON.stringify(state);
    if (json === lastSentJson) return;
    lastSentJson = json;
    sendFn({ type: 'syncBoard', payload: state as object });
  } catch (e) {
    console.error('[mp] flushSend failed (capture/stringify/send)', e);
  }
}

function onTick(): void {
  if (!dirty) return;
  dirty = false;
  flushSend();
}

export function registerBoardSyncApi(a: BoardApi): void {
  api = a;
}

export function setBoardSyncTransport(
  send: ((msg: ClientToServerMessage) => void) | null,
): void {
  sendFn = send;
}

export function setMultiplayerBoardSyncActive(active: boolean): void {
  mpActive = active;
  if (!active) {
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    dirty = false;
    lastSentJson = '';
    return;
  }
  if (tickTimer === null) {
    tickTimer = setInterval(onTick, TICK_MS);
  }
}

/** Mark local board dirty; periodic tick will push if JSON changed. */
export function notifyBoardEditLocal(): void {
  if (!mpActive || applyingRemote) return;
  dirty = true;
}

/** Force push (e.g. host right after creating room). */
export function pushBoardStateImmediate(): void {
  if (!mpActive || applyingRemote || !api || !sendFn) return;
  lastSentJson = '';
  dirty = false;
  flushSend();
  try {
    lastSentJson = JSON.stringify(api.capture());
  } catch (e) {
    console.error('[mp] pushBoardStateImmediate: could not refresh lastSentJson', e);
  }
}

export function receiveRemoteBoardState(payload: unknown): void {
  if (!api) return;
  applyingRemote = true;
  try {
    try {
      api.apply(payload);
      lastSentJson = JSON.stringify(api.capture());
    } catch (e) {
      console.error('[mp] apply remote board failed', e);
    }
  } finally {
    applyingRemote = false;
  }
}

export function isApplyingRemoteBoardState(): boolean {
  return applyingRemote;
}
