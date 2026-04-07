/**
 * Crystal Wallet — tracks faith crystals (4 domain colors)
 * and ether crystals.
 *
 * Interaction:
 *  - Click [+] to open a picker and add a crystal type to the wallet.
 *  - Once a crystal is visible: LMB = +1, RMB = −1.
 *  - When count reaches 0, the crystal fades out and disappears.
 */

// ── Types ──────────────────────────────────────────────────────

export type FaithColor = 'yellow' | 'black' | 'red' | 'green';

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
  { id: 'black',  label: 'Black',  bg: '#424242', fg: '#fff', border: '#212121', shape: 'diamond' },
  { id: 'red',    label: 'Red',    bg: '#d32f2f', fg: '#fff', border: '#b71c1c', shape: 'diamond' },
  { id: 'green',  label: 'Green',  bg: '#388e3c', fg: '#fff', border: '#1b5e20', shape: 'diamond' },
];

const ETHER_CRYSTAL: CrystalConfig = {
  id: 'ether', label: 'Ether', bg: '#1e88e5', fg: '#fff', border: '#1565c0', shape: 'diamond',
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

export class CrystalWallet {
  private variant: CrystalWalletVariant;
  private container: HTMLElement;
  private crystalsRow: HTMLElement;
  private pickerOverlay: HTMLElement | null = null;

  /** id → count */
  private counts: Map<string, number> = new Map();
  /** id → DOM chip element */
  private chips: Map<string, HTMLElement> = new Map();

  constructor(
    parent: HTMLElement,
    options?: { variant?: CrystalWalletVariant },
  ) {
    const variant: CrystalWalletVariant = options?.variant ?? 'local';
    this.variant = variant;
    this.container = el('div', 'crystal-wallet');
    this.container.classList.add(
      variant === 'opponent' ? 'crystal-wallet--opponent' : 'crystal-wallet--local',
    );
    parent.appendChild(this.container);

    // Crystals row (where active chips go)
    this.crystalsRow = el('div', 'cw-crystals-row');
    this.container.appendChild(this.crystalsRow);

    // Add button
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

    // Only show crystals not yet in the wallet
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
          this.addCrystalType(cfg.id);
          this.closePicker();
        });
        this.pickerOverlay.appendChild(item);
      }
    }

    this.container.appendChild(this.pickerOverlay);

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node)) {
        this.closePicker();
        document.removeEventListener('click', closeHandler);
      }
    };
    // Defer so this click doesn't immediately close
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

  private addCrystalType(id: string): void {
    if (this.counts.has(id)) return;
    const cfg = ALL_CRYSTALS.find((c) => c.id === id);
    if (!cfg) return;

    this.counts.set(id, 1);
    this.createChip(cfg);
  }

  private createChip(cfg: CrystalConfig): void {
    const chip = el('div', `cw-chip cw-shape-${cfg.shape}`);
    chip.style.backgroundColor = cfg.bg;
    chip.style.color = cfg.fg;
    chip.style.borderColor = cfg.border;

    const countEl = el('span', 'cw-chip-count', String(this.counts.get(cfg.id) ?? 1));
    chip.appendChild(countEl);

    chip.title = `${cfg.label} — LMB: +1, RMB: −1`;

    // LMB: +1
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = this.counts.get(cfg.id) ?? 0;
      const next = Math.min(99, current + 1);
      this.counts.set(cfg.id, next);
      countEl.textContent = String(next);
      this.pulseChip(chip);
    });

    // RMB: −1
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = this.counts.get(cfg.id) ?? 0;
      const next = current - 1;

      if (next <= 0) {
        // Remove crystal from wallet
        this.counts.delete(cfg.id);
        this.chips.delete(cfg.id);
        chip.classList.add('cw-chip-removing');
        setTimeout(() => chip.remove(), 250);
      } else {
        this.counts.set(cfg.id, next);
        countEl.textContent = String(next);
        this.pulseChip(chip);
      }
    });

    // Local wallet: [+] is left, new crystals extend to the right.
    // Opponent wallet: [+] is right, new crystals extend to the left.
    const addBtn = this.crystalsRow.querySelector('.cw-add-btn');
    if (this.variant === 'local' || !addBtn) {
      this.crystalsRow.appendChild(chip);
    } else {
      this.crystalsRow.insertBefore(chip, addBtn);
    }
    this.chips.set(cfg.id, chip);

    // Entrance animation
    chip.classList.add('cw-chip-entering');
    requestAnimationFrame(() => {
      chip.classList.remove('cw-chip-entering');
    });
  }

  private pulseChip(chip: HTMLElement): void {
    chip.classList.remove('cw-chip-pulse');
    void chip.offsetWidth; // force reflow
    chip.classList.add('cw-chip-pulse');
  }
}
