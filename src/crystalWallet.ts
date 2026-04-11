/**
 * Crystal Wallet — tracks faith crystals (4 domain colors)
 * and ether crystals.
 *
 * Interaction:
 *  - Click [+] to open a picker and add a crystal type to the wallet.
 *  - Once a crystal is visible: LMB = +1, RMB = −1.
 *  - When count reaches 0, the crystal fades out and disappears.
 *
 * Counts are driven by the parent (`renderFromState`); user input calls `onApplyDelta`.
 */

import type { PlayerSlot } from './multiplayer/protocol.ts';

// ── Types ──────────────────────────────────────────────────────

export type FaithColor = 'yellow' | 'black' | 'red' | 'green';

export const CRYSTAL_WALLET_IDS = ['yellow', 'black', 'red', 'green', 'ether'] as const;
export type CrystalWalletId = (typeof CRYSTAL_WALLET_IDS)[number];

interface CrystalConfig {
  id: string;
  label: string;
  bg: string;
  fg: string;
  border: string;
  shape: 'diamond' | 'circle';
}

const FAITH_CRYSTALS: CrystalConfig[] = [
  { id: 'yellow', label: 'Yellow', bg: '#f9a825', fg: '#000', border: '#f57f17', shape: 'diamond' },
  { id: 'black', label: 'Black', bg: '#424242', fg: '#fff', border: '#212121', shape: 'diamond' },
  { id: 'red', label: 'Red', bg: '#d32f2f', fg: '#fff', border: '#b71c1c', shape: 'diamond' },
  { id: 'green', label: 'Green', bg: '#388e3c', fg: '#fff', border: '#1b5e20', shape: 'diamond' },
];

const ETHER_CRYSTAL: CrystalConfig = {
  id: 'ether',
  label: 'Ether',
  bg: '#1e88e5',
  fg: '#fff',
  border: '#1565c0',
  shape: 'diamond',
};

const ALL_CRYSTALS = [...FAITH_CRYSTALS, ETHER_CRYSTAL];

// ── DOM helper ─────────────────────────────────────────────────

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

// ── CrystalWallet class ───────────────────────────────────────

export type CrystalWalletVariant = 'local' | 'opponent';

export type CrystalWalletOptions = {
  variant?: CrystalWalletVariant;
  /** Which `PlayerSlot`'s counts this row displays. */
  boundSlot: PlayerSlot;
  onApplyDelta: (slot: PlayerSlot, crystalId: string, delta: number) => void;
};

export class CrystalWallet {
  private variant: CrystalWalletVariant;
  private boundSlot: PlayerSlot;
  private onApplyDelta: (slot: PlayerSlot, crystalId: string, delta: number) => void;
  private container: HTMLElement;
  private crystalsRow: HTMLElement;
  private pickerOverlay: HTMLElement | null = null;

  /** id → count (mirrors last renderFromState) */
  private counts: Map<string, number> = new Map();
  /** id → DOM chip element */
  private chips: Map<string, HTMLElement> = new Map();

