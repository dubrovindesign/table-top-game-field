import type { Point } from '../hex';
import type { RemotePeerTableDragPaint, Renderer } from '../renderer';
import {
  pushBoardStateImmediate,
  receiveRemoteBoardState,
  setBoardSyncTransport,
  setMultiplayerBoardSyncActive,
} from './boardSync.ts';
import type { ClientToServerMessage, PlayerSlot, ServerToClientMessage, TableDragState } from './protocol.ts';
import { RoomClient } from './roomClient.ts';
import { createVoicePeer, type VoicePeer } from './voiceChat.ts';
import {
  setTableDragOutboundActive,
  setTableDragOutboundTransport,
} from './tableDragOutbound.ts';

const POINTER_INTERVAL_MS = 1000 / 24;
const PING_CLIENT_COOLDOWN_MS = 300;
const VOICE_OUTPUT_STORAGE_KEY = 'mp-voice-output-device';

/** Set in `wireTableSync`, cleared in `stopTableSync` — cooldown + deps live in `initMultiplayerSession` closure. */
let sendPingIntentAtBoardImpl: ((boardX: number, boardY: number) => void) | null = null;

/** Send a board-space ping marker intent to peers (cooldown-enforced). No-op if offline or not in a room. */
export function sendPingIntentAtBoard(boardX: number, boardY: number): void {
  sendPingIntentAtBoardImpl?.(boardX, boardY);
}

type AudioWithSink = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

function audioSupportsSetSinkId(el: HTMLAudioElement): boolean {
  return typeof (el as AudioWithSink).setSinkId === 'function';
}

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
  /** Входящая дельта кошелька кристаллов от другого клиента (отправитель исключён сервером). */
  onPeerCrystalWalletDelta?: (p: {
    slot: PlayerSlot;
    crystalId: string;
    delta: number;
  }) => void;
  /** Сервер сообщил, что каталог официальных сценариев обновился (для рефреша списка / LWW в UI). */
  onOfficialScenariosUpdated?: (msg: { catalogUpdatedAt: string; changedIds: string[] }) => void;
  /** WebSocket transport connected (used by callers for refresh/poll fallback orchestration). */
  onServerConnectionOpen?: () => void;
  /** WebSocket transport disconnected (used by callers for refresh/poll fallback orchestration). */
  onServerConnectionClose?: () => void;
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

