import type { Point } from '../hex';
import type { RemotePeerTableDragPaint, Renderer } from '../renderer';
import {
  pushBoardStateImmediate,
  receiveRemoteBoardState,
  setBoardSyncTransport,
  setMultiplayerBoardSyncActive,
} from './boardSync.ts';
import type { ServerToClientMessage, TableDragState } from './protocol.ts';
import { RoomClient } from './roomClient.ts';
import {
  setTableDragOutboundActive,
  setTableDragOutboundTransport,
} from './tableDragOutbound.ts';

const POINTER_INTERVAL_MS = 1000 / 24;

export type MultiplayerSessionOptions = {
  renderer: Renderer;
  scheduleRender: () => void;
  /** Screen coords → same board space as game (e.g. `screenToBoardWorld`). */
  screenToBoard: (sx: number, sy: number) => Point;
};

function defaultWsUrl(): string {
  const fromEnv = import.meta.env.VITE_MP_WS_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.hostname}:3333`;
}

function colorForPeerId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 72% 58%)`;
}

function getRoomFromUrl(): string | null {
  const q = new URLSearchParams(location.search).get('room');
  if (!q || !/^[a-z0-9]{4,16}$/i.test(q)) return null;
  return q.toLowerCase();
}

function setRoomInUrl(roomId: string): void {
  const u = new URL(location.href);
  u.searchParams.set('room', roomId);
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

/**
 * Live multiplayer: lobby UI, room join, remote pointers on the renderer.
 */
export function initMultiplayerSession(opts: MultiplayerSessionOptions): void {
  const { renderer, scheduleRender, screenToBoard } = opts;
  const client = new RoomClient();

  const root = document.createElement('div');
  root.className = 'mp-root';
  root.innerHTML = `
    <div class="mp-panel" data-view="home">
      <div class="mp-title">Мультиплеер</div>
      <p class="mp-hint">WebSocket: <code class="mp-ws-url"></code></p>
      <button type="button" class="mp-btn mp-btn-primary" data-action="create">Создать стол</button>
      <p class="mp-hint mp-lan-hint"></p>
    </div>
    <div class="mp-panel mp-hidden" data-view="join">
      <div class="mp-title">Комната <code class="mp-room-id"></code></div>
      <button type="button" class="mp-btn mp-btn-primary" data-action="join-player">Присоединиться игроком</button>
      <button type="button" class="mp-btn" data-action="join-spectator">Присоединиться зрителем</button>
      <button type="button" class="mp-btn mp-btn-ghost" data-action="back">Назад</button>
    </div>
    <div class="mp-panel mp-hidden" data-view="ingame">
      <div class="mp-title">В сети</div>
      <p class="mp-hint mp-ingame-room"></p>
      <div class="mp-invite-row">
        <input type="text" class="mp-invite-input-ingame" readonly />
        <button type="button" class="mp-btn mp-btn-primary" data-action="copy-again">Копировать ссылку</button>
      </div>
      <button type="button" class="mp-btn mp-btn-danger" data-action="disconnect">Отключиться</button>
    </div>
  `;
  document.body.appendChild(root);

  const wsUrl = defaultWsUrl();
  root.querySelector('.mp-ws-url')!.textContent = wsUrl;

  const lanHint = root.querySelector('.mp-lan-hint') as HTMLElement;
  lanHint.textContent = `Другой игрок: тот же Wi‑Fi, в браузере открыть ссылку с ?room=… (порт Vite и WS см. README).`;

  const views = {
    home: root.querySelector('[data-view="home"]') as HTMLElement,
    join: root.querySelector('[data-view="join"]') as HTMLElement,
    ingame: root.querySelector('[data-view="ingame"]') as HTMLElement,
  };

  function show(view: keyof typeof views): void {
    for (const v of Object.values(views)) v.classList.add('mp-hidden');
    views[view].classList.remove('mp-hidden');
  }

  let myId: string | null = null;
  let currentRoomId: string | null = null;
  const peerPointers = new Map<string, { x: number; y: number; color: string }>();
  const peerTableDragById = new Map<string, TableDragState>();

  function applyPointersToRenderer(): void {
    const list = [...peerPointers.entries()].map(([id, p]) => ({
      boardX: p.x,
      boardY: p.y,
      color: p.color,
      label: id.slice(0, 4),
    }));
    renderer.setRemoteBoardPointers(list);
    scheduleRender();
  }

  function clearPointers(): void {
    peerPointers.clear();
    renderer.setRemoteBoardPointers([]);
    scheduleRender();
  }

  function applyPeerTableDragsToRenderer(): void {
    const list: RemotePeerTableDragPaint[] = [];
    for (const [id, drag] of peerTableDragById) {
      if (drag.kind === 'none') continue;
      list.push({ fromId: id, color: colorForPeerId(id), drag });
    }
    renderer.setRemotePeerTableDrags(list);
    scheduleRender();
  }

  let lastPointerSent = 0;
  function sendPointerThrottled(sx: number, sy: number): void {
    if (!client.connected || !currentRoomId) return;
    const now = performance.now();
    if (now - lastPointerSent < POINTER_INTERVAL_MS) return;
    lastPointerSent = now;
    const p = screenToBoard(sx, sy);
    client.send({ type: 'pointer', boardX: p.x, boardY: p.y });
  }

  function inviteUrl(): string {
    if (!currentRoomId) return location.href;
    const u = new URL(location.href);
    u.searchParams.set('room', currentRoomId);
    return u.toString();
  }

  function fillIngameInvite(): void {
    const input = root.querySelector('.mp-invite-input-ingame') as HTMLInputElement;
    input.value = inviteUrl();
  }

  function wireTableSync(): void {
    setBoardSyncTransport((m) => {
      client.send(m);
    });
    setMultiplayerBoardSyncActive(true);
    setTableDragOutboundTransport((m) => {
      client.send(m);
    });
    setTableDragOutboundActive(true);
  }

  function stopTableSync(): void {
    setTableDragOutboundActive(false);
    setTableDragOutboundTransport(null);
    setBoardSyncTransport(null);
    setMultiplayerBoardSyncActive(false);
    peerTableDragById.clear();
    renderer.setRemotePeerTableDrags([]);
    scheduleRender();
  }

  function onServerMessage(msg: ServerToClientMessage): void {
    if (msg.type === 'roomCreated') {
      myId = msg.yourId;
      currentRoomId = msg.roomId;
      setRoomInUrl(msg.roomId);
      show('ingame');
      root.querySelector('.mp-ingame-room')!.textContent =
        `Комната ${msg.roomId} — вы хост (игрок 1). Поделитесь ссылкой со вторым игроком.`;
      fillIngameInvite();
      wireTableSync();
      pushBoardStateImmediate();
      return;
    }
    if (msg.type === 'joined') {
      myId = msg.yourId;
      currentRoomId = msg.roomId;
      setRoomInUrl(msg.roomId);
      show('ingame');
      const roleLabel =
        msg.role === 'spectator'
          ? 'зритель'
          : `игрок ${msg.playerSlot === null ? '?' : msg.playerSlot + 1}`;
      root.querySelector('.mp-ingame-room')!.textContent = `Комната ${msg.roomId} · ${roleLabel}`;
      fillIngameInvite();
      wireTableSync();
      return;
    }
    if (msg.type === 'joinError') {
      alert(msg.message);
      return;
    }
    if (msg.type === 'pointer') {
      if (msg.fromId === myId) return;
      if (!peerPointers.has(msg.fromId)) {
        peerPointers.set(msg.fromId, {
          x: msg.boardX,
          y: msg.boardY,
          color: colorForPeerId(msg.fromId),
        });
      } else {
        const e = peerPointers.get(msg.fromId)!;
        e.x = msg.boardX;
        e.y = msg.boardY;
      }
      applyPointersToRenderer();
      return;
    }
    if (msg.type === 'peerLeft') {
      peerPointers.delete(msg.id);
      peerTableDragById.delete(msg.id);
      applyPointersToRenderer();
      applyPeerTableDragsToRenderer();
      return;
    }
    if (msg.type === 'peerJoined') {
      // Уже сидящие за столом повторно пушат снимок — подстраховка, если первый sync не дошёл.
      pushBoardStateImmediate();
      scheduleRender();
      return;
    }
    if (msg.type === 'boardState') {
      receiveRemoteBoardState(msg.payload);
      scheduleRender();
      return;
    }
    if (msg.type === 'peerTableDrag') {
      if (msg.fromId === myId) return;
      if (msg.drag.kind === 'none') {
        peerTableDragById.delete(msg.fromId);
      } else {
        peerTableDragById.set(msg.fromId, msg.drag);
      }
      applyPeerTableDragsToRenderer();
      return;
    }
  }

  function ensureConnectedThen(fn: () => void): void {
    if (client.connected) {
      fn();
      return;
    }
    client.connect(wsUrl, {
      onOpen: () => {
        lastPointerSent = 0;
        fn();
      },
      onClose: () => {
        stopTableSync();
        clearPointers();
        myId = null;
        currentRoomId = null;
        show('home');
      },
      onServerMessage: onServerMessage,
    });
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'create') {
      ensureConnectedThen(() => {
        client.send({ type: 'createRoom' });
      });
      return;
    }
    if (action === 'join-player') {
      const id = getRoomFromUrl();
      if (!id) return;
      ensureConnectedThen(() => {
        client.send({ type: 'joinRoom', roomId: id, role: 'player' });
      });
      return;
    }
    if (action === 'join-spectator') {
      const id = getRoomFromUrl();
      if (!id) return;
      ensureConnectedThen(() => {
        client.send({ type: 'joinRoom', roomId: id, role: 'spectator' });
      });
      return;
    }
    if (action === 'back') {
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      show('home');
      return;
    }
    if (action === 'copy-again') {
      fillIngameInvite();
      void navigator.clipboard.writeText(inviteUrl()).then(() => {
        const st = root.querySelector('.mp-ingame-room');
        if (st) {
          const prev = st.textContent;
          st.textContent = 'Ссылка скопирована в буфер.';
          setTimeout(() => {
            st.textContent = prev;
          }, 2000);
        }
      });
      return;
    }
    if (action === 'disconnect') {
      stopTableSync();
      client.disconnect();
      clearPointers();
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      show('home');
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!currentRoomId || !client.connected) return;
    sendPointerThrottled(e.clientX, e.clientY);
  });

  const roomParam = getRoomFromUrl();
  if (roomParam) {
    (root.querySelector('.mp-room-id') as HTMLElement).textContent = roomParam;
    show('join');
  } else {
    show('home');
  }
}