  constructor(parent: HTMLElement, options: CrystalWalletOptions) {
    const variant: CrystalWalletVariant = options.variant ?? 'local';
    this.variant = variant;
    this.boundSlot = options.boundSlot;
    this.onApplyDelta = options.onApplyDelta;
    this.container = el('div', 'crystal-wallet');
    this.container.classList.add(
      variant === 'opponent' ? 'crystal-wallet--opponent' : 'crystal-wallet--local',
    );
    parent.appendChild(this.container);

    this.crystalsRow = el('div', 'cw-crystals-row');
    this.container.appendChild(this.crystalsRow);

    const addBtn = el('div', 'cw-add-btn', '+');
    addBtn.title = 'Add crystal';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePicker();
    });
    if (this.variant === 'local') {
      this.crystalsRow.insertBefore(addBtn, this.crystalsRow.firstChild);
    } else {
      this.crystalsRow.appendChild(addBtn);
    }
  }

  getDisplaySlot(): PlayerSlot {
    return this.boundSlot;
  }

  setBoundSlot(slot: PlayerSlot): void {
    this.boundSlot = slot;
  }

  /** Replace chips from authoritative counts (0…99 per id). */
  renderFromState(record: Record<string, number>): void {
    this.closePicker();

    const next = new Map<string, number>();
    for (const [k, v] of Object.entries(record)) {
      if (v > 0) next.set(k, Math.min(99, Math.max(0, Math.floor(v))));
    }

    for (const id of [...this.chips.keys()]) {
      if (!next.has(id)) {
        const chip = this.chips.get(id);
        this.counts.delete(id);
        this.chips.delete(id);
        if (chip) {
          chip.classList.add('cw-chip-removing');
          setTimeout(() => chip.remove(), 250);
        }
      }
    }

    for (const [id, cnt] of next) {
      this.counts.set(id, cnt);
      let chip = this.chips.get(id);
      if (!chip) {
        const cfg = ALL_CRYSTALS.find((c) => c.id === id);
        if (cfg) this.createChip(cfg);
      } else {
        const countEl = chip.querySelector('.cw-chip-count');
        if (countEl) countEl.textContent = String(cnt);
      }
    }
  }

  // ── Picker (dropdown to choose crystal type) ─────────────────

  private togglePicker(): void {
    if (this.pickerOverlay) {
      this.closePicker();
      return;
    }
    this.openPicker();
  }

  private openPicker(): void {
    this.closePicker();

    this.pickerOverlay = el('div', 'cw-picker');

    const available = ALL_CRYSTALS.filter((c) => !this.counts.has(c.id));

    if (available.length === 0) {
      const msg = el('div', 'cw-picker-empty', 'All crystals added');
      this.pickerOverlay.appendChild(msg);
    } else {
      for (const cfg of available) {
        const item = el('div', `cw-picker-item cw-shape-${cfg.shape}`);
        item.style.backgroundColor = cfg.bg;
        item.style.color = cfg.fg;
        item.style.borderColor = cfg.border;
        item.textContent = cfg.label;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onApplyDelta(this.boundSlot, cfg.id, +1);
          this.closePicker();
        });
        this.pickerOverlay.appendChild(item);
      }
    }

    this.container.appendChild(this.pickerOverlay);

    const closeHandler = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node)) {
        this.closePicker();
        document.removeEventListener('click', closeHandler);
      }
    };
    requestAnimationFrame(() => {
      document.addEventListener('click', closeHandler);
    });
  }

  private closePicker(): void {
    if (this.pickerOverlay) {
      this.pickerOverlay.remove();
      this.pickerOverlay = null;
    }
  }

  // ── Crystal management ───────────────────────────────────────

  private createChip(cfg: CrystalConfig): void {
    const chip = el('div', `cw-chip cw-shape-${cfg.shape}`);
    chip.style.backgroundColor = cfg.bg;
    chip.style.color = cfg.fg;
    chip.style.borderColor = cfg.border;

    const countEl = el('span', 'cw-chip-count', String(this.counts.get(cfg.id) ?? 1));
    chip.appendChild(countEl);

    chip.title = `${cfg.label} — LMB: +1, RMB: −1`;

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onApplyDelta(this.boundSlot, cfg.id, +1);
    });

    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onApplyDelta(this.boundSlot, cfg.id, -1);
    });

    const addBtn = this.crystalsRow.querySelector('.cw-add-btn');
    if (this.variant === 'local' || !addBtn) {
      this.crystalsRow.appendChild(chip);
    } else {
      this.crystalsRow.insertBefore(chip, addBtn);
    }
    this.chips.set(cfg.id, chip);

    chip.classList.add('cw-chip-entering');
    requestAnimationFrame(() => {
      chip.classList.remove('cw-chip-entering');
    });
  }
}
