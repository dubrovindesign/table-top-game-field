/**
 * Dice rolling UI — slot-machine style animation.
 *
 * Dice colors: red, green, black, white.
 * Each die is a d6 (1–6). The result panel slides up
 * with a spinning slot animation lasting ~2 seconds.
 *
 * Selector: colored dice squares with count inside.
 * Left-click = +1, right-click = −1.
 *
 * After a roll, each result die is clickable for a single reroll.
 * In multiplayer, results and history are split per player slot.
 */

import {
  isBoardMultiplayerSyncActive,
  pushBoardStateImmediate,
} from './multiplayer/boardSync.ts';
import type {
  SerializedSharedDicePerSlotV1,
  SerializedSharedDiceRollRowV1,
  SerializedSharedDiceStateV2,
} from './multiplayer/boardState.ts';
import type { PlayerSlot } from './multiplayer/protocol.ts';
import { silenceAllDiceTickVoices, startDiceTickLoop } from './diceRollAudio.ts';
import { UnitCard, unitMiniatureImageSrc, type UnitCardData } from './unitCard';

// ── Types ──────────────────────────────────────────────────────

export type DieColor = 'red' | 'green' | 'black' | 'white';

/** Цвет кости в результате броска (боевые + кубики состояний). */
type DieResultColor = DieColor | 'state';

interface DieConfig {
  color: DieColor;
  label: string;
  bg: string;
  fg: string;
  border: string;
}

const DIE_CONFIGS: DieConfig[] = [
  { color: 'red', label: 'Red', bg: '#d32f2f', fg: '#ffffff', border: '#b71c1c' },
  { color: 'green', label: 'Green', bg: '#388e3c', fg: '#ffffff', border: '#1b5e20' },
  { color: 'black', label: 'Black', bg: '#424242', fg: '#ffffff', border: '#212121' },
  { color: 'white', label: 'White', bg: '#f5f5f5', fg: '#212121', border: '#bdbdbd' },
];

const STATE_DIE_CONFIG = {
  color: 'state' as const,
  label: 'State',
  bg: 'rgba(90, 70, 120, 0.45)',
  fg: '#f3e8ff',
  border: 'rgba(180, 140, 220, 0.45)',
};

type DieResultConfig = DieConfig | typeof STATE_DIE_CONFIG;

function dieConfigForResultColor(c: DieResultColor): DieResultConfig {
  return c === 'state' ? STATE_DIE_CONFIG : DIE_CONFIGS.find((x) => x.color === c)!;
}

interface DieResult {
  color: DieResultColor;
  config: DieResultConfig;
  value: number;
  rerolled: boolean;
}

interface RollLogEntry {
  dice: { color: DieResultColor; value: number; rerolled: boolean }[];
  rollIndex: number;
  source: UnitCardData | null;
}

interface SlotBucket {
  rollCounter: number;
  rollLog: RollLogEntry[];
  currentDice: DieResult[];
  currentResultSource: UnitCardData | null;
  slotColumns: HTMLElement[];
}

interface SlotDom {
  block: HTMLElement;
  titleEl: HTMLElement;
  logEl: HTMLElement;
  activeEl: HTMLElement;
}

// ── Pip patterns for d6 faces ──────────────────────────────────

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

type RedDieFace = 'miss' | 'hit' | 'crit';
type WhiteDieFace = 'miss' | 'block' | 'critBlock';
type BlackDieFace = 'miss' | 'success';
type GreenDieFace = 'miss' | 'success';

const RED_DIE_FACE_BY_VALUE: Record<number, RedDieFace> = {
  1: 'miss',
  2: 'hit',
  3: 'hit',
  4: 'hit',
  5: 'miss',
  6: 'crit',
};

const RED_DIE_FACE_ASSET: Record<RedDieFace, string> = {
  miss: '/red-dice-miss.svg',
  hit: '/red-dice-hit.svg',
  crit: '/red-dice-crit.svg',
};

const WHITE_DIE_FACE_BY_VALUE: Record<number, WhiteDieFace> = {
  1: 'miss',
  2: 'block',
  3: 'miss',
  4: 'block',
  5: 'miss',
  6: 'critBlock',
};

const WHITE_DIE_FACE_ASSET: Record<WhiteDieFace, string> = {
  miss: '/white-miss.svg',
  block: '/white-block.svg',
  critBlock: '/white-crit-block.svg',
};

const BLACK_DIE_FACE_BY_VALUE: Record<number, BlackDieFace> = {
  1: 'miss',
  2: 'success',
  3: 'miss',
  4: 'miss',
  5: 'success',
  6: 'miss',
};

const BLACK_DIE_FACE_ASSET: Record<BlackDieFace, string> = {
  miss: '/black-miss.svg',
  success: '/black-success.svg',
};

const GREEN_DIE_FACE_BY_VALUE: Record<number, GreenDieFace> = {
  1: 'miss',
  2: 'success',
  3: 'miss',
  4: 'miss',
  5: 'success',
  6: 'miss',
};

const GREEN_DIE_FACE_ASSET: Record<GreenDieFace, string> = {
  miss: '/green-miss.svg',
  success: '/green-success.svg',
};

/** d6 грани кубика состояний: 1–6 → иконка (порядок зафиксирован). */
const STATE_DIE_FACE_BY_VALUE: readonly { value: number; src: string; title: string }[] = [
  { value: 1, src: '/aid.svg', title: '1 — Aid' },
  { value: 2, src: '/bleed.svg', title: '2 — Bleed' },
  { value: 3, src: '/fire.svg', title: '3 — Fire' },
  { value: 4, src: '/panic.svg', title: '4 — Panic' },
  { value: 5, src: '/slow.svg', title: '5 — Slow' },
  { value: 6, src: '/stun.svg', title: '6 — Stun' },
];

function stateFaceSrcForValue(value: number): string {
  const f = STATE_DIE_FACE_BY_VALUE.find((x) => x.value === value);
  return f?.src ?? STATE_DIE_FACE_BY_VALUE[0].src;
}

/** Стартовое и значение после «Сбросить» / «Очистить всё». */
const DEFAULT_STATE_DICE_COUNT = 1;

