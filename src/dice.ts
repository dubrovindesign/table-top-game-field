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
 * "New Roll" pushes the current result into a compact log above.
 */

import { UnitCard, type UnitCardData } from './unitCard';

// ── Types ──────────────────────────────────────────────────────

export type DieColor = 'red' | 'green' | 'black' | 'white';

interface DieConfig {
  color: DieColor;
  label: string;
  bg: string;
  fg: string;
  border: string;
}

const DIE_CONFIGS: DieConfig[] = [
  { color: 'red',   label: 'Red',   bg: '#d32f2f', fg: '#ffffff', border: '#b71c1c' },
  { color: 'green', label: 'Green', bg: '#388e3c', fg: '#ffffff', border: '#1b5e20' },
  { color: 'black', label: 'Black', bg: '#424242', fg: '#ffffff', border: '#212121' },
  { color: 'white', label: 'White', bg: '#f5f5f5', fg: '#212121', border: '#bdbdbd' },
];

interface DieResult {
  color: DieColor;
  config: DieConfig;
  value: number;
  rerolled: boolean;
}

/** A snapshot of a completed roll for the log. */
interface RollLogEntry {
  dice: { color: DieColor; value: number; rerolled: boolean }[];
  rollIndex: number;
  source: UnitCardData | null;
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

// ── DOM builder helper ─────────────────────────────────────────

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

// ── Main class ─────────────────────────────────────────────────

export class DiceRoller {
  private container: HTMLElement;
  private panel: HTMLElement;
  private selectorRow: HTMLElement;
  private sourceAvatarButton: HTMLButtonElement;
  private sourceAvatarImg: HTMLImageElement;
  private resetButton: HTMLButtonElement;
  private resultsArea: HTMLElement;   // wraps log + active result
  private logContainer: HTMLElement;  // compact log of previous rolls
  private activeResult: HTMLElement;  // current interactive result
  private counts: Map<DieColor, number> = new Map();
  private diceButtons: Map<DieColor, HTMLElement> = new Map();
  private rollButton: HTMLButtonElement;
  private isRolling = false;

  /** Currently displayed dice (interactive, rerollable). */
  private currentDice: DieResult[] = [];
  /** DOM elements for each current die result. */
  private currentSlotColumns: HTMLElement[] = [];
  /** Log of past rolls in this session. */
  private rollLog: RollLogEntry[] = [];
  /** Counter for labeling rolls. */
  private rollCounter = 0;
  /** First unit that fed current selector counts. */
  private pendingSource: UnitCardData | null = null;
  /** Source unit of currently active result. */
  private currentResultSource: UnitCardData | null = null;
  /** Alt-hover target source from selector/log avatars. */
  private hoverSource: UnitCardData | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private altHeld = false;
  private hoverCard: UnitCard;

  constructor(parent: HTMLElement) {
    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
    }

    // ── Container ──
    this.container = el('div', 'dice-container');
    parent.appendChild(this.container);

    // ── Results area (log + active) ──
    this.resultsArea = el('div', 'dice-results');
    this.container.appendChild(this.resultsArea);

    this.logContainer = el('div', 'dice-log');
    this.resultsArea.appendChild(this.logContainer);

    this.activeResult = el('div', 'dice-active-result');
    this.resultsArea.appendChild(this.activeResult);

    this.hoverCard = new UnitCard(document.body);

    // ── Selector panel ──
    this.panel = el('div', 'dice-panel');
    this.container.appendChild(this.panel);

    this.selectorRow = el('div', 'dice-selector-row');
    this.panel.appendChild(this.selectorRow);

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

    // Roll button
    this.rollButton = el('button', 'dice-roll-btn', 'Roll Dice');
    this.rollButton.addEventListener('click', () => this.roll());
    this.panel.appendChild(this.rollButton);

    this.resetButton = el('button', 'dice-reset-btn', 'Reset');
    this.resetButton.addEventListener('click', () => this.resetSelector());
    this.panel.appendChild(this.resetButton);

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

  private adjustCount(color: DieColor, delta: number): void {
    if (this.isRolling) return;
    const current = this.counts.get(color) ?? 0;
    const next = Math.max(0, Math.min(20, current + delta));
    this.counts.set(color, next);
    const label = this.diceButtons.get(color);
    if (label) label.textContent = String(next);
  }

