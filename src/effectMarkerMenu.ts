/**
 * Right-click radial menu for toggling effect markers on units.
 * Pattern follows EtherVortexContextMenu but with 6 icons arranged in a ring.
 */

export type EffectMarkerId = 'stun' | 'aid' | 'bleed' | 'fire' | 'panic' | 'slow';

export interface EffectMarkerDef {
  id: EffectMarkerId;
  label: string;
  iconSrc: string;
}

export const EFFECT_MARKERS: readonly EffectMarkerDef[] = [
  { id: 'stun', label: 'Оглушение', iconSrc: '/stun.svg' },
  { id: 'aid', label: 'Помощь', iconSrc: '/aid.svg' },
  { id: 'bleed', label: 'Кровотечение', iconSrc: '/bleed.svg' },
  { id: 'fire', label: 'Огонь', iconSrc: '/fire.svg' },
  { id: 'panic', label: 'Паника', iconSrc: '/panic.svg' },
  { id: 'slow', label: 'Замедление', iconSrc: '/slow.svg' },
] as const;

export type EffectMarkerMenuCallbacks = {
  /** Called when a marker is toggled. `active` is the new state (true = added, false = removed). */
  onToggle: (id: EffectMarkerId, active: boolean) => void;
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

const RING_R = 52;
const BTN = 36;

export class EffectMarkerMenu {
  private root: HTMLElement | null = null;
  private callbacks: EffectMarkerMenuCallbacks | null = null;
  private readonly boundDocPointer = (e: PointerEvent) => this.onDocPointerDown(e);
  private readonly boundKey = (e: KeyboardEvent) => this.onKeyDown(e);

  /**
   * @param clientX / clientY — screen position to center the ring on
   * @param activeMarkers — set of currently active markers (shown as highlighted)
   */
  show(
    clientX: number,
    clientY: number,
    activeMarkers: Set<EffectMarkerId>,
    callbacks: EffectMarkerMenuCallbacks,
  ): void {
    this.hide();
    this.callbacks = callbacks;

    const wrap = el('div', 'effect-marker-radial');
    wrap.setAttribute('role', 'menu');

    const ring = el('div', 'effect-marker-radial-ring');

    const count = EFFECT_MARKERS.length; // 6
    for (let i = 0; i < count; i++) {
      const m = EFFECT_MARKERS[i]!;
      // Distribute evenly in a circle starting from top (-π/2)
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      const dx = Math.cos(angle) * RING_R;
      const dy = Math.sin(angle) * RING_R;

      const btn = el('button', 'effect-marker-radial-btn') as HTMLButtonElement;
      btn.type = 'button';
      btn.title = m.label;
      btn.setAttribute('aria-label', m.label);
      btn.style.setProperty('--dx', `${dx}px`);
      btn.style.setProperty('--dy', `${dy}px`);
      btn.style.setProperty('--stagger', `${i}`);
      btn.style.width = `${BTN}px`;
      btn.style.height = `${BTN}px`;

      if (activeMarkers.has(m.id)) {
        btn.classList.add('effect-marker-radial-btn--active');
      }

      const img = el('img') as HTMLImageElement;
      img.src = m.iconSrc;
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const wasActive = activeMarkers.has(m.id);
        if (wasActive) {
          activeMarkers.delete(m.id);
          btn.classList.remove('effect-marker-radial-btn--active');
        } else {
          activeMarkers.add(m.id);
          btn.classList.add('effect-marker-radial-btn--active');
        }
        this.callbacks?.onToggle(m.id, !wasActive);
      });
      ring.appendChild(btn);
    }

    // Center: "clear all" button
    const centerBtn = el('button', 'effect-marker-radial-center') as HTMLButtonElement;
    centerBtn.type = 'button';
    centerBtn.title = 'Убрать все маркеры';
    centerBtn.setAttribute('aria-label', 'Убрать все маркеры');
    centerBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      for (const m of EFFECT_MARKERS) {
        if (activeMarkers.has(m.id)) {
          activeMarkers.delete(m.id);
          this.callbacks?.onToggle(m.id, false);
        }
      }
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