function perSlotEqual(a: SerializedSharedDicePerSlotV1, b: SerializedSharedDicePerSlotV1): boolean {
  if (a.rollCounter !== b.rollCounter) return false;
  if (a.log.length !== b.log.length) return false;
  for (let i = 0; i < a.log.length; i++) {
    if (!sharedDiceRowEqual(a.log[i], b.log[i])) return false;
  }
  if ((a.active === null) !== (b.active === null)) return false;
  if (a.active && b.active && !sharedDiceRowEqual(a.active, b.active)) return false;
  return true;
}

function sharedDiceV2Equal(a: SerializedSharedDiceStateV2, b: SerializedSharedDiceStateV2): boolean {
  return perSlotEqual(a.bySlot['0'], b.bySlot['0']) && perSlotEqual(a.bySlot['1'], b.bySlot['1']);
}

function sharedDiceRowEqual(
  x: SerializedSharedDiceRollRowV1,
  y: SerializedSharedDiceRollRowV1,
): boolean {
  if (x.rollIndex !== y.rollIndex) return false;
  if (x.sourceName !== y.sourceName || x.sourceSprite !== y.sourceSprite) return false;
  if (x.dice.length !== y.dice.length) return false;
  for (let i = 0; i < x.dice.length; i++) {
    const d = x.dice[i];
    const e = y.dice[i];
    if (d.color !== e.color || d.value !== e.value || d.rerolled !== e.rerolled) return false;
  }
  return true;
}

