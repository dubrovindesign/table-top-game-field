/**
 * Две слепые зоны на столе: своя у ближнего к игроку края, оппонента — у противоположного.
 */

import {
  applyGodCardBackSpriteCss,
  applyGodCardSpriteCss,
  getGodCardById,
  godCardAriaLabel,
} from './godCards.ts';

export type GodBlindZoneViewModel = {
  interactive: boolean;
  myBlindCardIds: string[];
  opponentBlindCount: number;
};

/** Экранные прямоугольники: container — внешний бокс с рамкой; cards — позиции относительно container. */
export type GodBlindZoneLayout = {
  container: { left: number; top: number; width: number; height: number };
  cards: Array<{ left: number; top: number; width: number; height: number }>;
  /** Толщина рамки зоны в CSS px (масштабируется с зумом камеры). */
  borderScreenPx: number;
  /** Текущий зум камеры для масштабирования DOM-декора (радиусы/тени/рамки). */
  zoom: number;
};

export type GodBlindZoneDockOptions = {
  isInteractive: () => boolean;
  onBlindCardToTable: (blindIndex: number, clientX: number, clientY: number) => void;
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

/** Цвет рамки слепой зоны (толщина задаётся из layout). */
const GOD_BLIND_ZONE_BORDER_COLOR = 'rgba(255, 255, 255, 0.22)';

function applyBounds(
  wrap: HTMLElement,
  bounds: { left: number; top: number; width: number; height: number },
): void {
  wrap.style.left = `${Math.round(bounds.left)}px`;
  wrap.style.top = `${Math.round(bounds.top)}px`;
  wrap.style.width = `${Math.round(bounds.width)}px`;
  wrap.style.height = `${Math.round(bounds.height)}px`;
}

export class GodHandBlindDock {
  private myBlindTableWrap: HTMLElement;
  private myBlindZone: HTMLElement;
  private myBlindInner: HTMLElement;
  private oppBlindTableWrap: HTMLElement;
  private oppBlindZone: HTMLElement;
  private oppBlindInner: HTMLElement;
  private ghost: HTMLElement;
  private opts: GodBlindZoneDockOptions;
  private dragKind: 'blind' | null = null;
  private dragBlindIndex = -1;
  private dragPointerId = -1;
  private ghostHalfW = 70;
  private ghostHalfH = 48;
  private lastVm: GodBlindZoneViewModel | null = null;
  private lastMineLayout: GodBlindZoneLayout | null = null;

  constructor(_parent: HTMLElement, opts: GodBlindZoneDockOptions) {
    this.opts = opts;

    this.myBlindTableWrap = el('div', 'god-blind-table-wrap god-blind-table-wrap--mine');
    this.myBlindZone = el('div', 'god-blind-zone god-blind-zone--on-table');
    this.myBlindInner = el('div', 'god-blind-zone-inner');
    this.myBlindZone.appendChild(this.myBlindInner);
    this.myBlindTableWrap.appendChild(this.myBlindZone);
    document.body.appendChild(this.myBlindTableWrap);

    this.oppBlindTableWrap = el('div', 'god-blind-table-wrap god-blind-table-wrap--opponent');
    this.oppBlindZone = el('div', 'god-blind-zone god-blind-zone--on-table');
    this.oppBlindInner = el('div', 'god-blind-zone-inner');
    this.oppBlindZone.appendChild(this.oppBlindInner);
    this.oppBlindTableWrap.appendChild(this.oppBlindZone);
    document.body.appendChild(this.oppBlindTableWrap);

    this.ghost = el('div', 'god-dock-drag-ghost');
    this.ghost.style.display = 'none';
    document.body.appendChild(this.ghost);

    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerUp);
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerUp);
    this.ghost.remove();
    this.myBlindTableWrap.remove();
    this.oppBlindTableWrap.remove();
  }

  applyDualBlindLayouts(mine: GodBlindZoneLayout, opp: GodBlindZoneLayout): void {
    this.lastMineLayout = mine;
    this.applyOneBlindLayout(this.myBlindTableWrap, this.myBlindZone, this.myBlindInner, mine);
    this.applyOneBlindLayout(this.oppBlindTableWrap, this.oppBlindZone, this.oppBlindInner, opp);
  }

  private applyOneBlindLayout(
    wrap: HTMLElement,
    zone: HTMLElement,
    inner: HTMLElement,
    layout: GodBlindZoneLayout,
  ): void {
    applyBounds(wrap, layout.container);
    const zoom = Number.isFinite(layout.zoom) ? Math.max(0.05, layout.zoom) : 1;
    wrap.style.setProperty('--god-blind-zoom', zoom.toFixed(4));
    const zoneRadiusPx = Math.max(4, Math.round(layout.container.height * 0.18));
    wrap.style.setProperty('--god-blind-zone-radius', `${zoneRadiusPx}px`);
    const bw = Math.max(0, Math.round(layout.borderScreenPx));
    zone.style.borderStyle = 'solid';
    zone.style.borderColor = GOD_BLIND_ZONE_BORDER_COLOR;
    zone.style.borderWidth = `${bw}px`;
    const kids = inner.children;
    const n = Math.min(kids.length, layout.cards.length);
    const b = bw;
    for (let i = 0; i < n; i++) {
      const el = kids[i] as HTMLElement;
      const c = layout.cards[i]!;
      el.style.position = 'absolute';
      /* Координаты layout — от внешнего края wrap; контент зоны сдвинут на border. */
      el.style.left = `${Math.round(c.left - b)}px`;
      el.style.top = `${Math.round(c.top - b)}px`;
      el.style.width = `${Math.round(c.width)}px`;
      el.style.height = `${Math.round(c.height)}px`;
      el.style.boxSizing = 'border-box';
      const cardRadiusPx = Math.max(3, Math.round(c.height * 0.105));
      el.style.setProperty('--god-blind-card-radius', `${cardRadiusPx}px`);
      el.style.setProperty('--god-blind-card-w', `${c.width}px`);
      el.style.setProperty('--god-blind-card-h', `${c.height}px`);
    }
  }

  isPointInsideMyBlindZone(clientX: number, clientY: number): boolean {
    const layout = this.lastMineLayout;
    if (!layout) return false;
    for (const c of layout.cards) {
      const left = c.left + layout.container.left;
      const top = c.top + layout.container.top;
      if (
        clientX >= left &&
        clientX <= left + c.width &&
        clientY >= top &&
        clientY <= top + c.height
      ) {
        return true;
      }
    }
    return false;
  }

  /** Курсор над слепой зоной (DOM), чтобы хоткеи стола не срабатывали «сквозь» оверлей. */
  isPointOverBlindZoneChrome(clientX: number, clientY: number): boolean {
    const inRect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return (
        clientX >= r.left &&
        clientX < r.right &&
        clientY >= r.top &&
        clientY < r.bottom
      );
    };
    return inRect(this.myBlindTableWrap) || inRect(this.oppBlindTableWrap);
  }

  refresh(vm: GodBlindZoneViewModel): void {
    this.lastVm = vm;
    this.myBlindTableWrap.classList.toggle('god-blind-table-wrap--inactive', !vm.interactive);

    this.myBlindInner.replaceChildren();
    vm.myBlindCardIds.forEach((id, index) => {
      const bc = this.makeFaceCard(id, 'god-dock-card--blind-slot');
      bc.dataset.blindIndex = String(index);
      if (vm.interactive) {
        bc.style.cursor = 'grab';
        bc.addEventListener('pointerdown', (e) => this.onBlindCardPointerDown(e, index));
      }
      this.myBlindInner.appendChild(bc);
    });

    this.oppBlindInner.replaceChildren();
    for (let i = 0; i < vm.opponentBlindCount; i++) {
      this.oppBlindInner.appendChild(this.makeBackCard('god-dock-card--blind-slot'));
    }
  }

  private makeBackCard(extraCls: string): HTMLElement {
    const d = el('div', `god-dock-card god-dock-card--back ${extraCls}`);
    applyGodCardBackSpriteCss(d);
    return d;
  }

  private makeFaceCard(cardId: string, extraCls: string): HTMLElement {
    const d = el('div', `god-dock-card god-dock-card--face ${extraCls}`);
    const def = getGodCardById(cardId);
    if (def) {
      applyGodCardSpriteCss(d, def);
      d.setAttribute('role', 'img');
      d.setAttribute('aria-label', godCardAriaLabel(def));
    } else {
      d.textContent = cardId;
    }
    return d;
  }

  private onBlindCardPointerDown(e: PointerEvent, blindIndex: number): void {
    if (!this.opts.isInteractive() || e.button !== 0) return;
    const vm = this.lastVm;
    if (!vm || !vm.myBlindCardIds[blindIndex]) return;
    e.preventDefault();
    this.dragKind = 'blind';
    this.dragBlindIndex = blindIndex;
    this.dragPointerId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const source = e.currentTarget as HTMLElement;
    const id = vm.myBlindCardIds[blindIndex]!;
    const ghostCard = this.makeFaceCard(id, 'god-dock-card--ghost');
    const srcRect = source.getBoundingClientRect();
    const ghostW = Math.max(1, Math.round(srcRect.width));
    const ghostH = Math.max(1, Math.round(srcRect.height));
    this.ghostHalfW = ghostW / 2;
    this.ghostHalfH = ghostH / 2;
    ghostCard.style.width = `${ghostW}px`;
    ghostCard.style.height = `${ghostH}px`;
    ghostCard.style.minHeight = `${ghostH}px`;
    ghostCard.style.maxHeight = `${ghostH}px`;
    this.ghost.replaceChildren();
    this.ghost.appendChild(ghostCard);
    this.ghost.style.display = 'block';
    this.positionGhost(e.clientX, e.clientY);
  }

  private positionGhost(clientX: number, clientY: number): void {
    this.ghost.style.left = `${clientX - this.ghostHalfW}px`;
    this.ghost.style.top = `${clientY - this.ghostHalfH}px`;
  }

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (this.dragKind === null || e.pointerId !== this.dragPointerId) return;
    this.positionGhost(e.clientX, e.clientY);
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    if (this.dragKind === null || e.pointerId !== this.dragPointerId) return;
    const savedIdx = this.dragBlindIndex;
    const hx = e.clientX;
    const hy = e.clientY;
    this.clearDrag();

    if (!this.opts.isInteractive()) return;

    if (this.isPointInsideMyBlindZone(hx, hy)) return;
    this.opts.onBlindCardToTable(savedIdx, hx, hy);
  };

  private clearDrag(): void {
    this.dragKind = null;
    this.dragBlindIndex = -1;
    this.dragPointerId = -1;
    this.ghostHalfW = 70;
    this.ghostHalfH = 48;
    this.ghost.style.display = 'none';
    this.ghost.replaceChildren();
  }
}