  private renderPendingSourceAvatar(): void {
    if (!this.pendingSource || !this.pendingSource.sprite) {
      this.sourceAvatarButton.classList.add('dice-source-avatar-hidden');
      return;
    }
    this.sourceAvatarImg.src = this.pendingSource.sprite;
    this.sourceAvatarImg.alt = this.pendingSource.name;
    this.sourceAvatarButton.title = this.pendingSource.name;
    this.sourceAvatarButton.classList.remove('dice-source-avatar-hidden');
  }

  private isSameSource(a: UnitCardData | null, b: UnitCardData | null): boolean {
    if (!a || !b) return false;
    return a.name === b.name && (a.sprite ?? '') === (b.sprite ?? '');
  }

  private resetSelector(force = false): void {
    if (this.isRolling && !force) return;
    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
      const lbl = this.diceButtons.get(dc.color);
      if (lbl) lbl.textContent = '0';
    }
    this.pendingSource = null;
    this.hoverSource = null;
    this.renderPendingSourceAvatar();
    this.updateHoverCard();
  }

  private updateHoverCard(): void {
    if (!this.altHeld || !this.hoverSource) {
      this.hoverCard.hide();
      return;
    }
    this.hoverCard.show(this.hoverSource, { x: this.pointerX, y: this.pointerY });
  }

  /** Add dice counts from external source (e.g. unit card). */
  addDice(pool: Partial<Record<DieColor, number>>, source?: UnitCardData): void {
    if (this.isRolling) return;
    if (source) {
      if (!this.pendingSource) {
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      } else if (!this.isSameSource(this.pendingSource, source)) {
        // Switching unit source before roll: clear selector and start a fresh pool.
        this.resetSelector(true);
        this.pendingSource = source;
        this.renderPendingSourceAvatar();
      }
    }
    for (const [color, count] of Object.entries(pool) as [DieColor, number][]) {
      if (!count || count <= 0) continue;
      this.adjustCount(color, count);
    }
    // Brief pulse on the panel to draw attention
    this.panel.classList.add('dice-panel-pulse');
    setTimeout(() => this.panel.classList.remove('dice-panel-pulse'), 400);
  }

  private getTotalDice(): number {
    let total = 0;
    for (const v of this.counts.values()) total += v;
    return total;
  }

  // ── Roll ─────────────────────────────────────────────────────

  private roll(): void {
    if (this.isRolling) return;
    const total = this.getTotalDice();
    if (total === 0) return;

    // If there's an active result, push it to the log first
    if (this.currentDice.length > 0) {
      this.pushCurrentToLog();
    }

    this.isRolling = true;
    this.rollButton.disabled = true;
    this.rollButton.textContent = 'Rolling...';
    this.rollCounter++;
    this.currentResultSource = this.pendingSource;

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

    this.currentDice = dice;

    // Reset selector pool/source after creating roll payload
    this.resetSelector(true);

    this.showResults(dice);
  }

  // ── Push current result into compact log ─────────────────────

  private pushCurrentToLog(): void {
    if (this.currentDice.length === 0) return;

    const entry: RollLogEntry = {
      dice: this.currentDice.map((d) => ({
        color: d.color,
        value: d.value,
        rerolled: d.rerolled,
      })),
      rollIndex: this.rollCounter,
      source: this.currentResultSource,
    };
    this.rollLog.push(entry);
    this.renderLogEntry(entry);
    this.currentDice = [];
    this.currentSlotColumns = [];
    this.currentResultSource = null;
  }

