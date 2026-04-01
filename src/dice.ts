/**
 * Dice rolling UI — slot-machine style animation.
 *
 * Dice colors: red, green, black, white.
 * Each die is a d6 (1–6). The result panel slides up
 * with a spinning slot animation lasting ~2 seconds.
 */

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
  { color: 'black', label: 'Black', bg: '#212121', fg: '#ffffff', border: '#000000' },
  { color: 'white', label: 'White', bg: '#f5f5f5', fg: '#212121', border: '#bdbdbd' },
];

interface DieResult {
  color: DieColor;
  config: DieConfig;
  value: number; // 1–6
}

// ── Pip patterns for d6 faces ──────────────────────────────────

// Each face is an array of (cx%, cy%) positions for pips
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
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
  private panel: HTMLElement;        // selector panel (bottom-right)
  private resultsPanel: HTMLElement; // animated results (slides up)
  private counts: Map<DieColor, number> = new Map();
  private countLabels: Map<DieColor, HTMLElement> = new Map();
  private rollButton: HTMLButtonElement;
  private isRolling = false;

  constructor(parent: HTMLElement) {
    // Init counts
    for (const dc of DIE_CONFIGS) {
      this.counts.set(dc.color, 0);
    }

    // ── Container ──
    this.container = el('div', 'dice-container');
    parent.appendChild(this.container);

    // ── Results panel (hidden initially) ──
    this.resultsPanel = el('div', 'dice-results');
    this.container.appendChild(this.resultsPanel);

    // ── Selector panel ──
    this.panel = el('div', 'dice-panel');
    this.container.appendChild(this.panel);

    const title = el('div', 'dice-title', 'Dice Roll');
    this.panel.appendChild(title);

    const grid = el('div', 'dice-grid');
    this.panel.appendChild(grid);

    for (const dc of DIE_CONFIGS) {
      const row = el('div', 'dice-row');

      // Die preview (mini die icon)
      const preview = el('div', 'dice-preview');
      preview.style.backgroundColor = dc.bg;
      preview.style.borderColor = dc.border;
      // Single pip to show it's a die
      const pip = el('div', 'dice-preview-pip');
      pip.style.backgroundColor = dc.fg;
      preview.appendChild(pip);
      row.appendChild(preview);

      // Label
      const label = el('span', 'dice-label', dc.label);
      row.appendChild(label);

      // Minus button
      const minus = el('button', 'dice-btn dice-btn-minus', '\u2212');
      minus.addEventListener('click', () => this.adjustCount(dc.color, -1));
      row.appendChild(minus);

      // Count display
      const countEl = el('span', 'dice-count', '0');
      this.countLabels.set(dc.color, countEl);
      row.appendChild(countEl);

      // Plus button
      const plus = el('button', 'dice-btn dice-btn-plus', '+');
      plus.addEventListener('click', () => this.adjustCount(dc.color, 1));
      row.appendChild(plus);

      grid.appendChild(row);
    }

    // Roll button
    this.rollButton = el('button', 'dice-roll-btn', 'Roll Dice');
    this.rollButton.addEventListener('click', () => this.roll());
    this.panel.appendChild(this.rollButton);
  }

  private adjustCount(color: DieColor, delta: number): void {
    const current = this.counts.get(color) ?? 0;
    const next = Math.max(0, Math.min(20, current + delta));
    this.counts.set(color, next);
    const label = this.countLabels.get(color);
    if (label) label.textContent = String(next);
  }

  private getTotalDice(): number {
    let total = 0;
    for (const v of this.counts.values()) total += v;
    return total;
  }

  private roll(): void {
    if (this.isRolling) return;
    const total = this.getTotalDice();
    if (total === 0) return;

    this.isRolling = true;
    this.rollButton.disabled = true;
    this.rollButton.textContent = 'Rolling...';

    // Build list of dice to roll
    const dice: DieResult[] = [];
    for (const dc of DIE_CONFIGS) {
      const count = this.counts.get(dc.color) ?? 0;
      for (let i = 0; i < count; i++) {
        dice.push({
          color: dc.color,
          config: dc,
          value: Math.floor(Math.random() * 6) + 1,
        });
      }
    }

    this.showResults(dice);
  }

  private showResults(dice: DieResult[]): void {
    this.resultsPanel.innerHTML = '';
    this.resultsPanel.classList.add('dice-results-visible');

    const slotsContainer = el('div', 'dice-slots');
    this.resultsPanel.appendChild(slotsContainer);

    // Create a slot column for each die
    const slots: { column: HTMLElement; finalValue: number; config: DieConfig }[] = [];

    for (const die of dice) {
      const column = el('div', 'dice-slot-column');
      column.style.borderColor = die.config.border;

      // The slot strip — many faces scrolling vertically
      const strip = el('div', 'dice-slot-strip');
      column.appendChild(strip);

      // Generate 20 random faces + final face = 21 total
      const totalFaces = 20;
      for (let i = 0; i < totalFaces; i++) {
        const faceValue = Math.floor(Math.random() * 6) + 1;
        const face = this.createDieFace(faceValue, die.config);
        strip.appendChild(face);
      }
      // Final face (the actual result)
      const finalFace = this.createDieFace(die.value, die.config);
      finalFace.classList.add('dice-face-final');
      strip.appendChild(finalFace);

      slotsContainer.appendChild(column);
      slots.push({ column, finalValue: die.value, config: die.config });
    }

    // Animate each slot with staggered timing
    const FACE_SIZE = 52; // must match CSS
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

      // Kick off animation after a frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          strip.style.transform = `translateY(-${targetOffset}px)`;
        });
      });
    });

    // After all animations complete, mark done
    const totalDuration = baseDuration + (slots.length - 1) * staggerDelay + 200;
    setTimeout(() => {
      this.isRolling = false;
      this.rollButton.disabled = false;
      this.rollButton.textContent = 'Roll Dice';
    }, totalDuration);
  }

  private createDieFace(value: number, config: DieConfig): HTMLElement {
    const face = el('div', 'dice-face');
    face.style.backgroundColor = config.bg;

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
