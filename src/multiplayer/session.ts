import type { Point } from '../hex';
import type { RemotePeerTableDragPaint, Renderer } from '../renderer';
import {
  pushBoardStateImmediate,
  receiveRemoteBoardState,
  setBoardSyncTransport,
  setMultiplayerBoardSyncActive,
} from './boardSync.ts';
import type { PlayerSlot, ServerToClientMessage, TableDragState } from './protocol.ts';
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
  /**
   * Local board view: `1` = rotate field 180° for opposite seat; `0`/`null` = default.
   * Call with `null` when leaving the room (spectator or disconnect).
   */
  onViewPlayerSlot?: (slot: PlayerSlot | null) => void;
  /**
   * Контейнер для кнопки «Мультиплеер» в одном ряду с другими кнопками (например панель армии).
   * Если не задан — кнопка и всплывающая панель закрепляются в правом верхнем углу.
   */
  toolbarMount?: HTMLElement;
};

function defaultWsUrl(): string {
  const fromEnv = import.meta.env.VITE_MP_WS_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Same-origin path → vite.config proxy → 127.0.0.1:3333 (roomServer). Avoids localhost/LAN/IPv6 mismatches.
  if (typeof location.host === 'string' && location.host.length > 0) {
    return `${proto}//${location.host}/__mp_ws`;
  }
  return `${proto}//127.0.0.1:3333`;
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
  const { renderer, scheduleRender, screenToBoard, onViewPlayerSlot, toolbarMount } = opts;
  const client = new RoomClient();

  const toolbarAnchor = document.createElement('div');
  toolbarAnchor.className =
    'mp-toolbar-anchor' + (toolbarMount ? '' : ' mp-toolbar-anchor-standalone');

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'mp-menu-btn';
  toggleBtn.setAttribute('aria-label', 'Мультиплеер');
  toggleBtn.title = 'Мультиплеер';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.innerHTML = `<svg class="mp-menu-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.87 2.13 7.13 2.13 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 7.14 8.87 7.14 5 13z"/></svg>`;

  const root = document.createElement('div');
  root.className = 'mp-root mp-popover-hidden';
  root.innerHTML = `
    <div class="mp-panel" data-view="home">
      <div class="mp-title">Мультиплеер</div>
      <p class="mp-hint">WebSocket: <code class="mp-ws-url"></code></p>
      <p class="mp-hint mp-connect-status mp-hidden" aria-live="polite"></p>
      <button type="button" class="mp-btn mp-btn-primary" data-action="create">Создать стол</button>
      <p class="mp-hint mp-lan-hint"></p>
    </div>
    <div class="mp-panel mp-hidden" data-view="join">
      <div class="mp-title" id="mp-join-gate-title">Комната <code class="mp-room-id"></code></div>
      <p class="mp-hint mp-join-gate-hint">Выберите роль, чтобы открыть стол. Поле снизу будет недоступно, пока вы не присоединитесь.</p>
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

  let popoverOpen = false;
  function setPopoverOpen(open: boolean): void {
    popoverOpen = open;
    root.classList.toggle('mp-popover-hidden', !open);
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  const joinGate = document.createElement('div');
  joinGate.className = 'mp-join-gate mp-hidden';
  joinGate.setAttribute('role', 'dialog');
  joinGate.setAttribute('aria-modal', 'true');
  joinGate.setAttribute('aria-labelledby', 'mp-join-gate-title');
  joinGate.innerHTML =
    '<div class="mp-join-gate-backdrop" aria-hidden="true"></div><div class="mp-join-gate-dialog"></div>';
  const joinGateDialog = joinGate.querySelector('.mp-join-gate-dialog') as HTMLElement;

  toolbarAnchor.appendChild(toggleBtn);
  toolbarAnchor.appendChild(root);
  if (toolbarMount) {
    toolbarMount.appendChild(toolbarAnchor);
  } else {
    document.body.appendChild(toolbarAnchor);
  }
  document.body.appendChild(joinGate);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPopoverOpen(!popoverOpen);
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!popoverOpen) return;
      if (toolbarAnchor.contains(e.target as Node)) return;
      setPopoverOpen(false);
    },
    true,
  );

  const wsUrl = defaultWsUrl();
  root.querySelector('.mp-ws-url')!.textContent = wsUrl;

  const lanHint = root.querySelector('.mp-lan-hint') as HTMLElement;
  lanHint.textContent =
    'Сервер комнат: npm run dev:server (порт 3333). Страница подключается через прокси /__mp_ws к 127.0.0.1:3333. ' +
    'Другой игрок: тот же Wi‑Fi, ссылка с ?room=…';

  const views = {
    home: root.querySelector('[data-view="home"]') as HTMLElement,
    join: root.querySelector('[data-view="join"]') as HTMLElement,
    ingame: root.querySelector('[data-view="ingame"]') as HTMLElement,
  };

  function show(view: keyof typeof views): void {
    for (const v of Object.values(views)) v.classList.add('mp-hidden');
    views[view].classList.remove('mp-hidden');
  }

  function reparentJoinPanelToGate(): void {
    if (views.join.parentElement !== joinGateDialog) {
      joinGateDialog.appendChild(views.join);
    }
  }

  function dismissJoinGate(): void {
    joinGate.classList.add('mp-hidden');
    if (views.join.parentElement === joinGateDialog) {
      root.insertBefore(views.join, views.ingame);
    }
  }

  let myId: string | null = null;
  let currentRoomId: string | null = null;
  /** Set when user starts create/join; cleared on success or onClose. Used to explain silent WS failures. */
  let pendingWsIntent: 'create' | 'joinPlayer' | 'joinSpectator' | null = null;
  let roomResponseWatchdog: ReturnType<typeof setTimeout> | null = null;
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

  const connectStatusEl = root.querySelector('.mp-connect-status') as HTMLElement;
  function setConnectStatus(text: string, visible: boolean): void {
    connectStatusEl.textContent = text;
    connectStatusEl.classList.toggle('mp-hidden', !visible);
  }

  function clearConnectStatus(): void {
    setConnectStatus('', false);
  }

  function clearRoomResponseWatchdog(): void {
    if (roomResponseWatchdog !== null) {
      clearTimeout(roomResponseWatchdog);
      roomResponseWatchdog = null;
    }
  }

  /** If TCP connects but peer is not our roomServer, we never get roomCreated / joined. */
  function armRoomResponseWatchdog(expectedIntent: typeof pendingWsIntent): void {
    clearRoomResponseWatchdog();
    if (
      expectedIntent !== 'create' &&
      expectedIntent !== 'joinPlayer' &&
      expectedIntent !== 'joinSpectator'
    ) {
      return;
    }
    roomResponseWatchdog = window.setTimeout(() => {
      roomResponseWatchdog = null;
      if (currentRoomId !== null) return;
      if (pendingWsIntent !== expectedIntent) return;
      pendingWsIntent = null;
      const short =
        'Сервер не ответил roomCreated/joined — на :3333 часто другая служба, не roomServer.';
      const detail =
        `${short}\n\n` +
        'Запустите из корня проекта: npm run dev:server\n' +
        'или задайте VITE_MP_WS_URL на нужный ws://… в .env';
      setConnectStatus(short, true);
      window.alert(`${detail}\n\nТекущий URL: ${wsUrl}`);
    }, 5000);
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
    onViewPlayerSlot?.(null);
    setTableDragOutboundActive(false);
    setTableDragOutboundTransport(null);
    setBoardSyncTransport(null);
    setMultiplayerBoardSyncActive(false);
    peerTableDragById.clear();
    renderer.setRemotePeerTableDrags([]);
    scheduleRender();
  }

  function onServerMessage(msg: ServerToClientMessage): void {
    try {
      dispatchServerMessage(msg);
    } catch (e) {
      console.error('[mp] onServerMessage handler failed', e);
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      setConnectStatus('Ошибка при обработке ответа сервера (см. консоль).', true);
      window.alert(
        `Внутренняя ошибка клиента при разборе ответа мультиплеера.\nПодробности в консоли (F12).\n\n${String(e)}`,
      );
    }
  }

  function dispatchServerMessage(msg: ServerToClientMessage): void {
    if (msg.type === 'pong') {
      return;
    }
    if (msg.type === 'roomCreated') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      myId = msg.yourId;
      currentRoomId = msg.roomId;
      setRoomInUrl(msg.roomId);
      show('ingame');
      root.querySelector('.mp-ingame-room')!.textContent =
        `Комната ${msg.roomId} — вы хост (игрок 1). Поделитесь ссылкой со вторым игроком.`;
      fillIngameInvite();
      wireTableSync();
      onViewPlayerSlot?.(msg.playerSlot);
      pushBoardStateImmediate();
      return;
    }
    if (msg.type === 'joined') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      myId = msg.yourId;
      currentRoomId = msg.roomId;
      setRoomInUrl(msg.roomId);
      show('ingame');
      dismissJoinGate();
      const roleLabel =
        msg.role === 'spectator'
          ? 'зритель'
          : `игрок ${msg.playerSlot === null ? '?' : msg.playerSlot + 1}`;
      root.querySelector('.mp-ingame-room')!.textContent = `Комната ${msg.roomId} · ${roleLabel}`;
      fillIngameInvite();
      wireTableSync();
      onViewPlayerSlot?.(msg.role === 'spectator' ? null : msg.playerSlot);
      return;
    }
    if (msg.type === 'joinError') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
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
    console.warn('[mp] неизвестный тип сообщения сервера', msg);
  }

  function ensureConnectedThen(fn: () => void): void {
    const intentSnapshot = pendingWsIntent;
    const run = (): void => {
      lastPointerSent = 0;
      clearConnectStatus();
      fn();
      armRoomResponseWatchdog(intentSnapshot);
    };
    if (client.connected) {
      run();
      return;
    }
    setConnectStatus('Подключение к серверу комнат…', true);
    client.connect(wsUrl, {
      onOpen: () => {
        run();
      },
      onClose: () => {
        const intent = pendingWsIntent;
        const hadRoom = currentRoomId !== null;
        pendingWsIntent = null;
        clearRoomResponseWatchdog();
        clearConnectStatus();
        stopTableSync();
        clearPointers();
        myId = null;
        currentRoomId = null;
        dismissJoinGate();
        show('home');
        if (intent !== null && !hadRoom) {
          window.alert(
            `Не удалось удержать соединение с сервером комнат:\n${wsUrl}\n\n` +
              'Частая причина: запущен только превью статики (vite preview), а процесс WebSocket не поднят.\n\n' +
              'Запустите в проекте: npm run dev:server\nили полностью: npm run dev\n' +
              '(для production-сборки с комнатами: npm run preview:mp)',
          );
        }
      },
      onServerMessage: onServerMessage,
    });
  }

  function onMpRootClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'create') {
      pendingWsIntent = 'create';
      ensureConnectedThen(() => {
        client.send({ type: 'createRoom' });
      });
      return;
    }
    if (action === 'join-player') {
      const id = getRoomFromUrl();
      if (!id) return;
      pendingWsIntent = 'joinPlayer';
      ensureConnectedThen(() => {
        client.send({ type: 'joinRoom', roomId: id, role: 'player' });
      });
      return;
    }
    if (action === 'join-spectator') {
      const id = getRoomFromUrl();
      if (!id) return;
      pendingWsIntent = 'joinSpectator';
      ensureConnectedThen(() => {
        client.send({ type: 'joinRoom', roomId: id, role: 'spectator' });
      });
      return;
    }
    if (action === 'back') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      dismissJoinGate();
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
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      stopTableSync();
      client.disconnect();
      clearPointers();
      dismissJoinGate();
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      show('home');
    }
  }

  root.addEventListener('click', onMpRootClick);
  joinGate.addEventListener('click', onMpRootClick);

  window.addEventListener('pointermove', (e) => {
    if (!currentRoomId || !client.connected) return;
    sendPointerThrottled(e.clientX, e.clientY);
  });

  const roomParam = getRoomFromUrl();
  if (roomParam) {
    (root.querySelector('.mp-room-id') as HTMLElement).textContent = roomParam;
    reparentJoinPanelToGate();
    joinGate.classList.remove('mp-hidden');
    show('join');
    setPopoverOpen(false);
  } else {
    show('home');
    setPopoverOpen(false);
  }
}