  private renderLogEntry(entry: RollLogEntry): void {
    const row = el('div', 'dice-log-entry');

    if (entry.source?.sprite) {
      const avatar = el('button', 'dice-log-source-avatar');
      avatar.type = 'button';
      avatar.title = entry.source.name;
      const img = el('img', 'dice-log-source-avatar-img');
      img.src = entry.source.sprite;
      img.alt = entry.source.name;
      avatar.appendChild(img);
      avatar.addEventListener('pointerenter', () => {
        this.hoverSource = entry.source;
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
      const cfg = DIE_CONFIGS.find((c) => c.color === d.color)!;
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
      } else {
        mini.textContent = String(d.value);
      }
      if (d.rerolled) mini.classList.add('dice-log-die-rerolled');
      diceWrap.appendChild(mini);
    }
    row.appendChild(diceWrap);

    this.logContainer.appendChild(row);
    // Auto-scroll log to bottom
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  // ── Show animated results ────────────────────────────────────

  private showResults(dice: DieResult[]): void {
    this.activeResult.innerHTML = '';
    this.resultsArea.classList.add('dice-results-visible');

    if (this.currentResultSource?.sprite) {
      const sourceRow = el('div', 'dice-active-source');
      const sourceAvatar = el('button', 'dice-active-source-avatar');
      sourceAvatar.type = 'button';
      sourceAvatar.title = this.currentResultSource.name;
      const sourceImg = el('img', 'dice-active-source-avatar-img');
      sourceImg.src = this.currentResultSource.sprite;
      sourceImg.alt = this.currentResultSource.name;
      sourceAvatar.appendChild(sourceImg);
      sourceAvatar.addEventListener('pointerenter', () => {
        this.hoverSource = this.currentResultSource;
        this.updateHoverCard();
      });
      sourceAvatar.addEventListener('pointerleave', () => {
        this.hoverSource = null;
        this.updateHoverCard();
      });
      sourceRow.appendChild(sourceAvatar);
      sourceRow.appendChild(el('span', 'dice-active-source-name', this.currentResultSource.name));
      this.activeResult.appendChild(sourceRow);
    }

    // Roll label
    const rollLabel = el('div', 'dice-roll-label', `Roll #${this.rollCounter}`);
    this.activeResult.appendChild(rollLabel);

    const slotsContainer = el('div', 'dice-slots');
    this.activeResult.appendChild(slotsContainer);

    const slots: { column: HTMLElement; dieIndex: number; config: DieConfig }[] = [];
    this.currentSlotColumns = [];

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
      this.currentSlotColumns.push(column);
      slots.push({ column, dieIndex: i, config: die.config });
    }

    // Clear button
    const buttonsRow = el('div', 'dice-result-buttons');

    const clearBtn = el('button', 'dice-clear-btn', 'Clear All');
    clearBtn.disabled = true;
    clearBtn.addEventListener('click', () => {
      this.resetSelector();
      this.currentDice = [];
      this.currentSlotColumns = [];
      this.rollLog = [];
      this.rollCounter = 0;
      this.currentResultSource = null;
      this.hoverSource = null;
      this.logContainer.innerHTML = '';
      this.activeResult.innerHTML = '';
      this.resultsArea.classList.remove('dice-results-visible');
      this.updateHoverCard();
    });
    buttonsRow.appendChild(clearBtn);

    this.activeResult.appendChild(buttonsRow);

    // Animate
    const FACE_SIZE = 52;
    const baseDuration = 1600;
    const staggerDelay = 120;

    slots.forEach((slot, i) => {
      const strip = slot.column.querySelector('.dice-slot-strip') as HTMLElement;
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

    // After all animations complete
    const totalDuration = baseDuration + (slots.length - 1) * staggerDelay + 200;
    setTimeout(() => {
      this.isRolling = false;
      this.rollButton.disabled = false;
      this.rollButton.textContent = 'Roll Dice';
      clearBtn.disabled = false;

      // Make each die clickable for reroll
      slots.forEach((slot) => {
        this.makeRerollable(slot.column, slot.dieIndex);
      });
    }, totalDuration);
  }

  // ── Reroll a single die ──────────────────────────────────────

  private makeRerollable(column: HTMLElement, dieIndex: number): void {
    column.classList.add('dice-slot-rerollable');
    column.title = 'Click to reroll';

    const handler = () => {
      if (this.isRolling) return;
      const die = this.currentDice[dieIndex];
      if (!die || die.rerolled) return;

      // Mark as rerolled (only once)
      die.rerolled = true;
      die.value = Math.floor(Math.random() * 6) + 1;

      // Remove handler & styling
      column.removeEventListener('click', handler);
      column.classList.remove('dice-slot-rerollable');
      column.classList.add('dice-slot-rerolling');
      column.title = '';

      this.animateReroll(column, die);
    };

    column.addEventListener('click', handler);
  }

  private animateReroll(column: HTMLElement, die: DieResult): void {
    this.isRolling = true;

    // Replace the strip with a new one for the reroll animation
    const oldStrip = column.querySelector('.dice-slot-strip') as HTMLElement;
    if (oldStrip) column.removeChild(oldStrip);

    const strip = el('div', 'dice-slot-strip');
    column.appendChild(strip);

    // Fewer faces for reroll (faster animation)
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

    setTimeout(() => {
      this.isRolling = false;
      column.classList.remove('dice-slot-rerolling');
      column.classList.add('dice-slot-was-rerolled');

      // Add reroll marker
      const marker = el('div', 'dice-reroll-marker', '\u21BB');
      column.appendChild(marker);
    }, duration + 100);
  }

  // ── Create die face ──────────────────────────────────────────

  private createDieFace(value: number, config: DieConfig): HTMLElement {
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