function extractRoomIdFromPastedLink(raw: string): string | null {
  // Accept either a full URL with ?room=… or a bare room id.
  // 1) Try to parse as URL and read the `room` param.
  try {
    const u = new URL(raw);
    const q = u.searchParams.get('room');
    if (q && /^[a-z0-9]{4,16}$/i.test(q)) return q.toLowerCase();
  } catch {
    /* not a URL, fall through */
  }
  // 2) Fall back: regex-scan for room=… anywhere in the string (handles
  //    malformed pastes, e.g. messaging apps that strip the scheme).
  const m = raw.match(/[?&]room=([a-z0-9]{4,16})(?:[&#]|$)/i);
  if (m) return m[1].toLowerCase();
  // 3) Bare id paste.
  if (/^[a-z0-9]{4,16}$/i.test(raw)) return raw.toLowerCase();
  return null;
}

function setRoomInUrl(roomId: string): void {
  const u = new URL(location.href);
  u.searchParams.set('room', roomId);
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

/**
 * Live multiplayer: lobby UI, room join, remote pointers on the renderer.
 */

/** Отправка сообщений в комнату (когда активен wireTableSync). */
let roomClientSend: ((msg: ClientToServerMessage) => void) | null = null;

export function sendRoomClientMessage(msg: ClientToServerMessage): void {
  roomClientSend?.(msg);
}

export function initMultiplayerSession(opts: MultiplayerSessionOptions): void {
  const {
    renderer,
    scheduleRender,
    screenToBoard,
    onViewPlayerSlot,
    onPeerCrystalWalletDelta,
    onOfficialScenariosUpdated,
    onServerConnectionOpen,
    onServerConnectionClose,
    toolbarMount,
  } = opts;
  const client = new RoomClient();

  const toolbarAnchor = document.createElement('div');
  toolbarAnchor.className =
    'mp-toolbar-anchor' + (toolbarMount ? '' : ' mp-toolbar-anchor-standalone');

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'mp-menu-btn mp-menu-btn--text';
  toggleBtn.setAttribute('aria-label', 'Multiplayer');
  toggleBtn.title = 'Multiplayer';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.textContent = 'multiplayer';

  const root = document.createElement('div');
  root.className = 'mp-root mp-popover-hidden';
  root.innerHTML = `
    <div class="mp-panel" data-view="home">
      <div class="mp-title">Мультиплеер</div>
      <p class="mp-hint mp-connect-status mp-hidden" aria-live="polite"></p>
      <button type="button" class="mp-btn mp-btn-primary" data-action="create">Создать стол</button>
      <div class="mp-join-link-row">
        <input
          type="text"
          class="mp-join-link-input"
          data-action="join-link-input"
          placeholder="Вставьте ссылку приглашения"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="mp-btn mp-btn-primary mp-btn-compact" data-action="join-link">Присоединиться за стол</button>
      </div>
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
      <div class="mp-voice-section mp-hidden">
        <div class="mp-subtitle">Голос</div>
        <p class="mp-hint mp-voice-insecure-hint mp-hidden" aria-live="polite"></p>
        <p class="mp-hint mp-voice-status" aria-live="polite"></p>
        <div class="mp-voice-device-row">
          <label class="mp-voice-device-label"
            >Микрофон
            <select class="mp-voice-mic-device" data-action="voice-mic-device" aria-label="Выбор микрофона"></select>
          </label>
          <label class="mp-voice-device-label mp-voice-output-row mp-hidden"
            >Звук собеседника (куда выводить)
            <select
              class="mp-voice-output-device"
              data-action="voice-output-device"
              aria-label="Выход звука"
            ></select>
          </label>
          <p class="mp-hint mp-voice-output-unsupported mp-hidden">
            В этом браузере нельзя выбрать устройство вывода — используется системный выход по умолчанию.
          </p>
          <button type="button" class="mp-btn mp-btn-ghost mp-voice-refresh-mics" data-action="voice-refresh-mics">
            Обновить списки устройств
          </button>
        </div>
        <button type="button" class="mp-btn mp-btn-primary" data-action="voice-mic-on">Включить микрофон</button>
        <button type="button" class="mp-btn mp-hidden" data-action="voice-mic-off">Выключить микрофон</button>
        <button type="button" class="mp-btn mp-hidden" data-action="voice-unblock-play">
          Включить воспроизведение собеседника
        </button>
        <label class="mp-voice-mute-label mp-hidden"><input type="checkbox" data-action="voice-mute" /> Заглушить мой голос</label>
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

  const remoteVoiceAudio = document.createElement('audio');
  remoteVoiceAudio.setAttribute('playsinline', '');
  remoteVoiceAudio.autoplay = true;
  remoteVoiceAudio.className = 'mp-voice-remote-audio';
  document.body.appendChild(remoteVoiceAudio);

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
  let myRole: 'player' | 'spectator' | null = null;
  let myPlayerSlot: PlayerSlot | null = null;
  /** Other seated players (by connection id), for voice host negotiation. */
  const remoteSeatPlayerIds = new Set<string>();
  /** Slot 1 never receives peerJoined for the host; cleared when host leaves (peerLeft). */
  let hostPresentForSlot1Guest = false;
  let voicePeer: VoicePeer | null = null;
  let voiceUiError = '';
  let remoteVoicePlayBlocked = false;

  function syncVoiceInsecureHint(): void {
    const el = root.querySelector('.mp-voice-insecure-hint') as HTMLElement;
    if (!window.isSecureContext) {
      el.classList.remove('mp-hidden');
      el.textContent =
        'С этой страницы (HTTP и не localhost) браузер обычно блокирует микрофон. Откройте игру по HTTPS или с этого компьютера через http://localhost. Для двух разных ПК в LAN поднимите HTTPS (например Caddy + mkcert) или задеплойте на хостинг с TLS.';
    } else {
      el.classList.add('mp-hidden');
    }
  }

  function syncOutputDeviceRowVisibility(): void {
    const row = root.querySelector('.mp-voice-output-row') as HTMLElement;
    const unsup = root.querySelector('.mp-voice-output-unsupported') as HTMLElement;
    const ok = audioSupportsSetSinkId(remoteVoiceAudio);
    row.classList.toggle('mp-hidden', !ok);
    unsup.classList.toggle('mp-hidden', ok);
  }

  async function applyRemoteOutputSinkFromSelect(): Promise<void> {
    if (!audioSupportsSetSinkId(remoteVoiceAudio)) return;
    const sel = root.querySelector('.mp-voice-output-device') as HTMLSelectElement;
    const id = sel.value;
    if (!id) {
      try {
        await (remoteVoiceAudio as AudioWithSink).setSinkId!('');
      } catch {
        /* Chromium: '' = системный выход по умолчанию; иначе пропускаем */
      }
      try {
        sessionStorage.removeItem(VOICE_OUTPUT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await (remoteVoiceAudio as AudioWithSink).setSinkId!(id);
      try {
        sessionStorage.setItem(VOICE_OUTPUT_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
    } catch {
      voiceUiError = 'Не удалось переключить выход звука. Выберите другой в списке.';
      updateVoiceUi();
    }
  }

  async function refreshVoiceDeviceLists(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === 'audioinput');
      const outputs = list.filter((d) => d.kind === 'audiooutput');
      const selMic = root.querySelector('.mp-voice-mic-device') as HTMLSelectElement;
      const prevMic = selMic.value;
      selMic.textContent = '';
      const defMic = document.createElement('option');
      defMic.value = '';
      defMic.textContent = 'По умолчанию';
      selMic.appendChild(defMic);
      for (const d of inputs) {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent =
          d.label && d.label.length > 0
            ? d.label
            : `Микрофон (${d.deviceId.slice(0, 6)}…)`;
        selMic.appendChild(o);
      }
      if (prevMic && [...selMic.options].some((opt) => opt.value === prevMic)) {
        selMic.value = prevMic;
      }

      syncOutputDeviceRowVisibility();
      const selOut = root.querySelector('.mp-voice-output-device') as HTMLSelectElement;
      const prevOut = selOut.value;
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(VOICE_OUTPUT_STORAGE_KEY);
      } catch {
        stored = null;
      }
      selOut.textContent = '';
      const defOut = document.createElement('option');
      defOut.value = '';
      defOut.textContent = 'По умолчанию';
      selOut.appendChild(defOut);
      for (const d of outputs) {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent =
          d.label && d.label.length > 0
            ? d.label
            : `Выход (${d.deviceId.slice(0, 6)}…)`;
        selOut.appendChild(o);
      }
      const restore = stored && [...selOut.options].some((opt) => opt.value === stored);
      if (restore) {
        selOut.value = stored!;
      } else if (prevOut && [...selOut.options].some((opt) => opt.value === prevOut)) {
        selOut.value = prevOut;
      }
    } catch {
      /* ignore */
    }
  }

  function hasRemoteSeatPlayer(): boolean {
    if (myPlayerSlot === 0) return remoteSeatPlayerIds.size > 0;
    if (myPlayerSlot === 1) return hostPresentForSlot1Guest || remoteSeatPlayerIds.size > 0;
    return false;
  }

  function syncVoiceSectionVisibility(): void {
    const sec = root.querySelector('.mp-voice-section') as HTMLElement;
    sec.classList.toggle('mp-hidden', myRole !== 'player');
  }

  function updateVoiceUi(): void {
    syncVoiceSectionVisibility();
    syncVoiceInsecureHint();
    const statusEl = root.querySelector('.mp-voice-status') as HTMLElement;
    const btnOn = root.querySelector('[data-action="voice-mic-on"]') as HTMLButtonElement;
    const btnOff = root.querySelector('[data-action="voice-mic-off"]') as HTMLButtonElement;
    const btnUnblock = root.querySelector(
      '[data-action="voice-unblock-play"]',
    ) as HTMLButtonElement;
    const muteLabel = root.querySelector('.mp-voice-mute-label') as HTMLElement;
    const muteInput = muteLabel.querySelector('input') as HTMLInputElement;
    if (myRole !== 'player') return;

    btnUnblock.classList.toggle('mp-hidden', !remoteVoicePlayBlocked);

    if (!voicePeer || !voicePeer.hasLocalMic) {
      statusEl.textContent =
        voiceUiError ||
        'Включите микрофон для разговора со вторым игроком (нужен доступ браузера).';
      btnOn.classList.remove('mp-hidden');
      btnOff.classList.add('mp-hidden');
      muteLabel.classList.add('mp-hidden');
      muteInput.checked = false;
      return;
    }

    btnOn.classList.add('mp-hidden');
    btnOff.classList.remove('mp-hidden');
    muteLabel.classList.remove('mp-hidden');

    if (voiceUiError) {
      statusEl.textContent = voiceUiError;
      return;
    }

    if (!hasRemoteSeatPlayer()) {
      statusEl.textContent = 'Микрофон вкл. Ожидаем второго игрока за столом.';
      return;
    }

    const cs = voicePeer.getConnectionState();
    if (cs === 'connected') {
      statusEl.textContent = remoteVoicePlayBlocked
        ? 'Связь есть, но браузер заглушил звук. Нажмите «Включить воспроизведение собеседника».'
        : 'Голосовая связь установлена.';
    } else if (cs === 'connecting' || cs === 'new') {
      statusEl.textContent = 'Подключение голоса…';
    } else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
      statusEl.textContent =
        'Связь прервана. Выключите микрофон и включите снова или обновите страницу.';
    } else {
      statusEl.textContent = 'Микрофон вкл. Устанавливаем соединение…';
    }
  }

  function getOrCreateVoicePeer(): VoicePeer | null {
    if (myRole !== 'player' || myPlayerSlot === null || !myId) return null;
    if (!voicePeer) {
      voicePeer = createVoicePeer({
        myId,
        localPlayerSlot: myPlayerSlot,
        send: (m) => {
          client.send(m);
        },
        remoteAudio: remoteVoiceAudio,
        hasRemotePlayer: hasRemoteSeatPlayer,
        onRemotePlayBlocked: () => {
          remoteVoicePlayBlocked = true;
          updateVoiceUi();
        },
        onRemotePlaybackStarted: () => {
          remoteVoicePlayBlocked = false;
          updateVoiceUi();
        },
        onRemoteStreamAttached: () => applyRemoteOutputSinkFromSelect(),
      });
    }
    return voicePeer;
  }

  function tearDownVoice(): void {
    voicePeer?.dispose();
    voicePeer = null;
    voiceUiError = '';
    remoteVoicePlayBlocked = false;
    const muteInput = root.querySelector(
      '.mp-voice-mute-label input',
    ) as HTMLInputElement | null;
    if (muteInput) muteInput.checked = false;
    updateVoiceUi();
  }

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('input[data-action="voice-mute"]')) {
      voicePeer?.setMicMuted((t as HTMLInputElement).checked);
      return;
    }
    if (t.matches('select[data-action="voice-mic-device"]')) {
      const id = (t as HTMLSelectElement).value;
      if (!voicePeer?.hasLocalMic) return;
      void voicePeer.switchMicrophoneDevice(id || null).catch(() => {
        voiceUiError = 'Не удалось переключить микрофон.';
        updateVoiceUi();
      });
      return;
    }
    if (t.matches('select[data-action="voice-output-device"]')) {
      void applyRemoteOutputSinkFromSelect().then(() => {
        void getOrCreateVoicePeer()?.tryPlayRemoteAudio();
        updateVoiceUi();
      });
    }
  });

  let voiceStatePoll: ReturnType<typeof setInterval> | null = null;
  function startVoiceStatePoll(): void {
    if (voiceStatePoll !== null) return;
    voiceStatePoll = window.setInterval(() => {
      if (voicePeer?.hasLocalMic) updateVoiceUi();
    }, 2000);
  }
  function stopVoiceStatePoll(): void {
    if (voiceStatePoll !== null) {
      clearInterval(voiceStatePoll);
      voiceStatePoll = null;
    }
  }
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
  let lastPingIntentSent = 0;
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
    const send = (m: ClientToServerMessage) => {
      client.send(m);
    };
    sendPingIntentAtBoardImpl = (boardX: number, boardY: number): void => {
      if (!Number.isFinite(boardX) || !Number.isFinite(boardY)) return;
      if (!client.connected || !currentRoomId) return;
      const now = performance.now();
      if (now - lastPingIntentSent < PING_CLIENT_COOLDOWN_MS) return;
      lastPingIntentSent = now;
      send({ type: 'pingIntent', boardX, boardY });
    };
    roomClientSend = send;
    setBoardSyncTransport(send);
    setMultiplayerBoardSyncActive(true);
    setTableDragOutboundTransport(send);
    setTableDragOutboundActive(true);
  }

  function stopTableSync(): void {
    sendPingIntentAtBoardImpl = null;
    lastPingIntentSent = 0;
    stopVoiceStatePoll();
    tearDownVoice();
    myRole = null;
    myPlayerSlot = null;
    remoteSeatPlayerIds.clear();
    hostPresentForSlot1Guest = false;
    onViewPlayerSlot?.(null);
    setTableDragOutboundActive(false);
    setTableDragOutboundTransport(null);
    setBoardSyncTransport(null);
    roomClientSend = null;
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
      myRole = 'player';
      myPlayerSlot = msg.playerSlot;
      remoteSeatPlayerIds.clear();
      hostPresentForSlot1Guest = false;
      setRoomInUrl(msg.roomId);
      show('ingame');
      root.querySelector('.mp-ingame-room')!.textContent =
        `Комната ${msg.roomId} — вы хост (игрок 1). Поделитесь ссылкой со вторым игроком.`;
      fillIngameInvite();
      wireTableSync();
      onViewPlayerSlot?.(msg.playerSlot);
      pushBoardStateImmediate();
      startVoiceStatePoll();
      void refreshVoiceDeviceLists().then(() => updateVoiceUi());
      updateVoiceUi();
      return;
    }
    if (msg.type === 'joined') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      myId = msg.yourId;
      currentRoomId = msg.roomId;
      myRole = msg.role;
      myPlayerSlot = msg.playerSlot;
      remoteSeatPlayerIds.clear();
      hostPresentForSlot1Guest =
        msg.role === 'player' && msg.playerSlot === 1;
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
      if (msg.role === 'spectator') {
        tearDownVoice();
      } else {
        startVoiceStatePoll();
        void refreshVoiceDeviceLists().then(() => updateVoiceUi());
      }
      updateVoiceUi();
      return;
    }
    if (msg.type === 'joinError') {
      pendingWsIntent = null;
      clearRoomResponseWatchdog();
      clearConnectStatus();
      alert(msg.message);
      return;
    }
    if (msg.type === 'peerPingIntent') {
      if (msg.fromId === myId) return;
      renderer.spawnPingMarker(msg.boardX, msg.boardY, colorForPeerId(msg.fromId));
      scheduleRender();
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
      if (msg.role === 'player') {
        remoteSeatPlayerIds.delete(msg.id);
      }
      if (myPlayerSlot === 1 && msg.role === 'player' && msg.playerSlot === 0) {
        hostPresentForSlot1Guest = false;
      }
      voicePeer?.resetSession();
      updateVoiceUi();
      applyPointersToRenderer();
      applyPeerTableDragsToRenderer();
      return;
    }
    if (msg.type === 'peerJoined') {
      // Уже сидящие за столом повторно пушат снимок — подстраховка, если первый sync не дошёл.
      if (msg.role === 'player' && msg.id !== myId) {
        remoteSeatPlayerIds.add(msg.id);
      }
      if (
        msg.role === 'player' &&
        myRole === 'player' &&
        myPlayerSlot === 0 &&
        voicePeer?.hasLocalMic
      ) {
        void voicePeer.notifyHostShouldNegotiate().then(() => updateVoiceUi());
      }
      pushBoardStateImmediate();
      scheduleRender();
      updateVoiceUi();
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
    if (msg.type === 'peerCrystalWalletDelta') {
      onPeerCrystalWalletDelta?.({
        slot: msg.slot,
        crystalId: msg.crystalId,
        delta: msg.delta,
      });
      scheduleRender();
      return;
    }
    if (msg.type === 'webrtcSignal') {
      if (myRole !== 'player') return;
      const v = getOrCreateVoicePeer();
      if (v) {
        void v.onServerSignal(msg.fromId, msg.payload).catch((e) => {
          console.warn('[mp] voice signal handler', e);
        });
      }
      return;
    }
    if (msg.type === 'officialScenariosUpdated') {
      onOfficialScenariosUpdated?.(msg);
      return;
    }
    console.warn('[mp] неизвестный тип сообщения сервера', msg);
  }

  function ensureConnectedThen(fn: () => void): void {
    const intentSnapshot = pendingWsIntent;
    const run = (): void => {
      lastPointerSent = 0;
      lastPingIntentSent = 0;
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
        onServerConnectionOpen?.();
        run();
      },
      onClose: () => {
        onServerConnectionClose?.();
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
    if (action === 'join-link') {
      const input = root.querySelector('.mp-join-link-input') as HTMLInputElement;
      const raw = (input.value || '').trim();
      if (!raw) return;
      const roomId = extractRoomIdFromPastedLink(raw);
      if (!roomId) {
        input.classList.add('mp-join-link-input--error');
        const clear = (): void => {
          input.classList.remove('mp-join-link-input--error');
          input.removeEventListener('input', clear);
        };
        input.addEventListener('input', clear);
        return;
      }
      // Navigate to the current origin with ?room=<id>. The existing init code
      // detects the param on load and opens the join-gate dialog, reusing the
      // whole existing join flow unchanged.
      const target = new URL(location.href);
      target.searchParams.set('room', roomId);
      location.href = target.toString();
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
    if (action === 'voice-mic-on') {
      voiceUiError = '';
      const v = getOrCreateVoicePeer();
      if (!v) return;
      const sel = root.querySelector('.mp-voice-mic-device') as HTMLSelectElement;
      const deviceId = sel.value.length > 0 ? sel.value : undefined;
      void v
        .startMicrophone(deviceId)
        .then(() => {
          void refreshVoiceDeviceLists().then(() => updateVoiceUi());
          updateVoiceUi();
        })
        .catch((err: unknown) => {
          const name =
            err && typeof err === 'object' && 'name' in err
              ? String((err as DOMException).name)
              : '';
          if (!window.isSecureContext) {
            voiceUiError =
              'Нужен HTTPS или localhost. По http://192.168… браузер не даст микрофон — задеплойте с TLS или поднимите локальный HTTPS.';
          } else if (name === 'NotAllowedError') {
            voiceUiError =
              'Доступ к микрофону запрещён. Разрешите доступ в настройках сайта/браузера.';
          } else if (name === 'NotFoundError') {
            voiceUiError =
              'Микрофон не найден. Обновите список устройств и выберите другой.';
          } else {
            voiceUiError = 'Не удалось включить микрофон.';
          }
          updateVoiceUi();
        });
      return;
    }
    if (action === 'voice-refresh-mics') {
      void refreshVoiceDeviceLists().then(() => updateVoiceUi());
      return;
    }
    if (action === 'voice-unblock-play') {
      void (async () => {
        await applyRemoteOutputSinkFromSelect();
        const v = getOrCreateVoicePeer();
        const ok = v ? await v.tryPlayRemoteAudio() : await remoteVoiceAudio.play().then(() => true).catch(() => false);
        if (ok) {
          remoteVoicePlayBlocked = false;
        } else {
          voiceUiError = 'Браузер не разрешил воспроизведение. Попробуйте ещё раз.';
        }
        updateVoiceUi();
      })();
      return;
    }
    if (action === 'voice-mic-off') {
      voiceUiError = '';
      tearDownVoice();
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
