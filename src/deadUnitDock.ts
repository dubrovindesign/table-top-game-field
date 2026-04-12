/**
 * Dead unit zones on the table (mine near my edge, opponent at the far edge).
 * Layout and hit-testing mirror GodHandBlindDock; card bodies are placeholder stubs until wired to real unit art.
 */

export type DeadZoneEntry = {
  boardInstanceId: string;
  label: string;
  points: number;
};

export type DeadZoneViewModel = {
  interactive: boolean;
  myEntries: DeadZoneEntry[];
  opponentEntries: DeadZoneEntry[];
};

export type DeadUnitDockDragEnd = {
  side: 'mine' | 'opp';
  cardIndex: number;
  clientX: number;
  clientY: number;
};

export type DeadUnitDockOptions = {
  isInteractive: () => boolean;
  onDragEnd: (p: DeadUnitDockDragEnd) => void;
};

/** Screen rects: container is outer box with border; card rects are relative to container origin. */
export type DeadZoneLayout = {
  container: { left: number; top: number; width: number; height: number };
  cards: Array<{ left: number; top: number; width: number; height: number }>;
  borderScreenPx: number;
  zoom: number;
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

const DEAD_ZONE_BORDER_COLOR = 'rgba(255, 120, 120, 0.72)';

function applyBounds(
  wrap: HTMLElement,
  bounds: { left: number; top: number; width: number; height: number },
): void {
  wrap.style.left = `${Math.round(bounds.left)}px`;
  wrap.style.top = `${Math.round(bounds.top)}px`;
  wrap.style.width = `${Math.round(bounds.width)}px`;
  wrap.style.height = `${Math.round(bounds.height)}px`;
}

function pointInBorderBand(
  clientX: number,
  clientY: number,
  layout: DeadZoneLayout,
): boolean {
  const { container, borderScreenPx: b } = layout;
  const L = container.left;
  const T = container.top;
  const R = L + container.width;
  const B = T + container.height;
  if (clientX < L || clientX > R || clientY < T || clientY > B) return false;
  if (b <= 0) return false;
  if (clientX >= L + b && clientX <= R - b && clientY >= T + b && clientY <= B - b) return false;
  return true;
}

function pointInCards(
  clientX: number,
  clientY: number,
  layout: DeadZoneLayout,
): boolean {
  const baseL = layout.container.left;
  const baseT = layout.container.top;
  for (const c of layout.cards) {
    const left = baseL + c.left;
    const top = baseT + c.top;
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

function pointInContainer(clientX: number, clientY: number, layout: DeadZoneLayout): boolean {
  const L = layout.container.left;
  const T = layout.container.top;
  const R = L + layout.container.width;
  const B = T + layout.container.height;
  return clientX >= L && clientX <= R && clientY >= T && clientY <= B;
}

export class DeadUnitDock {
  private myWrap: HTMLElement;
  private myZone: HTMLElement;
  private myInner: HTMLElement;
  private oppWrap: HTMLElement;
  private oppZone: HTMLElement;
  private oppInner: HTMLElement;
  private lastMineLayout: DeadZoneLayout | null = null;
  private lastOppLayout: DeadZoneLayout | null = null;
  private lastVm: DeadZoneViewModel | null = null;
  private opts: DeadUnitDockOptions;
  private ghost: HTMLElement;
  private dragSide: 'mine' | 'opp' | null = null;
  private dragCardIndex = -1;
  private dragPointerId = -1;
  /** Element that captured the pointer during an active dead-card drag (if any). */
  private dragCaptureEl: HTMLElement | null = null;
  private ghostHalfW = 70;
  private ghostHalfH = 48;

  constructor(_parent: HTMLElement, opts: DeadUnitDockOptions) {
    this.opts = opts;
    this.myWrap = el('div', 'dead-unit-table-wrap dead-unit-table-wrap--mine');
    this.myZone = el('div', 'dead-unit-zone dead-unit-zone--on-table');
    this.myInner = el('div', 'dead-unit-zone-inner');
    this.myZone.appendChild(this.myInner);
    this.myWrap.appendChild(this.myZone);
    document.body.appendChild(this.myWrap);

    this.oppWrap = el('div', 'dead-unit-table-wrap dead-unit-table-wrap--opponent');
    this.oppZone = el('div', 'dead-unit-zone dead-unit-zone--on-table');
    this.oppInner = el('div', 'dead-unit-zone-inner');
    this.oppZone.appendChild(this.oppInner);
    this.oppWrap.appendChild(this.oppZone);
    document.body.appendChild(this.oppWrap);

    this.ghost = el('div', 'dead-unit-dock-drag-ghost');
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
    this.myWrap.remove();
    this.oppWrap.remove();
  }

  /**
   * End any in-progress dead-card drag without firing `onDragEnd`.
   * Call before replacing dock DOM (e.g. remote snapshot) so ghost/capture state cannot survive refresh.
   */
  cancelActiveDrag(): void {
    this.clearDrag();
  }

  applyDualLayouts(mine: DeadZoneLayout, opp: DeadZoneLayout): void {
    this.lastMineLayout = mine;
    this.lastOppLayout = opp;
    this.applyOneLayout(this.myWrap, this.myZone, this.myInner, mine);
    this.applyOneLayout(this.oppWrap, this.oppZone, this.oppInner, opp);
  }

  private applyOneLayout(
    wrap: HTMLElement,
    zone: HTMLElement,
    inner: HTMLElement,
    layout: DeadZoneLayout,
  ): void {
    applyBounds(wrap, layout.container);
    const zoom = Number.isFinite(layout.zoom) ? Math.max(0.05, layout.zoom) : 1;
    wrap.style.setProperty('--dead-unit-zoom', zoom.toFixed(4));
    const zoneRadiusPx = Math.max(4, Math.round(layout.container.height * 0.18));
    wrap.style.setProperty('--dead-unit-zone-radius', `${zoneRadiusPx}px`);
    const bw = Math.max(0, Math.round(layout.borderScreenPx));
    zone.style.borderStyle = 'solid';
    zone.style.borderColor = DEAD_ZONE_BORDER_COLOR;
    zone.style.borderWidth = `${bw}px`;
    const kids = inner.children;
    const n = Math.min(kids.length, layout.cards.length);
    const b = bw;
    for (let i = 0; i < n; i++) {
      const cardEl = kids[i] as HTMLElement;
      const c = layout.cards[i]!;
      cardEl.style.position = 'absolute';
      cardEl.style.left = `${Math.round(c.left - b)}px`;
      cardEl.style.top = `${Math.round(c.top - b)}px`;
      cardEl.style.width = `${Math.round(c.width)}px`;
      cardEl.style.height = `${Math.round(c.height)}px`;
      cardEl.style.boxSizing = 'border-box';
      const cardRadiusPx = Math.max(3, Math.round(c.height * 0.105));
      cardEl.style.setProperty('--dead-unit-card-radius', `${cardRadiusPx}px`);
      cardEl.style.setProperty('--dead-unit-card-w', `${c.width}px`);
      cardEl.style.setProperty('--dead-unit-card-h', `${c.height}px`);
    }
  }

  isPointOverDeadZoneChrome(clientX: number, clientY: number): boolean {
    if (!this.lastMineLayout && !this.lastOppLayout) return false;
    for (const layout of [this.lastMineLayout, this.lastOppLayout]) {
      if (!layout) continue;
      if (pointInBorderBand(clientX, clientY, layout)) return true;
      if (pointInCards(clientX, clientY, layout)) return true;
    }
    return false;
  }

  /** Inner card bodies only (not the outer border band) for both zones. */
  hitTestDeadZoneCards(clientX: number, clientY: number): { side: 'mine' | 'opp'; index: number } | null {
    if (this.lastMineLayout && pointInCards(clientX, clientY, this.lastMineLayout)) {
      const idx = this.pickCardIndex(clientX, clientY, this.lastMineLayout);
      if (idx !== null) return { side: 'mine', index: idx };
    }
    if (this.lastOppLayout && pointInCards(clientX, clientY, this.lastOppLayout)) {
      const idx = this.pickCardIndex(clientX, clientY, this.lastOppLayout);
      if (idx !== null) return { side: 'opp', index: idx };
    }
    return null;
  }

  /** Border band only (no cards): useful for dragging zone position without stealing card drags. */
  hitTestDeadZoneBorder(clientX: number, clientY: number): 'mine' | 'opp' | null {
    if (this.lastMineLayout && pointInBorderBand(clientX, clientY, this.lastMineLayout)) return 'mine';
    if (this.lastOppLayout && pointInBorderBand(clientX, clientY, this.lastOppLayout)) return 'opp';
    return null;
  }

  /**
   * Zone body/background hit-test (container minus card rects).
   * Used to drag the zone itself without stealing dead-card drags.
   */
  hitTestDeadZoneMoveHandle(clientX: number, clientY: number): 'mine' | 'opp' | null {
    if (
      this.lastMineLayout &&
      pointInContainer(clientX, clientY, this.lastMineLayout) &&
      !pointInCards(clientX, clientY, this.lastMineLayout)
    ) {
      return 'mine';
    }
    if (
      this.lastOppLayout &&
      pointInContainer(clientX, clientY, this.lastOppLayout) &&
      !pointInCards(clientX, clientY, this.lastOppLayout)
    ) {
      return 'opp';
    }
    return null;
  }

  private pickCardIndex(clientX: number, clientY: number, layout: DeadZoneLayout): number | null {
    const baseL = layout.container.left;
    const baseT = layout.container.top;
    for (let i = 0; i < layout.cards.length; i++) {
      const c = layout.cards[i]!;
      const left = baseL + c.left;
      const top = baseT + c.top;
      if (
        clientX >= left &&
        clientX <= left + c.width &&
        clientY >= top &&
        clientY <= top + c.height
      ) {
        return i;
      }
    }
    return null;
  }

  refresh(vm: DeadZoneViewModel): void {
    this.cancelActiveDrag();
    this.lastVm = vm;
    this.myWrap.classList.toggle('dead-unit-table-wrap--inactive', !vm.interactive);

    this.myInner.replaceChildren();
    vm.myEntries.forEach((entry, index) => {
      const tile = this.makeMinePlaceholder(entry, index);
      if (vm.interactive) {
        tile.style.cursor = 'grab';
        tile.addEventListener('pointerdown', (e) => this.onDeadCardPointerDown(e, 'mine', index));
      }
      this.myInner.appendChild(tile);
    });

    this.oppInner.replaceChildren();
    vm.opponentEntries.forEach((entry, index) => {
      const tile = this.makeOpponentPlaceholder(entry, index);
      if (vm.interactive) {
        tile.style.cursor = 'grab';
        tile.addEventListener('pointerdown', (e) => this.onDeadCardPointerDown(e, 'opp', index));
      }
      this.oppInner.appendChild(tile);
    });
  }

  /** Placeholder tile: label + points; swap for unit art when wired. */
  private makeMinePlaceholder(entry: DeadZoneEntry, index: number): HTMLElement {
    const d = el(
      'div',
      'dead-unit-dock-card dead-unit-dock-card--slot dead-unit-dock-card--mine dead-unit-dock-card--stack',
    );
    d.dataset.deadIndex = String(index);
    d.dataset.boardInstanceId = entry.boardInstanceId;
    const raw = entry.label.trim();
    const label =
      raw.length > 22 ? `${raw.slice(0, 19)}...` : raw.length > 0 ? raw : '?';
    d.appendChild(el('span', 'dead-unit-dock-card__label', label));
    const pts = Number.isFinite(entry.points) ? entry.points : 0;
    d.appendChild(el('span', 'dead-unit-dock-card__points', String(pts)));
    return d;
  }

  /** Opponent tile: visible like mine; dead zones are public for both players. */
  private makeOpponentPlaceholder(entry: DeadZoneEntry, index: number): HTMLElement {
    const d = el(
      'div',
      'dead-unit-dock-card dead-unit-dock-card--slot dead-unit-dock-card--opp dead-unit-dock-card--stack',
    );
    d.dataset.deadIndex = String(index);
    d.dataset.boardInstanceId = entry.boardInstanceId;
    const raw = entry.label.trim();
    const label = raw.length > 22 ? `${raw.slice(0, 19)}...` : raw.length > 0 ? raw : '?';
    d.appendChild(el('span', 'dead-unit-dock-card__label', label));
    const pts = Number.isFinite(entry.points) ? entry.points : 0;
    d.appendChild(el('span', 'dead-unit-dock-card__points', String(pts)));
    return d;
  }

  private onDeadCardPointerDown(e: PointerEvent, side: 'mine' | 'opp', cardIndex: number): void {
    if (!this.opts.isInteractive() || e.button !== 0) return;
    const vm = this.lastVm;
    if (!vm) return;
    const list = side === 'mine' ? vm.myEntries : vm.opponentEntries;
    if (!list[cardIndex]) return;
    e.preventDefault();
    this.dragSide = side;
    this.dragCardIndex = cardIndex;
    this.dragPointerId = e.pointerId;
    const source = e.currentTarget as HTMLElement;
    this.dragCaptureEl = source;
    try {
      source.setPointerCapture(e.pointerId);
    } catch {
      this.dragSide = null;
      this.dragCardIndex = -1;
      this.dragPointerId = -1;
      this.dragCaptureEl = null;
      return;
    }

    const ghostCard = source.cloneNode(true) as HTMLElement;
    ghostCard.classList.add('dead-unit-dock-card--ghost');
    const srcRect = source.getBoundingClientRect();
    const ghostW = Math.max(1, Math.round(srcRect.width));
    const ghostH = Math.max(1, Math.round(srcRect.height));
    this.ghostHalfW = ghostW / 2;
    this.ghostHalfH = ghostH / 2;
    ghostCard.style.width = `${ghostW}px`;
    ghostCard.style.height = `${ghostH}px`;
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
    if (this.dragSide === null || e.pointerId !== this.dragPointerId) return;
    this.positionGhost(e.clientX, e.clientY);
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    if (this.dragSide === null || e.pointerId !== this.dragPointerId) return;
    const side = this.dragSide;
    const idx = this.dragCardIndex;
    const hx = e.clientX;
    const hy = e.clientY;
    this.clearDrag();

    if (!this.opts.isInteractive()) return;
    if (idx < 0) return;
    this.opts.onDragEnd({ side, cardIndex: idx, clientX: hx, clientY: hy });
  };

  private clearDrag(): void {
    if (this.dragCaptureEl !== null && this.dragPointerId >= 0) {
      try {
        this.dragCaptureEl.releasePointerCapture(this.dragPointerId);
      } catch {
        /* not capturing */
      }
    }
    this.dragCaptureEl = null;
    this.dragSide = null;
    this.dragCardIndex = -1;
    this.dragPointerId = -1;
    this.ghostHalfW = 70;
    this.ghostHalfH = 48;
    this.ghost.style.display = 'none';
    this.ghost.replaceChildren();
  }
}