function minimalDiceSource(name: string | null, sprite: string | null): UnitCardData | null {
  if (!name && !sprite) return null;
  return {
    name: name?.trim() ? name : 'Unit',
    size: 'small',
    health: 1,
    maxHealth: 1,
    defense: {},
    walk: 0,
    run: 0,
    sprite: sprite ?? undefined,
    domains: [],
    concentration: {},
    defenseReaction: {},
    attacks: [],
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function emptyBucket(): SlotBucket {
  return {
    rollCounter: 0,
    rollLog: [],
    currentDice: [],
    currentResultSource: null,
    slotColumns: [],
  };
}

// ── Main class ─────────────────────────────────────────────────

export class DiceRoller {
  private container: HTMLElement;
  /** Column: local crystal wallet mount + dice panel (selector + Roll Dice). */
  private panelColumn: HTMLElement;
  /** Mount for the local player's `CrystalWallet` (above `.dice-panel`, right-aligned). */
  private walletMount: HTMLElement;
  private panel: HTMLElement;
  private selectorRow: HTMLElement;
  private sourceAvatarButton: HTMLButtonElement;
  private sourceAvatarImg: HTMLImageElement;
  private resetButton: HTMLButtonElement;
  private resultsArea: HTMLElement;
  private columnsWrap: HTMLElement;
  private globalActions: HTMLElement;
  private slotDom: Record<PlayerSlot, SlotDom>;
  private bucket: Record<PlayerSlot, SlotBucket> = {
    0: emptyBucket(),
    1: emptyBucket(),
  };
  private counts: Map<DieColor, number> = new Map();
  private diceButtons: Map<DieColor, HTMLElement> = new Map();
  private combatPanel: HTMLElement;
  private statePanel: HTMLElement;
  private combatTabBtn: HTMLButtonElement;
  private stateTabBtn: HTMLButtonElement;
  private stateDiceCount = DEFAULT_STATE_DICE_COUNT;
  private stateCountEl: HTMLElement;
  private stateDiceStrip: HTMLElement;
  private stateRollButton: HTMLButtonElement;
  private stateResetButton: HTMLButtonElement;
  private rollButton: HTMLButtonElement;
  /** True while the local player's roll / reroll animation runs (blocks selector). */
  private myRollAnimating = false;
  private pendingSource: UnitCardData | null = null;
  private hoverSource: UnitCardData | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private altHeld = false;
  private hoverCard: UnitCard;
  private pendingRollFinishBySlot: Record<PlayerSlot, ReturnType<typeof setTimeout> | null> = {
    0: null,
    1: null,
  };
  private pendingRerollBySlot: Record<PlayerSlot, ReturnType<typeof setTimeout> | null> = {
    0: null,
    1: null,
  };
  /** Снимает обработчик клика переброса с колонки (перед сетевым обновлением / пересборкой). */
  private columnRerollAbort = new WeakMap<HTMLElement, AbortController>();
  /** Multiplayer seat for this client; `null` = solo or spectator. */
  private localViewSlot: PlayerSlot | null = null;
  /** Ключи действий карточки, уже добавивших кубики в селектор (сброс при пустом наборе / броске). */
  private usedDiceActionKeys = new Set<string>();
  /** Остановка щелчков анимации (Web Audio). */
  private diceRollTickStop: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
    }

    this.container = el('div', 'dice-container');
    parent.appendChild(this.container);

    this.resultsArea = el('div', 'dice-results');
    this.container.appendChild(this.resultsArea);

    this.columnsWrap = el('div', 'dice-results-columns');
    this.resultsArea.appendChild(this.columnsWrap);

    this.slotDom = {
      0: this.createPlayerBlock(0),
      1: this.createPlayerBlock(1),
    };

    this.globalActions = el('div', 'dice-results-global-actions');
    const globalClear = el('button', 'dice-clear-btn', 'Очистить всё');
    globalClear.type = 'button';
    globalClear.addEventListener('click', () => this.clearAllDiceState());
    this.globalActions.appendChild(globalClear);
    this.resultsArea.appendChild(this.globalActions);
    this.globalActions.classList.add('dice-hidden');

    this.reorderColumns();
    this.refreshDiceLayoutMode();

    this.hoverCard = new UnitCard(document.body);

    this.panel = el('div', 'dice-panel');

    const tabBar = el('div', 'dice-panel-tabs');
    this.combatTabBtn = el('button', 'dice-tab dice-tab-active', 'Боевые кубики');
    this.combatTabBtn.type = 'button';
    this.stateTabBtn = el('button', 'dice-tab', 'Кубики состояний');
    this.stateTabBtn.type = 'button';
    tabBar.appendChild(this.combatTabBtn);
    tabBar.appendChild(this.stateTabBtn);
    this.panel.appendChild(tabBar);

    this.combatTabBtn.addEventListener('click', () => this.setDiceTab('combat'));
    this.stateTabBtn.addEventListener('click', () => this.setDiceTab('state'));

    this.combatPanel = el('div', 'dice-tab-panel');
    this.statePanel = el('div', 'dice-tab-panel dice-hidden');

    this.selectorRow = el('div', 'dice-selector-row');
    this.combatPanel.appendChild(this.selectorRow);

    this.sourceAvatarButton = el('button', 'dice-source-avatar');
    this.sourceAvatarButton.type = 'button';
    this.sourceAvatarButton.title = 'Dice source unit';
    this.sourceAvatarImg = el('img', 'dice-source-avatar-img');
    this.sourceAvatarButton.appendChild(this.sourceAvatarImg);
    this.sourceAvatarButton.classList.add('dice-source-avatar-hidden');
    this.selectorRow.appendChild(this.sourceAvatarButton);

    for (const dc of DIE_CONFIGS) {
      const btn = el('div', 'dice-cube');
      btn.style.backgroundColor = dc.bg;
      btn.style.borderColor = dc.border;
      btn.style.color = dc.fg;
      btn.title = `${dc.label} dice — LMB: +1, RMB: −1`;

      const countEl = el('span', 'dice-cube-count', '0');
      btn.appendChild(countEl);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.adjustCount(dc.color, 1);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.adjustCount(dc.color, -1);
      });

      this.diceButtons.set(dc.color, countEl);
      this.selectorRow.appendChild(btn);
    }

    this.rollButton = el('button', 'dice-roll-btn', 'Roll Dice');
    this.rollButton.addEventListener('click', () => this.roll());
    this.combatPanel.appendChild(this.rollButton);

    this.resetButton = el('button', 'dice-reset-btn', 'Reset');
    this.resetButton.addEventListener('click', () => this.resetSelector());
    this.combatPanel.appendChild(this.resetButton);

    this.panel.appendChild(this.combatPanel);

    const stateRow = el('div', 'dice-state-row');
    const stateCountBtn = el('div', 'dice-cube dice-state-counter');
    stateCountBtn.title = 'Количество кубиков — ЛКМ: +1, ПКМ: −1';
    this.stateCountEl = el('span', 'dice-cube-count', String(DEFAULT_STATE_DICE_COUNT));
    stateCountBtn.appendChild(this.stateCountEl);
    stateCountBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.adjustStateDiceCount(1);
    });
    stateCountBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.adjustStateDiceCount(-1);
    });
    this.stateDiceStrip = el('div', 'dice-state-dice-strip');
    stateRow.appendChild(stateCountBtn);
    stateRow.appendChild(this.stateDiceStrip);
    this.statePanel.appendChild(stateRow);

    this.stateRollButton = el('button', 'dice-roll-btn', 'Бросить кубики');
    this.stateRollButton.addEventListener('click', () => this.rollStateDice());
    this.statePanel.appendChild(this.stateRollButton);

    this.stateResetButton = el('button', 'dice-reset-btn', 'Сбросить');
    this.stateResetButton.addEventListener('click', () => this.resetStateSelector());
    this.statePanel.appendChild(this.stateResetButton);

    this.renderStateDiceStrip();
    this.syncStateRollButton();

    this.panel.appendChild(this.statePanel);

    this.panelColumn = el('div', 'dice-panel-column');
    this.walletMount = el('div', 'dice-local-wallet-mount');
    this.panelColumn.appendChild(this.walletMount);
    this.panelColumn.appendChild(this.panel);
    this.container.appendChild(this.panelColumn);

    this.sourceAvatarButton.addEventListener('pointerenter', () => {
      if (!this.pendingSource) return;
      this.hoverSource = this.pendingSource;
      this.updateHoverCard();
    });
    this.sourceAvatarButton.addEventListener('pointerleave', () => {
      this.hoverSource = null;
      this.updateHoverCard();
    });

    window.addEventListener('pointermove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      this.updateHoverCard();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Alt' && e.code !== 'AltLeft' && e.code !== 'AltRight') return;
      this.altHeld = true;
      this.updateHoverCard();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key !== 'Alt' && e.code !== 'AltLeft' && e.code !== 'AltRight') return;
      this.altHeld = false;
      this.updateHoverCard();
    });
    window.addEventListener('blur', () => {
      this.altHeld = false;
      this.hoverSource = null;
      this.updateHoverCard();
    });
  }

  /** Parent element for the local crystal wallet (above the dice selector / Roll Dice panel). */
  getLocalWalletMount(): HTMLElement {
    return this.walletMount;
  }

  /** True if `target` is inside the dice UI (selector, roll, results) — used to avoid clearing board selection. */
  containsEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    return this.container.contains(target);
  }

  private createPlayerBlock(slot: PlayerSlot): SlotDom {
    const block = el('div', 'dice-player-block');
    block.dataset.playerSlot = String(slot);
    const titleEl = el('div', 'dice-player-title', '');
    const logEl = el('div', 'dice-log');
    const activeEl = el('div', 'dice-active-result');
    block.appendChild(titleEl);
    block.appendChild(logEl);
    block.appendChild(activeEl);
    return { block, titleEl, logEl, activeEl };
  }

  /** Вызывается из main при смене места за столом (мультиплеер). */
  setLocalPlayerSlot(slot: PlayerSlot | null): void {
    this.localViewSlot = slot;
    this.reorderColumns();
    this.refreshDiceLayoutMode();
  }

  private myDiceSlot(): PlayerSlot {
    return this.localViewSlot ?? 0;
  }

  private canInteractWithSlot(slot: PlayerSlot): boolean {
    if (!isBoardMultiplayerSyncActive()) return slot === 0;
    if (this.localViewSlot === null) return false;
    return slot === this.localViewSlot;
  }

  private reorderColumns(): void {
    this.columnsWrap.replaceChildren();
    /** Порядок колонок не должен зависеть от `isBoardMultiplayerSyncActive`: иначе при слоте 0 снова 0→1 и «ваши» оказываются слева. */
    if (this.localViewSlot !== null) {
      const me = this.localViewSlot;
      const opp = (1 - me) as PlayerSlot;
      this.columnsWrap.appendChild(this.slotDom[opp].block);
      this.columnsWrap.appendChild(this.slotDom[me].block);
    } else {
      this.columnsWrap.appendChild(this.slotDom[0].block);
      this.columnsWrap.appendChild(this.slotDom[1].block);
    }
  }

  private refreshDiceLayoutMode(): void {
    const mp = isBoardMultiplayerSyncActive() && this.localViewSlot !== null;
    this.resultsArea.classList.toggle('dice-results-mp', mp);
    this.slotDom[1].block.classList.toggle('dice-hidden', !mp);
    this.updateSlotTitles();
  }

  private updateSlotTitles(): void {
    const mp = isBoardMultiplayerSyncActive();
    const spec = mp && this.localViewSlot === null;
    for (const slot of [0, 1] as const) {
      let t: string;
      if (!mp) {
        t = slot === 0 ? 'Броски' : '';
      } else if (spec) {
        t = `Игрок ${slot + 1}`;
      } else if (slot === this.localViewSlot) {
        t = 'Ваши броски';
      } else {
        t = 'Броски оппонента';
      }
      this.slotDom[slot].titleEl.textContent = t;
      this.slotDom[slot].titleEl.classList.toggle('dice-hidden', t === '');
    }
  }

  private hasAnyDiceContent(): boolean {
    for (const slot of [0, 1] as const) {
      const b = this.bucket[slot];
      if (b.rollLog.length > 0 || b.currentDice.length > 0) return true;
    }
    return false;
  }

  private updateResultsChrome(): void {
    const any = this.hasAnyDiceContent();
    if (any) {
      this.resultsArea.classList.add('dice-results-visible');
      this.globalActions.classList.remove('dice-hidden');
    } else {
      this.resultsArea.classList.remove('dice-results-visible');
      this.globalActions.classList.add('dice-hidden');
    }
  }

  private clearRollFinishTimerForSlot(slot: PlayerSlot): void {
    const t = this.pendingRollFinishBySlot[slot];
    if (t !== null) {
      clearTimeout(t);
      this.pendingRollFinishBySlot[slot] = null;
    }
  }

  private stopDiceRollTicks(): void {
    silenceAllDiceTickVoices();
    if (this.diceRollTickStop) {
      this.diceRollTickStop();
      this.diceRollTickStop = null;
    }
  }

  private clearDiceAnimTimers(): void {
    this.clearRollFinishTimerForSlot(0);
    this.clearRollFinishTimerForSlot(1);
    this.stopDiceRollTicks();
    for (const slot of [0, 1] as const) {
      const t = this.pendingRerollBySlot[slot];
      if (t !== null) {
        clearTimeout(t);
        this.pendingRerollBySlot[slot] = null;
      }
    }
  }

  private pushSharedDiceIfMp(): void {
    if (!isBoardMultiplayerSyncActive()) return;
    pushBoardStateImmediate();
  }

  private clearAllDiceState(): void {
    this.clearDiceAnimTimers();
    this.myRollAnimating = false;
    this.rollButton.disabled = false;
    this.rollButton.textContent = 'Roll Dice';
    this.resetSelector();
    this.resetStateSelector(true);
    this.hoverSource = null;
    for (const slot of [0, 1] as const) {
      this.bucket[slot] = emptyBucket();
      this.slotDom[slot].logEl.innerHTML = '';
      this.slotDom[slot].activeEl.innerHTML = '';
    }
    this.updateResultsChrome();
    this.updateHoverCard();
    this.pushSharedDiceIfMp();
  }

  exportSharedState(): SerializedSharedDiceStateV2 {
    const exportSlot = (slot: PlayerSlot): SerializedSharedDicePerSlotV1 => {
      const b = this.bucket[slot];
      const active =
        b.currentDice.length === 0
          ? null
          : {
              rollIndex: b.rollCounter,
              dice: b.currentDice.map((d) => ({
                color: d.color,
                value: d.value,
                rerolled: d.rerolled,
              })),
              sourceName: b.currentResultSource?.name ?? null,
              sourceSprite: b.currentResultSource?.sprite ?? null,
            };
      const log = b.rollLog.map((e) => ({
        rollIndex: e.rollIndex,
        dice: e.dice.map((d) => ({
          color: d.color,
          value: d.value,
          rerolled: d.rerolled,
        })),
        sourceName: e.source?.name ?? null,
        sourceSprite: e.source?.sprite ?? null,
      }));
      return { rollCounter: b.rollCounter, log, active };
    };
    return {
      v: 2,
      bySlot: {
        '0': exportSlot(0),
        '1': exportSlot(1),
      },
    };
  }

  applySharedStateFromBoard(parsed: SerializedSharedDiceStateV2 | undefined): void {
    if (parsed === undefined) return;
    if (sharedDiceV2Equal(parsed, this.exportSharedState())) return;

    this.clearDiceAnimTimers();
    this.myRollAnimating = false;
    this.rollButton.disabled = false;
    this.rollButton.textContent = 'Roll Dice';
    this.stateRollButton.textContent = 'Бросить кубики';
    this.syncStateRollButton();

    for (const slot of [0, 1] as const) {
      const raw = parsed.bySlot[String(slot) as '0' | '1'];
      const b = this.bucket[slot];
      const prevRollCounter = b.rollCounter;
      const prevDice = b.currentDice;
      const prevColumns = b.slotColumns.slice();
      const { logEl, activeEl } = this.slotDom[slot];

      b.rollCounter = raw.rollCounter;
      b.rollLog = raw.log.map((row) => this.rowToLogEntry(row));
      logEl.innerHTML = '';
      for (const e of b.rollLog) this.renderLogEntry(e, logEl);

      if (!raw.active || raw.active.dice.length === 0) {
        b.currentDice = [];
        b.currentResultSource = null;
        b.slotColumns = [];
        activeEl.innerHTML = '';
        continue;
      }

      const nextDice = this.rowToDieResults(raw.active);
      b.currentResultSource = this.diceSourceFromSyncRow(raw.active);

      if (
        this.dieResultArraysEqual(prevDice, nextDice) &&
        raw.active.rollIndex === prevRollCounter
      ) {
        b.currentDice = nextDice;
        continue;
      }

      const singleIdx = this.findSingleChangedDieIndex(prevDice, nextDice);
      const canPatchColumn =
        raw.active.rollIndex === prevRollCounter &&
        prevDice.length === nextDice.length &&
        prevColumns.length === prevDice.length &&
        singleIdx !== null &&
        prevColumns[singleIdx]?.isConnected;

      if (canPatchColumn) {
        b.currentDice = nextDice;
        b.slotColumns = prevColumns;
        this.abortColumnRerollInteraction(prevColumns[singleIdx]);
        this.playColumnRerollAnimation(slot, prevColumns[singleIdx], nextDice[singleIdx], {
          lockMyRoll: false,
          pushAfter: false,
        });
        continue;
      }

      b.currentDice = nextDice;
      b.slotColumns = [];
      activeEl.innerHTML = '';
      this.showResults(slot, nextDice, { lockGlobalRollButton: false });
    }

    this.updateResultsChrome();
    this.updateHoverCard();
  }

  private dieResultArraysEqual(a: DieResult[], b: DieResult[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].color !== b[i].color ||
        a[i].value !== b[i].value ||
        a[i].rerolled !== b[i].rerolled
      ) {
        return false;
      }
    }
    return true;
  }

  /** Ровно одна кость отличается (типичный сетевой переброс одной кости). */
  private findSingleChangedDieIndex(prev: DieResult[], next: DieResult[]): number | null {
    if (prev.length !== next.length || prev.length === 0) return null;
    let idx = -1;
    for (let i = 0; i < prev.length; i++) {
      const a = prev[i];
      const b = next[i];
      if (a.color !== b.color || a.value !== b.value || a.rerolled !== b.rerolled) {
        if (idx !== -1) return null;
        idx = i;
      }
    }
    return idx === -1 ? null : idx;
  }

  private abortColumnRerollInteraction(column: HTMLElement): void {
    const ac = this.columnRerollAbort.get(column);
    if (ac) {
      ac.abort();
      this.columnRerollAbort.delete(column);
    }
    column.classList.remove('dice-slot-rerollable', 'dice-slot-rerolling');
    column.removeAttribute('title');
    for (const m of column.querySelectorAll('.dice-reroll-marker')) {
      m.remove();
    }
  }

  private diceSourceFromSyncRow(row: SerializedSharedDiceRollRowV1): UnitCardData | null {
    return minimalDiceSource(row.sourceName, row.sourceSprite);
  }

  private rowToLogEntry(row: SerializedSharedDiceRollRowV1): RollLogEntry {
    return {
      rollIndex: row.rollIndex,
      dice: row.dice.map((d) => ({
        color: d.color,
        value: d.value,
        rerolled: d.rerolled,
      })),
      source: this.diceSourceFromSyncRow(row),
    };
  }

  private rowToDieResults(row: SerializedSharedDiceRollRowV1): DieResult[] {
    return row.dice.map((d) => {
      const config = dieConfigForResultColor(d.color);
      return {
        color: d.color,
        config,
        value: d.value,
        rerolled: d.rerolled,
      };
    });
  }

  private setDiceTab(tab: 'combat' | 'state'): void {
    this.combatPanel.classList.toggle('dice-hidden', tab !== 'combat');
    this.statePanel.classList.toggle('dice-hidden', tab !== 'state');
    this.combatTabBtn.classList.toggle('dice-tab-active', tab === 'combat');
    this.stateTabBtn.classList.toggle('dice-tab-active', tab === 'state');
  }

  private renderStateDiceStrip(): void {
    this.stateDiceStrip.replaceChildren();
    for (let i = 0; i < this.stateDiceCount; i++) {
      const mini = el('div', 'dice-state-mini');
      mini.title = `Кубик состояния ${i + 1}`;
      this.stateDiceStrip.appendChild(mini);
    }
  }

  private syncStateRollButton(): void {
    this.stateRollButton.disabled = this.myRollAnimating || this.stateDiceCount === 0;
  }

  private adjustStateDiceCount(delta: number): void {
    if (this.myRollAnimating) return;
    const next = Math.max(0, Math.min(20, this.stateDiceCount + delta));
    this.stateDiceCount = next;
    this.stateCountEl.textContent = String(next);
    this.renderStateDiceStrip();
    this.syncStateRollButton();
  }

  private adjustCount(color: DieColor, delta: number): void {
    if (this.myRollAnimating) return;
    const current = this.counts.get(color) ?? 0;
    const next = Math.max(0, Math.min(20, current + delta));
    this.counts.set(color, next);
    const label = this.diceButtons.get(color);
    if (label) label.textContent = String(next);
    if (this.getTotalDice() === 0) {
      this.clearUsedDiceActionKeys();
    }
  }

  private renderPendingSourceAvatar(): void {
    const ps = this.pendingSource;
    const av = ps ? unitMiniatureImageSrc(ps) : undefined;
    if (!ps || !av) {
      this.sourceAvatarButton.classList.add('dice-source-avatar-hidden');
      return;
    }
    this.sourceAvatarImg.src = av;
    this.sourceAvatarImg.alt = ps.name;
    this.sourceAvatarButton.title = ps.name;
    this.sourceAvatarButton.classList.remove('dice-source-avatar-hidden');
  }

  private isSameSource(a: UnitCardData | null, b: UnitCardData | null): boolean {
    if (!a || !b) return false;
    return a.name === b.name && (unitMiniatureImageSrc(a) ?? '') === (unitMiniatureImageSrc(b) ?? '');
  }

  private makeActionDedupeKey(source: UnitCardData | undefined, actionKey: string): string {
    const sid = source
      ? `${source.catalogUnitId ?? ''}\u200c${source.name}\u200c${unitMiniatureImageSrc(source) ?? ''}`
      : 'anon';
    return `${sid}::${actionKey}`;
  }

  private clearUsedDiceActionKeys(): void {
    this.usedDiceActionKeys.clear();
  }

  private resetSelector(force = false): void {
    if (this.myRollAnimating && !force) return;
    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
      const lbl = this.diceButtons.get(dc.color);
      if (lbl) lbl.textContent = '0';
    }
    this.pendingSource = null;
    this.hoverSource = null;
    this.clearUsedDiceActionKeys();
    this.renderPendingSourceAvatar();
    this.updateHoverCard();
  }

  private resetStateSelector(force = false): void {
    if (this.myRollAnimating && !force) return;
    this.stateDiceCount = DEFAULT_STATE_DICE_COUNT;
    this.stateCountEl.textContent = String(DEFAULT_STATE_DICE_COUNT);
    this.renderStateDiceStrip();
    this.stateRollButton.textContent = 'Бросить кубики';
    this.syncStateRollButton();
  }

  private updateHoverCard(): void {
    if (!this.altHeld || !this.hoverSource) {
      this.hoverCard.hide();
      return;
    }
    this.hoverCard.show(
      this.hoverSource,
      { x: this.pointerX, y: this.pointerY },
      this.hoverSource.catalogUnitId ? { catalogUnitId: this.hoverSource.catalogUnitId } : undefined,
    );
  }

  /**
   * Бросок только с переданным пулом (без слияния с текущим селектором).
   * Используется при двойном клике по хотспоту карточки.
   */
  private rollPoolImmediate(pool: Partial<Record<DieColor, number>>, source?: UnitCardData): void {
    if (this.myRollAnimating) return;
    let total = 0;
    for (const v of Object.values(pool)) {
      if (typeof v === 'number' && v > 0) total += v;
    }
    if (total === 0) return;

    if (source) {
      if (!this.pendingSource) {
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      } else if (!this.isSameSource(this.pendingSource, source)) {
        this.resetSelector(true);
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      }
    }

    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
      const lbl = this.diceButtons.get(dc.color);
      if (lbl) lbl.textContent = '0';
    }
    for (const [color, count] of Object.entries(pool) as [DieColor, number][]) {
      if (!count || count <= 0) continue;
      this.adjustCount(color, count);
    }
    this.roll();
  }

  addDice(
    pool: Partial<Record<DieColor, number>>,
    source?: UnitCardData,
    opts?: { actionKey?: string; rollImmediately?: boolean },
  ): void {
    if (this.myRollAnimating) return;
    if (opts?.rollImmediately) {
      this.rollPoolImmediate(pool, source);
      this.panel.classList.add('dice-panel-pulse');
      setTimeout(() => this.panel.classList.remove('dice-panel-pulse'), 400);
      return;
    }

    if (source) {
      if (!this.pendingSource) {
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      } else if (!this.isSameSource(this.pendingSource, source)) {
        this.resetSelector(true);
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      }
    }

    const ak = opts?.actionKey;
    if (ak) {
      const dedupe = this.makeActionDedupeKey(source, ak);
      if (this.usedDiceActionKeys.has(dedupe)) return;
      this.usedDiceActionKeys.add(dedupe);
    }
    for (const [color, count] of Object.entries(pool) as [DieColor, number][]) {
      if (!count || count <= 0) continue;
      this.adjustCount(color, count);
    }
    this.panel.classList.add('dice-panel-pulse');
    setTimeout(() => this.panel.classList.remove('dice-panel-pulse'), 400);
  }

  private getTotalDice(): number {
    let total = 0;
    for (const v of this.counts.values()) total += v;
    return total;
  }

  private roll(): void {
    if (this.myRollAnimating) return;
    const total = this.getTotalDice();
    if (total === 0) return;

    const slot = this.myDiceSlot();
    const b = this.bucket[slot];
    if (b.currentDice.length > 0) {
      this.pushCurrentToLog(slot);
    }

    this.myRollAnimating = true;
    this.rollButton.disabled = true;
    this.stateRollButton.disabled = true;
    this.rollButton.textContent = 'Rolling...';
    b.rollCounter++;
    b.currentResultSource = this.pendingSource;

    const dice: DieResult[] = [];
    for (const dc of DIE_CONFIGS) {
      const count = this.counts.get(dc.color) ?? 0;
      for (let i = 0; i < count; i++) {
        dice.push({
          color: dc.color,
          config: dc,
          value: Math.floor(Math.random() * 6) + 1,
          rerolled: false,
        });
      }
    }

    b.currentDice = dice;
    this.resetSelector(true);
    this.showResults(slot, dice, { lockGlobalRollButton: true });
    this.pushSharedDiceIfMp();
  }

  private rollStateDice(): void {
    if (this.myRollAnimating) return;
    if (this.stateDiceCount === 0) return;

    const slot = this.myDiceSlot();
    const b = this.bucket[slot];
    if (b.currentDice.length > 0) {
      this.pushCurrentToLog(slot);
    }

    this.myRollAnimating = true;
    this.rollButton.disabled = true;
    this.stateRollButton.disabled = true;
    this.stateRollButton.textContent = 'Бросок…';
    b.rollCounter++;
    b.currentResultSource = null;

    const dice: DieResult[] = [];
    for (let i = 0; i < this.stateDiceCount; i++) {
      dice.push({
        color: 'state',
        config: STATE_DIE_CONFIG,
        value: Math.floor(Math.random() * 6) + 1,
        rerolled: false,
      });
    }

    b.currentDice = dice;
    this.resetStateSelector(true);
    this.showResults(slot, dice, { lockGlobalRollButton: true });
    this.pushSharedDiceIfMp();
  }

  private pushCurrentToLog(slot: PlayerSlot): void {
    const b = this.bucket[slot];
    if (b.currentDice.length === 0) return;

    const entry: RollLogEntry = {
      dice: b.currentDice.map((d) => ({
        color: d.color,
        value: d.value,
        rerolled: d.rerolled,
      })),
      rollIndex: b.rollCounter,
      source: b.currentResultSource,
    };
    b.rollLog.push(entry);
    this.renderLogEntry(entry, this.slotDom[slot].logEl);
    b.currentDice = [];
    b.slotColumns = [];
    b.currentResultSource = null;
    this.slotDom[slot].activeEl.innerHTML = '';
  }

  private renderLogEntry(entry: RollLogEntry, logContainer: HTMLElement): void {
    const row = el('div', 'dice-log-entry');

    const logSrc = entry.source;
    const logAv = logSrc ? unitMiniatureImageSrc(logSrc) : undefined;
    if (logSrc && logAv) {
      const avatar = el('button', 'dice-log-source-avatar');
      avatar.type = 'button';
      avatar.title = logSrc.name;
      const img = el('img', 'dice-log-source-avatar-img');
      img.src = logAv;
      img.alt = logSrc.name;
      avatar.appendChild(img);
      avatar.addEventListener('pointerenter', () => {
        this.hoverSource = logSrc;
        this.updateHoverCard();
      });
      avatar.addEventListener('pointerleave', () => {
        this.hoverSource = null;
        this.updateHoverCard();
      });
      row.appendChild(avatar);
    }

    const label = el('span', 'dice-log-label', `#${entry.rollIndex}`);
    row.appendChild(label);

    const diceWrap = el('span', 'dice-log-dice');
    for (const d of entry.dice) {
      const cfg = dieConfigForResultColor(d.color);
      const mini = el('span', 'dice-log-die');
      mini.style.backgroundColor = cfg.bg;
      mini.style.color = cfg.fg;
      mini.style.borderColor = cfg.border;
      if (d.color === 'red') {
        const faceType = RED_DIE_FACE_BY_VALUE[d.value] ?? 'miss';
        const icon = el('img', 'dice-log-die-icon') as HTMLImageElement;
        icon.src = RED_DIE_FACE_ASSET[faceType];
        icon.alt = faceType;
        mini.appendChild(icon);
      } else if (d.color === 'green') {
        const faceType = GREEN_DIE_FACE_BY_VALUE[d.value] ?? 'miss';
        const icon = el('img', 'dice-log-die-icon') as HTMLImageElement;
        icon.src = GREEN_DIE_FACE_ASSET[faceType];
        icon.alt = faceType;
        mini.appendChild(icon);
      } else if (d.color === 'black') {
        const faceType = BLACK_DIE_FACE_BY_VALUE[d.value] ?? 'miss';
        const icon = el('img', 'dice-log-die-icon') as HTMLImageElement;
        icon.src = BLACK_DIE_FACE_ASSET[faceType];
        icon.alt = faceType;
        mini.appendChild(icon);
      } else if (d.color === 'white') {
        const faceType = WHITE_DIE_FACE_BY_VALUE[d.value] ?? 'miss';
        const icon = el('img', 'dice-log-die-icon') as HTMLImageElement;
        icon.src = WHITE_DIE_FACE_ASSET[faceType];
        icon.alt = faceType;
        mini.appendChild(icon);
      } else if (d.color === 'state') {
        const icon = el('img', 'dice-log-die-icon') as HTMLImageElement;
        icon.src = stateFaceSrcForValue(d.value);
        icon.alt = String(d.value);
        mini.appendChild(icon);
      } else {
        mini.textContent = String(d.value);
      }
      if (d.rerolled) mini.classList.add('dice-log-die-rerolled');
      diceWrap.appendChild(mini);
    }
    row.appendChild(diceWrap);

    logContainer.appendChild(row);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  private showResults(
    slot: PlayerSlot,
    dice: DieResult[],
    opts: { lockGlobalRollButton: boolean },
  ): void {
    this.clearRollFinishTimerForSlot(slot);
    this.stopDiceRollTicks();
    const b = this.bucket[slot];
    const activeEl = this.slotDom[slot].activeEl;
    activeEl.innerHTML = '';
    this.updateResultsChrome();

    const interactive = this.canInteractWithSlot(slot);

    const crs = b.currentResultSource;
    const resultAv = crs ? unitMiniatureImageSrc(crs) : undefined;
    if (crs && resultAv) {
      const sourceRow = el('div', 'dice-active-source');
      const sourceAvatar = el('button', 'dice-active-source-avatar');
      sourceAvatar.type = 'button';
      sourceAvatar.title = crs.name;
      const sourceImg = el('img', 'dice-active-source-avatar-img');
      sourceImg.src = resultAv;
      sourceImg.alt = crs.name;
      sourceAvatar.appendChild(sourceImg);
      const srcRef = crs;
      sourceAvatar.addEventListener('pointerenter', () => {
        this.hoverSource = srcRef;
        this.updateHoverCard();
      });
      sourceAvatar.addEventListener('pointerleave', () => {
        this.hoverSource = null;
        this.updateHoverCard();
      });
      sourceRow.appendChild(sourceAvatar);
      sourceRow.appendChild(el('span', 'dice-active-source-name', crs.name));
      activeEl.appendChild(sourceRow);
    }

    const rollLabel = el('div', 'dice-roll-label', `Roll #${b.rollCounter}`);
    activeEl.appendChild(rollLabel);

    const slotsContainer = el('div', 'dice-slots');
    activeEl.appendChild(slotsContainer);

    const slots: { column: HTMLElement; dieIndex: number; config: DieResultConfig }[] = [];
    b.slotColumns = [];

    for (let i = 0; i < dice.length; i++) {
      const die = dice[i];
      const column = el('div', 'dice-slot-column');
      column.style.borderColor = die.config.border;

      const strip = el('div', 'dice-slot-strip');
      column.appendChild(strip);

      const totalFaces = 20;
      for (let f = 0; f < totalFaces; f++) {
        const faceValue = Math.floor(Math.random() * 6) + 1;
        const face = this.createDieFace(faceValue, die.config);
        strip.appendChild(face);
      }
      const finalFace = this.createDieFace(die.value, die.config);
      finalFace.classList.add('dice-face-final');
      strip.appendChild(finalFace);

      slotsContainer.appendChild(column);
      b.slotColumns.push(column);
      slots.push({ column, dieIndex: i, config: die.config });
    }

    const FACE_SIZE = 52;
    const baseDuration = 1600;
    const staggerDelay = 120;

    slots.forEach((sl, i) => {
      const strip = sl.column.querySelector('.dice-slot-strip') as HTMLElement;
      const totalFaces = 21;
      const targetOffset = (totalFaces - 1) * FACE_SIZE;

      const delay = i * staggerDelay;
      const duration = baseDuration + delay;

      strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.35, 1.0)`;
      strip.style.transform = `translateY(0)`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          strip.style.transform = `translateY(-${targetOffset}px)`;
        });
      });
    });

    const totalDuration = baseDuration + (slots.length - 1) * staggerDelay + 200;
    this.diceRollTickStop = startDiceTickLoop(totalDuration);
    this.pendingRollFinishBySlot[slot] = setTimeout(() => {
      this.pendingRollFinishBySlot[slot] = null;
      this.stopDiceRollTicks();
      if (opts.lockGlobalRollButton) {
        this.myRollAnimating = false;
        this.rollButton.disabled = false;
        this.rollButton.textContent = 'Roll Dice';
        this.stateRollButton.textContent = 'Бросить кубики';
        this.syncStateRollButton();
      }
      if (interactive) {
        for (const sl of slots) {
          this.makeRerollable(slot, sl.column, sl.dieIndex);
        }
      }
    }, totalDuration);
  }

  private makeRerollable(slot: PlayerSlot, column: HTMLElement, dieIndex: number): void {
    if (!this.canInteractWithSlot(slot)) return;
    this.abortColumnRerollInteraction(column);

    const ac = new AbortController();
    this.columnRerollAbort.set(column, ac);
    column.classList.add('dice-slot-rerollable');
    column.title = 'Click to reroll';

    const handler = () => {
      if (this.myRollAnimating) return;
      const b = this.bucket[slot];
      const die = b.currentDice[dieIndex];
      if (!die || die.rerolled) return;

      ac.abort();
      this.columnRerollAbort.delete(column);

      die.rerolled = true;
      die.value = Math.floor(Math.random() * 6) + 1;

      column.classList.remove('dice-slot-rerollable');
      column.classList.add('dice-slot-rerolling');
      column.title = '';

      this.animateReroll(slot, column, die);
    };

    column.addEventListener('click', handler, { signal: ac.signal });
  }

  /**
   * Анимация переброса одной колонки (локально или по сети).
   * `pushAfter` — отправить снимок после завершения (только локальный клик).
   */
  private playColumnRerollAnimation(
    slot: PlayerSlot,
    column: HTMLElement,
    die: DieResult,
    opts: { lockMyRoll: boolean; pushAfter: boolean },
  ): void {
    const prevT = this.pendingRerollBySlot[slot];
    if (prevT !== null) {
      clearTimeout(prevT);
      this.pendingRerollBySlot[slot] = null;
    }

    if (opts.lockMyRoll) this.myRollAnimating = true;

    column.classList.add('dice-slot-rerolling');

    const oldStrip = column.querySelector('.dice-slot-strip') as HTMLElement;
    if (oldStrip) column.removeChild(oldStrip);

    const strip = el('div', 'dice-slot-strip');
    column.appendChild(strip);

    const totalFaces = 10;
    for (let i = 0; i < totalFaces; i++) {
      const faceValue = Math.floor(Math.random() * 6) + 1;
      const face = this.createDieFace(faceValue, die.config);
      strip.appendChild(face);
    }
    const finalFace = this.createDieFace(die.value, die.config);
    finalFace.classList.add('dice-face-final');
    strip.appendChild(finalFace);

    const FACE_SIZE = 52;
    const targetOffset = totalFaces * FACE_SIZE;
    const duration = 900;

    strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.35, 1.0)`;
    strip.style.transform = `translateY(0)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        strip.style.transform = `translateY(-${targetOffset}px)`;
      });
    });

    this.stopDiceRollTicks();
    this.diceRollTickStop = startDiceTickLoop(duration + 80);

    this.pendingRerollBySlot[slot] = setTimeout(() => {
      this.pendingRerollBySlot[slot] = null;
      this.stopDiceRollTicks();
      if (opts.lockMyRoll) {
        this.myRollAnimating = false;
        this.syncStateRollButton();
        this.stateRollButton.textContent = 'Бросить кубики';
      }
      column.classList.remove('dice-slot-rerolling');
      column.classList.add('dice-slot-was-rerolled');

      const marker = el('div', 'dice-reroll-marker', '\u21BB');
      column.appendChild(marker);

      if (opts.pushAfter) this.pushSharedDiceIfMp();
    }, duration + 100);
  }

  private animateReroll(slot: PlayerSlot, column: HTMLElement, die: DieResult): void {
    this.playColumnRerollAnimation(slot, column, die, { lockMyRoll: true, pushAfter: true });
  }

  private createDieFace(value: number, config: DieResultConfig): HTMLElement {
    const face = el('div', 'dice-face');
    face.style.backgroundColor = config.bg;

    if (config.color === 'red') {
      const faceType = RED_DIE_FACE_BY_VALUE[value] ?? 'miss';
      const icon = el('img', 'dice-face-icon') as HTMLImageElement;
      icon.src = RED_DIE_FACE_ASSET[faceType];
      icon.alt = faceType;
      face.appendChild(icon);
      return face;
    }
    if (config.color === 'white') {
      const faceType = WHITE_DIE_FACE_BY_VALUE[value] ?? 'miss';
      const icon = el('img', 'dice-face-icon') as HTMLImageElement;
      icon.src = WHITE_DIE_FACE_ASSET[faceType];
      icon.alt = faceType;
      face.appendChild(icon);
      return face;
    }
    if (config.color === 'black') {
      const faceType = BLACK_DIE_FACE_BY_VALUE[value] ?? 'miss';
      const icon = el('img', 'dice-face-icon') as HTMLImageElement;
      icon.src = BLACK_DIE_FACE_ASSET[faceType];
      icon.alt = faceType;
      face.appendChild(icon);
      return face;
    }
    if (config.color === 'green') {
      const faceType = GREEN_DIE_FACE_BY_VALUE[value] ?? 'miss';
      const icon = el('img', 'dice-face-icon') as HTMLImageElement;
      icon.src = GREEN_DIE_FACE_ASSET[faceType];
      icon.alt = faceType;
      face.appendChild(icon);
      return face;
    }
    if (config.color === 'state') {
      const icon = el('img', 'dice-face-icon') as HTMLImageElement;
      icon.src = stateFaceSrcForValue(value);
      icon.alt = String(value);
      face.appendChild(icon);
      return face;
    }

    const pips = PIP_POSITIONS[value];
    for (const [cx, cy] of pips) {
      const pip = el('div', 'dice-pip');
      pip.style.backgroundColor = config.fg;
      pip.style.left = `${cx}%`;
      pip.style.top = `${cy}%`;
      face.appendChild(pip);
    }

    return face;
  }
}
