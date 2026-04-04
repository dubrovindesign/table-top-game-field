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
    ws.addEventListener('open', () => this.handlers.onOpen?.());
    ws.addEventListener('close', () => {
      this.ws = null;
      this.handlers.onClose?.();
    });
    ws.addEventListener('error', () => {
      this.ws = null;
      this.handlers.onClose?.();
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
        if (msg && typeof msg === 'object' && 'type' in msg) {
          this.handlers.onServerMessage?.(msg);
        }
      } catch {
        /* ignore */
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
