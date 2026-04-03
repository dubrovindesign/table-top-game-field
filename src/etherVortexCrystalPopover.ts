/**
 * Small floating − / count / + for ether crystals on a vortex (opens when clicking the on-board chip).
 */

export type EtherVortexCrystalPopoverCallbacks = {
  getCrystalCount: () => number;
  onCrystalsDelta: (delta: number) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class EtherVortexCrystalPopover {
  private root: HTMLElement | null = null;
  private valueEl: HTMLElement | null = null;
  private callbacks: EtherVortexCrystalPopoverCallbacks | null = null;
  private readonly boundDocPointer = (e: PointerEvent) => this.onDocPointerDown(e);
  private readonly boundKey = (e: KeyboardEvent) => this.onKeyDown(e);

  show(anchorScreenX: number, anchorScreenY: number, callbacks: EtherVortexCrystalPopoverCallbacks): void {
    this.hide();
    this.callbacks = callbacks;

    const wrap = el('div', 'ether-vortex-crystal-popover');
    wrap.setAttribute('role', 'toolbar');

    const minus = el('button', 'ether-vortex-crystal-popover-btn') as HTMLButtonElement;
    minus.type = 'button';
    minus.textContent = '−';
    minus.title = 'Меньше эфира';
    minus.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.callbacks?.onCrystalsDelta(-1);
      this.syncValue();
    });

    this.valueEl = el('span', 'ether-vortex-crystal-popover-val', String(callbacks.getCrystalCount()));

    const plus = el('button', 'ether-vortex-crystal-popover-btn') as HTMLButtonElement;
    plus.type = 'button';
    plus.textContent = '+';
    plus.title = 'Больше эфира';
    plus.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.callbacks?.onCrystalsDelta(1);
      this.syncValue();
    });

    wrap.appendChild(minus);
    wrap.appendChild(this.valueEl);
    wrap.appendChild(plus);

    document.body.appendChild(wrap);
    this.root = wrap;

    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    let left = anchorScreenX - w / 2;
    let top = anchorScreenY - h - 10;
    if (top < pad) top = anchorScreenY + 14;
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;
    if (top + h > vh - pad) top = vh - h - pad;
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;

    setTimeout(() => {
      document.addEventListener('pointerdown', this.boundDocPointer, true);
      window.addEventListener('keydown', this.boundKey, true);
    }, 0);
  }

  private syncValue(): void {
    if (!this.valueEl || !this.callbacks) return;
    this.valueEl.textContent = String(this.callbacks.getCrystalCount());
  }

  hide(): void {
    document.removeEventListener('pointerdown', this.boundDocPointer, true);
    window.removeEventListener('keydown', this.boundKey, true);
    this.root?.remove();
    this.root = null;
    this.valueEl = null;
    this.callbacks = null;
  }

  private onDocPointerDown(e: PointerEvent): void {
    if (!this.root) return;
    if (this.root.contains(e.target as Node)) return;
    this.hide();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.hide();
  }
}
