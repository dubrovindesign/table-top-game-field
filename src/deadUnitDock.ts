/**
 * Dead unit zones on the table (mine near my edge, opponent at the far edge).
 *
 * Two DOM surfaces per side:
 *   - `.dead-unit-zone` — compact slot (fixed size), always visible, pill centered inside.
 *   - `.dead-unit-zone-panel` — floating popup, sibling of slot, holds fallen-unit cards,
 *     visible only when `.dead-unit-table-wrap` has `.is-expanded`.
 *
 * Click on a non-empty slot toggles expansion. Click outside slot+panel closes it.
 * Expansion state is per-side, independent, and not synced over multiplayer.
 */

export type DeadZoneEntry = {
  boardInstanceId: string;
  label: string;
  points: number;
  /** Miniature/card thumbnail (resolved URL). When absent, a label-only placeholder is shown. */
  thumbSrc?: string;
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

export type Bounds = { left: number; top: number; width: number; height: number };

/**
 * Screen-space layout for one dead zone.
 * - `slot`: compact rectangle, always drawn, pill sits inside it.
 * - `panel`: popup rectangle above the slot; `null` when there are no entries (panel never opens).
 * - `cards`: positions relative to `panel.left/top` (not to slot).
 */
export type DeadZoneLayout = {
  slot: Bounds;
  panel: Bounds | null;
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

const DEAD_ZONE_BORDER_COLOR = 'rgba(200, 170, 110, 0.55)';

/** Click-vs-drag threshold for slot-tap toggle (screen-px, matches spec). */
const SLOT_TAP_MOVE_THRESHOLD_PX = 4;

function pointInBounds(x: number, y: number, b: Bounds): boolean {
  return x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
}

function applyBoundsAbsolute(wrap: HTMLElement, bounds: Bounds): void {
  wrap.style.left = `${Math.round(bounds.left)}px`;
  wrap.style.top = `${Math.round(bounds.top)}px`;
  wrap.style.width = `${Math.round(bounds.width)}px`;
  wrap.style.height = `${Math.round(bounds.height)}px`;
}

function applyBoundsRelative(
  child: HTMLElement,
  bounds: Bounds,
  origin: { left: number; top: number },
): void {
  child.style.left = `${Math.round(bounds.left - origin.left)}px`;
  child.style.top = `${Math.round(bounds.top - origin.top)}px`;
  child.style.width = `${Math.round(bounds.width)}px`;
  child.style.height = `${Math.round(bounds.height)}px`;
}

function unionBounds(a: Bounds, b: Bounds | null): Bounds {
  if (!b) return { ...a };
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return { left, top, width: right - left, height: bottom - top };
}

type SideKey = 'mine' | 'opp';
const SIDES: readonly SideKey[] = ['mine', 'opp'];

export class DeadUnitDock {
  private myWrap: HTMLElement;
  private myZone: HTMLElement;
  private myPanel: HTMLElement;
  private oppWrap: HTMLElement;
  private oppZone: HTMLElement;
  private oppPanel: HTMLElement;
  myScoreValueEl!: HTMLElement;
  oppScoreValueEl!: HTMLElement;
  myScoreBreakdownEl!: HTMLElement;
  oppScoreBreakdownEl!: HTMLElement;
  private lastMineLayout: DeadZoneLayout | null = null;
  private lastOppLayout: DeadZoneLayout | null = null;
  private lastVm: DeadZoneViewModel | null = null;
  private opts: DeadUnitDockOptions;
  private ghost: HTMLElement;
  private expanded: { mine: boolean; opp: boolean } = { mine: false, opp: false };
  private dragSide: SideKey | null = null;
  private dragCardIndex = -1;
  private dragPointerId = -1;
  /** Element that captured the pointer during an active dead-card drag (if any). */
  private dragCaptureEl: HTMLElement | null = null;
  private ghostHalfW = 70;
  private ghostHalfH = 48;
  /** Slot-tap tracking (click-vs-drag disambiguation for toggling the popup). */
  private slotTap: {
    side: SideKey | null;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } = { side: null, pointerId: -1, startX: 0, startY: 0, moved: false };

  constructor(_parent: HTMLElement, opts: DeadUnitDockOptions) {
    this.opts = opts;

    // Mine
    this.myWrap = el('div', 'dead-unit-table-wrap dead-unit-table-wrap--mine');
    this.myZone = el('div', 'dead-unit-zone dead-unit-zone--on-table');
    this.myPanel = el('div', 'dead-unit-zone-panel dead-unit-zone-panel--mine');
    const myScorePill = el('div', 'dead-score-pill');
    myScorePill.setAttribute('aria-label', 'Dead zone score (your side)');
    const myScoreValueEl = el('span', 'dead-score-pill__value');
    myScoreValueEl.textContent = '0';
    myScorePill.appendChild(myScoreValueEl);
    const myScoreBreakdownEl = el('span', 'dead-score-pill__breakdown');
    myScorePill.appendChild(myScoreBreakdownEl);
    this.myScoreValueEl = myScoreValueEl;
    this.myScoreBreakdownEl = myScoreBreakdownEl;
    this.myZone.appendChild(myScorePill);
    this.myWrap.appendChild(this.myZone);
    this.myWrap.appendChild(this.myPanel);
    document.body.appendChild(this.myWrap);

    // Opponent
    this.oppWrap = el('div', 'dead-unit-table-wrap dead-unit-table-wrap--opponent');
    this.oppZone = el('div', 'dead-unit-zone dead-unit-zone--on-table');
    this.oppPanel = el('div', 'dead-unit-zone-panel dead-unit-zone-panel--opp');
    const oppScorePill = el('div', 'dead-score-pill');
    oppScorePill.setAttribute('aria-label', 'Dead zone score (opponent side)');
    const oppScoreValueEl = el('span', 'dead-score-pill__value');
    oppScoreValueEl.textContent = '0';
    oppScorePill.appendChild(oppScoreValueEl);
    const oppScoreBreakdownEl = el('span', 'dead-score-pill__breakdown');
    oppScorePill.appendChild(oppScoreBreakdownEl);
    this.oppScoreValueEl = oppScoreValueEl;
    this.oppScoreBreakdownEl = oppScoreBreakdownEl;
    this.oppZone.appendChild(oppScorePill);
    this.oppWrap.appendChild(this.oppZone);
    this.oppWrap.appendChild(this.oppPanel);
    document.body.appendChild(this.oppWrap);

    this.ghost = el('div', 'dead-unit-dock-drag-ghost');
    this.ghost.style.display = 'none';
    document.body.appendChild(this.ghost);

    this.myZone.addEventListener('pointerdown', (e) => this.onSlotPointerDown(e, 'mine'));
    this.oppZone.addEventListener('pointerdown', (e) => this.onSlotPointerDown(e, 'opp'));

    window.addEventListener('pointerdown', this.onWindowPointerDown);
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerUp);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
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
    this.applyOneLayout(this.myWrap, this.myZone, this.myPanel, mine);
    this.applyOneLayout(this.oppWrap, this.oppZone, this.oppPanel, opp);
  }

  private applyOneLayout(
    wrap: HTMLElement,
    zone: HTMLElement,
    panel: HTMLElement,
    layout: DeadZoneLayout,
  ): void {
    const wrapBounds = unionBounds(layout.slot, layout.panel);
    applyBoundsAbsolute(wrap, wrapBounds);

    const zoom = Number.isFinite(layout.zoom) ? Math.max(0.05, layout.zoom) : 1;
    wrap.style.setProperty('--dead-unit-zoom', zoom.toFixed(4));
    const slotRadiusPx = Math.max(4, Math.round(layout.slot.height * 0.2));
    wrap.style.setProperty('--dead-unit-zone-radius', `${slotRadiusPx}px`);
    const bw = Math.max(0, Math.round(layout.borderScreenPx));

    applyBoundsRelative(zone, layout.slot, wrapBounds);
    zone.style.borderStyle = 'solid';
    zone.style.borderColor = DEAD_ZONE_BORDER_COLOR;
    zone.style.borderWidth = `${bw}px`;

    if (layout.panel) {
      applyBoundsRelative(panel, layout.panel, wrapBounds);
      panel.style.borderStyle = 'solid';
      panel.style.borderColor = DEAD_ZONE_BORDER_COLOR;
      panel.style.borderWidth = `${bw}px`;
    }

    // Position cards inside the panel; coordinates are already relative to panel origin.
    const kids = panel.children;
    const n = Math.min(kids.length, layout.cards.length);
    for (let i = 0; i < n; i++) {
      const cardEl = kids[i] as HTMLElement;
      const c = layout.cards[i]!;
      cardEl.style.position = 'absolute';
      cardEl.style.left = `${Math.round(c.left - bw)}px`;
      cardEl.style.top = `${Math.round(c.top - bw)}px`;
      cardEl.style.width = `${Math.round(c.width)}px`;
      cardEl.style.height = `${Math.round(c.height)}px`;
      cardEl.style.boxSizing = 'border-box';
      const cardRadiusPx = Math.max(3, Math.round(c.height * 0.105));
      cardEl.style.setProperty('--dead-unit-card-radius', `${cardRadiusPx}px`);
      cardEl.style.setProperty('--dead-unit-card-w', `${c.width}px`);
      cardEl.style.setProperty('--dead-unit-card-h', `${c.height}px`);
    }
  }

  /**
   * "Dead zone chrome" for pointer hit-testing of the field:
   * the compact slot (always) plus any expanded panel.
   */
  isPointOverDeadZoneChrome(clientX: number, clientY: number): boolean {
    for (const side of SIDES) {
      const layout = side === 'mine' ? this.lastMineLayout : this.lastOppLayout;
      if (!layout) continue;
      if (pointInBounds(clientX, clientY, layout.slot)) return true;
      if (this.expanded[side] && layout.panel && pointInBounds(clientX, clientY, layout.panel)) return true;
    }
    return false;
  }

  /**
   * Unified drop target for dragging a miniature into a dead zone.
   * Slot is always a valid drop target; expanded panel is also valid when open.
   * Precedence when both sides match (overlapping panels): 'mine' wins over 'opp'.
   */
  hitTestDeadZoneDropTarget(clientX: number, clientY: number): SideKey | null {
    for (const side of SIDES) {
      const layout = side === 'mine' ? this.lastMineLayout : this.lastOppLayout;
      if (!layout) continue;
      if (pointInBounds(clientX, clientY, layout.slot)) return side;
      if (this.expanded[side] && layout.panel && pointInBounds(clientX, clientY, layout.panel)) return side;
    }
    return null;
  }

  /** Cards inside an expanded panel (used for dragging fallen units back to the board). */
  hitTestDeadZoneCards(clientX: number, clientY: number): { side: SideKey; index: number } | null {
    for (const side of SIDES) {
      if (!this.expanded[side]) continue;
      const layout = side === 'mine' ? this.lastMineLayout : this.lastOppLayout;
      if (!layout || !layout.panel) continue;
      const idx = this.pickCardIndex(clientX, clientY, layout);
      if (idx !== null) return { side, index: idx };
    }
    return null;
  }

  /** Slot bounds (used as the zone-move drag handle; whole compact slot is the handle). */
  hitTestDeadZoneBorder(clientX: number, clientY: number): SideKey | null {
    if (this.lastMineLayout && pointInBounds(clientX, clientY, this.lastMineLayout.slot)) return 'mine';
    if (this.lastOppLayout && pointInBounds(clientX, clientY, this.lastOppLayout.slot)) return 'opp';
    return null;
  }

  /**
   * Zone body hit-test — same as the border in the new compact design
   * (the entire slot is the drag handle).
   */
  hitTestDeadZoneMoveHandle(clientX: number, clientY: number): SideKey | null {
    return this.hitTestDeadZoneBorder(clientX, clientY);
  }

  private pickCardIndex(clientX: number, clientY: number, layout: DeadZoneLayout): number | null {
    if (!layout.panel) return null;
    const baseL = layout.panel.left;
    const baseT = layout.panel.top;
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

    // An expanded panel whose entries disappeared must collapse — we never show an empty popup.
    if (vm.myEntries.length === 0 && this.expanded.mine) this.expanded.mine = false;
    if (vm.opponentEntries.length === 0 && this.expanded.opp) this.expanded.opp = false;

    this.myPanel.replaceChildren();
    vm.myEntries.forEach((entry, index) => {
      const tile = this.makeMinePlaceholder(entry, index);
      if (vm.interactive) {
        tile.style.cursor = 'grab';
        tile.addEventListener('pointerdown', (e) => this.onDeadCardPointerDown(e, 'mine', index));
      }
      this.myPanel.appendChild(tile);
    });

    this.oppPanel.replaceChildren();
    vm.opponentEntries.forEach((entry, index) => {
      const tile = this.makeOpponentPlaceholder(entry, index);
      if (vm.interactive) {
        tile.style.cursor = 'grab';
        tile.addEventListener('pointerdown', (e) => this.onDeadCardPointerDown(e, 'opp', index));
      }
      this.oppPanel.appendChild(tile);
    });

    this.applyExpandedClasses();
  }

  private applyExpandedClasses(): void {
    this.myWrap.classList.toggle('is-expanded', this.expanded.mine);
    this.oppWrap.classList.toggle('is-expanded', this.expanded.opp);
  }

  private makeMinePlaceholder(entry: DeadZoneEntry, index: number): HTMLElement {
    return this.makeCardTile(entry, index, 'mine');
  }

  private makeOpponentPlaceholder(entry: DeadZoneEntry, index: number): HTMLElement {
    return this.makeCardTile(entry, index, 'opp');
  }

  /**
   * Fallen-unit tile: unit thumbnail filling the card with a yellow points badge overlay
   * (army-roster style). Label is exposed via `title` / `aria-label` for accessibility
   * but not rendered on top of the image to keep the tile visually clean.
   * Falls back to a label-centered placeholder when no thumbnail is available.
   */
  private makeCardTile(entry: DeadZoneEntry, index: number, side: SideKey): HTMLElement {
    const sideCls = side === 'mine' ? 'dead-unit-dock-card--mine' : 'dead-unit-dock-card--opp';
    const d = el('div', `dead-unit-dock-card dead-unit-dock-card--slot ${sideCls}`);
    d.dataset.deadIndex = String(index);
    d.dataset.boardInstanceId = entry.boardInstanceId;
    const label = entry.label.trim() || '?';
    d.title = label;
    d.setAttribute('aria-label', `${label}: ${entry.points}`);

    const portrait = el('div', 'dead-unit-dock-card__portrait');
    if (entry.thumbSrc) {
      const img = el('img', 'dead-unit-dock-card__thumb');
      img.src = entry.thumbSrc;
      img.alt = '';
      img.draggable = false;
      portrait.appendChild(img);
    } else {
      const shortLabel = label.length > 14 ? `${label.slice(0, 12)}…` : label;
      portrait.appendChild(el('span', 'dead-unit-dock-card__label', shortLabel));
    }
    const pts = Number.isFinite(entry.points) ? entry.points : 0;
    portrait.appendChild(el('span', 'dead-unit-dock-card__badge--pts', String(pts)));

    d.appendChild(portrait);
    return d;
  }

  private onSlotPointerDown(e: PointerEvent, side: SideKey): void {
    if (e.button !== 0) return;
    // Don't start a tap-toggle while a dead-card drag is in progress.
    if (this.dragSide !== null) return;
    this.slotTap = {
      side,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }

  private onDeadCardPointerDown(e: PointerEvent, side: SideKey, cardIndex: number): void {
    if (!this.opts.isInteractive() || e.button !== 0) return;
    const vm = this.lastVm;
    if (!vm) return;
    const list = side === 'mine' ? vm.myEntries : vm.opponentEntries;
    if (!list[cardIndex]) return;
    e.preventDefault();
    // A card drag takes precedence over any pending slot-tap.
    this.slotTap = { side: null, pointerId: -1, startX: 0, startY: 0, moved: false };
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
    // Reset panel-relative positioning that was applied to the original card —
    // inside the ghost wrapper the clone must sit at 0,0 so it ends up centered
    // under the cursor regardless of the card's index in the panel stack.
    ghostCard.style.position = 'static';
    ghostCard.style.left = '';
    ghostCard.style.top = '';
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

  private onWindowPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Close any expanded side whose slot and panel do NOT contain the pointer.
    let changed = false;
    for (const side of SIDES) {
      if (!this.expanded[side]) continue;
      const layout = side === 'mine' ? this.lastMineLayout : this.lastOppLayout;
      if (!layout) {
        this.expanded[side] = false;
        changed = true;
        continue;
      }
      const inSlot = pointInBounds(e.clientX, e.clientY, layout.slot);
      const inPanel = layout.panel !== null && pointInBounds(e.clientX, e.clientY, layout.panel);
      if (!inSlot && !inPanel) {
        this.expanded[side] = false;
        changed = true;
      }
    }
    if (changed) this.applyExpandedClasses();
  };

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (this.slotTap.side !== null && e.pointerId === this.slotTap.pointerId) {
      const dx = e.clientX - this.slotTap.startX;
      const dy = e.clientY - this.slotTap.startY;
      if (Math.hypot(dx, dy) >= SLOT_TAP_MOVE_THRESHOLD_PX) this.slotTap.moved = true;
    }
    if (this.dragSide === null || e.pointerId !== this.dragPointerId) return;
    this.positionGhost(e.clientX, e.clientY);
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    // Slot-tap → toggle if the pointer stayed within the tap threshold.
    if (this.slotTap.side !== null && e.pointerId === this.slotTap.pointerId) {
      const { side, moved } = this.slotTap;
      this.slotTap = { side: null, pointerId: -1, startX: 0, startY: 0, moved: false };
      if (!moved && side !== null) this.toggleExpanded(side);
    }

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

  private toggleExpanded(side: SideKey): void {
    const vm = this.lastVm;
    if (!vm) return;
    const entries = side === 'mine' ? vm.myEntries : vm.opponentEntries;
    if (entries.length === 0) return;
    this.expanded[side] = !this.expanded[side];
    this.applyExpandedClasses();
  }

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
