/**
 * Right-click radial menu for ether vortex domain only (compact icon ring).
 */

import { ETHER_VORTEX_DOMAINS, type EtherVortexDomainId } from './etherVortex';

export type EtherVortexDomainMenuCallbacks = {
  onPickDomain: (domain: EtherVortexDomainId) => void;
  /** Reset domain to default (no allegiance). */
  onClearDomain: () => void;
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

const RING_R = 40;
const BTN = 34;

export class EtherVortexContextMenu {
  private root: HTMLElement | null = null;
  private callbacks: EtherVortexDomainMenuCallbacks | null = null;
  private readonly boundDocPointer = (e: PointerEvent) => this.onDocPointerDown(e);
  private readonly boundKey = (e: KeyboardEvent) => this.onKeyDown(e);

  show(clientX: number, clientY: number, callbacks: EtherVortexDomainMenuCallbacks): void {
    this.hide();
    this.callbacks = callbacks;

    const wrap = el('div', 'ether-vortex-domain-radial');
    wrap.setAttribute('role', 'menu');

    const ring = el('div', 'ether-vortex-domain-radial-ring');

    for (let i = 0; i < ETHER_VORTEX_DOMAINS.length; i++) {
      const d = ETHER_VORTEX_DOMAINS[i]!;
      const angle = (-Math.PI / 2 + (i * Math.PI) / 2) as number;
      const dx = Math.cos(angle) * RING_R;
      const dy = Math.sin(angle) * RING_R;

      const btn = el('button', 'ether-vortex-domain-radial-btn') as HTMLButtonElement;
      btn.type = 'button';
      btn.title = d.label;
      btn.setAttribute('aria-label', d.label);
      btn.style.setProperty('--dx', `${dx}px`);
      btn.style.setProperty('--dy', `${dy}px`);
      btn.style.width = `${BTN}px`;
      btn.style.height = `${BTN}px`;

      const img = el('img') as HTMLImageElement;
      img.src = d.imageSrc;
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.callbacks?.onPickDomain(d.id);
        this.hide();
      });
      ring.appendChild(btn);
    }

    const centerBtn = el('button', 'ether-vortex-domain-radial-center') as HTMLButtonElement;
    centerBtn.type = 'button';
    centerBtn.title = 'Без домена';
    centerBtn.setAttribute('aria-label', 'Сбросить приверженность к домену');
    centerBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.callbacks?.onClearDomain();
      this.hide();
    });
    ring.appendChild(centerBtn);

    wrap.appendChild(ring);
    document.body.appendChild(wrap);

    const box = 2 * (RING_R + BTN / 2 + 4);
    wrap.style.width = `${box}px`;
    wrap.style.height = `${box}px`;

    const pad = 6;
    let left = clientX - box / 2;
    let top = clientY - box / 2;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    if (left + box > window.innerWidth - pad) left = window.innerWidth - pad - box;
    if (top + box > window.innerHeight - pad) top = window.innerHeight - pad - box;
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;

    this.root = wrap;

    setTimeout(() => {
      document.addEventListener('pointerdown', this.boundDocPointer, true);
      window.addEventListener('keydown', this.boundKey, true);
    }, 0);
  }

  hide(): void {
    document.removeEventListener('pointerdown', this.boundDocPointer, true);
    window.removeEventListener('keydown', this.boundKey, true);
    this.root?.remove();
    this.root = null;
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
