import type { ClientToServerMessage, ServerToClientMessage } from './protocol.ts';

export type RoomClientHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onServerMessage?: (msg: ServerToClientMessage) => void;
};

/**
 * Thin WebSocket wrapper for room server messages.
 */
export class RoomClient {
  private ws: WebSocket | null = null;
  private handlers: RoomClientHandlers = {};

  connect(url: string, handlers: RoomClientHandlers): void {
    this.disconnect();
    this.handlers = handlers;
    const ws = new WebSocket(url);
    this.ws = ws;
    // Ignore events from a socket we already replaced (disconnect → new connect).
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.handlers.onOpen?.();
    });
    ws.addEventListener('close', () => {
      // Drop stale closes (replaced socket still connecting). If `disconnect()` already
      // nulled `this.ws`, still run onClose for this socket once.
      if (this.ws !== null && this.ws !== ws) return;
      if (this.ws === ws) this.ws = null;
      this.handlers.onClose?.();
    });
    ws.addEventListener('error', () => {
      // Cleanup runs on `close`; do not touch `this.ws` here (avoids wiping a newer socket).
    });
    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return;
      const raw = String(ev.data);
      try {
        const msg = JSON.parse(raw) as ServerToClientMessage;
        if (msg && typeof msg === 'object' && 'type' in msg) {
          this.handlers.onServerMessage?.(msg);
        } else {
          console.warn('[mp] WebSocket message without type', raw.slice(0, 200));
        }
      } catch (e) {
        console.warn('[mp] WebSocket non-JSON or parse error', raw.slice(0, 200), e);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientToServerMessage): void {
    if (!this.connected || !this.ws) return;
    this.ws.send(JSON.stringify(msg));
  }
}
