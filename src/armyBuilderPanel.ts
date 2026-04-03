/**
 * Army Builder — slide-in panel: factions, leader strip (click = filter), roster list, Alt+hover, DnD.
 */

import {
  ARMY_POINTS_CAP,
  FACTIONS,
  getCatalogUnit,
  leadersForFaction,
  LEADER_MINI_MAX_COPIES,
  listRosterRows,
  type LeaderDef,
  type RosterRowView,
} from './armyCatalog';
import { GOD_CARDS } from './godCards';
import { UnitCard, type DiceRequest } from './unitCard';

const DND_MIME = 'application/x-army-unit';

export type ArmyDragPayload =
  | { kind: 'troop'; leaderId: string; unitId: string }
  | { kind: 'leader'; leaderId: string; unitId: string }
  | { kind: 'god'; cardId: string };

export type ArmyPanelOptions = {
  getAltKeyHeld: () => boolean;
  getUsedCount: (leaderId: string, unitId: string) => number;
  getPointsSpent: () => number;
  onDiceRequest?: (req: DiceRequest) => void;
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

export class ArmyBuilderPanel {
  private root: HTMLElement;
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private menuWrap: HTMLElement;
  private menuPopover: HTMLElement;
  private factionTabs: HTMLElement;
  private leadersSection: HTMLElement;
  private leadersListEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private pointsEl: HTMLElement;
  private listEl: HTMLElement;
  private godSection: HTMLElement;
  private godCatalogEl: HTMLElement;
  private open = false;
  private selectedFactionId: string;
  private selectedLeaderId: string;
  private hoverCard: UnitCard;
  private hoverRowUnitId: string | null = null;
  private opts: ArmyPanelOptions;
  private boundKey = (e: KeyboardEvent) => this.onGlobalKey(e);
  private boundMove = (e: PointerEvent) => this.onGlobalPointerMove(e);

  constructor(parent: HTMLElement, opts: ArmyPanelOptions) {
    this.opts = opts;
    this.selectedFactionId = FACTIONS[0]?.id ?? '';
    const firstLeaders = leadersForFaction(this.selectedFactionId);
    this.selectedLeaderId = firstLeaders[0]?.id ?? '';

    this.root = el('div', 'army-builder-root');
    parent.appendChild(this.root);

    this.menuWrap = el('div', 'army-menu-wrap');
    const menuBtn = el('button', 'army-menu-btn', '☰');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    this.menuPopover = el('div', 'army-menu-popover');
    this.menuPopover.setAttribute('role', 'menu');
    const openArmyBtn = el('button', 'army-menu-item', 'Добавить юнитов');
    openArmyBtn.type = 'button';
    openArmyBtn.setAttribute('role', 'menuitem');
    this.menuPopover.appendChild(openArmyBtn);
    this.menuWrap.appendChild(menuBtn);
    this.menuWrap.appendChild(this.menuPopover);
    this.root.appendChild(this.menuWrap);

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const vis = this.menuPopover.classList.toggle('army-menu-popover-visible');
      menuBtn.setAttribute('aria-expanded', vis ? 'true' : 'false');
    });
    openArmyBtn.addEventListener('click', () => {
      this.menuPopover.classList.remove('army-menu-popover-visible');
      menuBtn.setAttribute('aria-expanded', 'false');
      this.setOpen(true);
    });
    document.addEventListener('click', () => {
      this.menuPopover.classList.remove('army-menu-popover-visible');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
    this.menuPopover.addEventListener('click', (e) => e.stopPropagation());

    this.overlay = el('div', 'army-panel-overlay');
    this.overlay.addEventListener('click', () => this.setOpen(false));

    this.panel = el('aside', 'army-panel');
    const header = el('div', 'army-panel-header');
    const title = el('div', 'army-panel-title', 'Армия');
    const closeBtn = el('button', 'army-panel-close', '×');
    closeBtn.type = 'button';
    header.appendChild(title);
    header.appendChild(closeBtn);
    closeBtn.addEventListener('click', () => this.setOpen(false));

    this.factionTabs = el('div', 'army-faction-tabs');

    this.leadersSection = el('div', 'army-leaders-section');
    const leadersTitle = el('div', 'army-section-title', 'Лидеры');
    this.leadersListEl = el('div', 'army-leaders-list');
    this.leadersSection.appendChild(leadersTitle);
    this.leadersSection.appendChild(this.leadersListEl);

    this.searchInput = el('input', 'army-search-input') as HTMLInputElement;
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Имя или ключевое слово…';
    const searchLabel = el('label', 'army-field-label');
    const searchSpan = el('span', 'army-field-label-text', 'Поиск');
    searchLabel.appendChild(searchSpan);
    searchLabel.appendChild(this.searchInput);

    const rosterTitle = el('div', 'army-section-title', 'Ростер');

    this.pointsEl = el('div', 'army-points-bar', '0 / 300');

    this.listEl = el('div', 'army-unit-list');

    this.panel.appendChild(header);
    this.panel.appendChild(this.pointsEl);
    this.panel.appendChild(this.factionTabs);
    this.panel.appendChild(this.leadersSection);
    this.panel.appendChild(searchLabel);
    this.panel.appendChild(rosterTitle);
    this.panel.appendChild(this.listEl);

    const godTitle = el('div', 'army-section-title', 'Карты богов');
    this.godSection = el('div', 'army-god-section');
    const godHint = el(
      'div',
      'army-god-hint',
      'Перетащите карту на поле или за пределы сетки — как юнита или лидера. На столе карту можно снова сдвинуть; в зону сброса внизу — положить в сброс.',
    );
    const catLabel = el('div', 'army-field-label-text', 'Каталог');
    catLabel.classList.add('army-god-catalog-label');
    this.godCatalogEl = el('div', 'army-god-catalog');
    this.godSection.appendChild(godHint);
    this.godSection.appendChild(catLabel);
    this.godSection.appendChild(this.godCatalogEl);
    this.panel.appendChild(godTitle);
    this.panel.appendChild(this.godSection);

    this.root.appendChild(this.overlay);
    this.root.appendChild(this.panel);

    this.hoverCard = new UnitCard(this.root, 'army-catalog-hover');
    if (opts.onDiceRequest) {
      this.hoverCard.onDiceRequest = opts.onDiceRequest;
    }

    this.buildFactionTabs();
    this.renderLeaders();
    this.searchInput.addEventListener('input', () => this.renderList());
    this.renderList();
    this.renderGodSection();

    window.addEventListener('keydown', this.boundKey);
    window.addEventListener('pointermove', this.boundMove, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('pointermove', this.boundMove);
    this.root.remove();
  }

  isPanelOpen(): boolean {
    return this.open;
  }

  /** True if coordinates are over the slide-in panel (not overlay). */
  isScreenPointOverPanel(screenX: number, screenY: number): boolean {
    if (!this.open) return false;
    const r = this.panel.getBoundingClientRect();
    return (
      screenX >= r.left &&
      screenX < r.right &&
      screenY >= r.top &&
      screenY < r.bottom
    );
  }

  refresh(): void {
    this.updatePointsBar();
    this.renderLeaders();
    this.renderList();
    this.renderGodSection();
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.open) {
      this.setOpen(false);
    }
  }

  private panelHoverTargetRow(el: EventTarget | null): HTMLElement | null {
    const t = el as HTMLElement | null;
    const row = t?.closest?.('.army-unit-row') as HTMLElement | null;
    if (!row) return null;
    if (!this.leadersListEl.contains(row) && !this.listEl.contains(row)) return null;
    return row;
  }

  private onGlobalPointerMove(e: PointerEvent): void {
    if (!this.opts.getAltKeyHeld() || !this.open) {
      this.hideHoverCard();
      return;
    }
    if (!this.isScreenPointOverPanel(e.clientX, e.clientY)) {
      this.hideHoverCard();
      return;
    }
    const row = this.panelHoverTargetRow(e.target);
    if (!row) {
      this.hideHoverCard();
      return;
    }
    const unitId = row.dataset.unitId ?? null;
    if (!unitId) {
      this.hideHoverCard();
      return;
    }
    const def = getCatalogUnit(unitId);
    if (!def) {
      this.hideHoverCard();
      return;
    }
    if (unitId === this.hoverRowUnitId) {
      this.hoverCard.repositionFloating(e.clientX, e.clientY);
      return;
    }
    this.hoverRowUnitId = unitId;
    this.hoverCard.show(def.card, { x: e.clientX, y: e.clientY });
  }

  private hideHoverCard(): void {
    this.hoverRowUnitId = null;
    this.hoverCard.hide();
  }

  private setOpen(v: boolean): void {
    this.open = v;
    this.overlay.classList.toggle('army-panel-overlay-visible', v);
    this.panel.classList.toggle('army-panel-open', v);
    if (!v) this.hideHoverCard();
    if (v) this.refresh();
  }

  private buildFactionTabs(): void {
    this.factionTabs.replaceChildren();
    for (const f of FACTIONS) {
      const tab = el('button', 'army-faction-tab', f.name.slice(0, 2).toUpperCase());
      tab.type = 'button';
      tab.title = `${f.name} (${f.domain})`;
      tab.dataset.factionId = f.id;
      if (f.id === this.selectedFactionId) tab.classList.add('army-faction-tab-active');
      tab.addEventListener('click', () => this.selectFaction(f.id));
      this.factionTabs.appendChild(tab);
    }
  }

  private selectFaction(factionId: string): void {
    this.selectedFactionId = factionId;
    for (const child of this.factionTabs.children) {
      const b = child as HTMLElement;
      b.classList.toggle('army-faction-tab-active', b.dataset.factionId === factionId);
    }
    const leaders = leadersForFaction(factionId);
    if (!leaders.some((l) => l.id === this.selectedLeaderId)) {
      this.selectedLeaderId = leaders[0]?.id ?? '';
    }
    this.renderLeaders();
    this.renderList();
  }

  private selectLeader(leaderId: string): void {
    this.selectedLeaderId = leaderId;
    this.syncLeaderRowActiveClass();
    this.renderList();
  }

  private syncLeaderRowActiveClass(): void {
    for (const child of this.leadersListEl.children) {
      const row = child as HTMLElement;
      row.classList.toggle('army-leader-row-active', row.dataset.leaderId === this.selectedLeaderId);
    }
  }

  private renderLeaders(): void {
    this.leadersListEl.replaceChildren();
    const leaders = leadersForFaction(this.selectedFactionId);
    for (const l of leaders) {
      this.leadersListEl.appendChild(this.makeLeaderRow(l));
    }
    this.syncLeaderRowActiveClass();
  }

  private makeLeaderRow(l: LeaderDef): HTMLElement {
    const def = getCatalogUnit(l.catalogUnitId);
    const wrap = el('div', 'army-unit-row army-leader-row');
    wrap.dataset.leaderId = l.id;
    wrap.dataset.unitId = l.catalogUnitId;
    const used = this.opts.getUsedCount(l.id, l.catalogUnitId);
    const atMax = used >= LEADER_MINI_MAX_COPIES;
    if (atMax) wrap.classList.add('army-unit-row-disabled');
    wrap.draggable = !atMax;

    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      this.selectLeader(l.id);
    });

    const thumb = el('div', 'army-unit-thumb');
    if (def?.card.sprite) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = def.card.sprite;
      img.alt = '';
      thumb.appendChild(img);
    }

    const meta = el('div', 'army-unit-meta');
    const name = el('div', 'army-unit-name', l.name);
    const sub = el('div', 'army-unit-sub');
    const pts = def?.points ?? 0;
    sub.textContent =
      pts > 0 ? `${pts} pts · ${used}/${LEADER_MINI_MAX_COPIES}` : `Лидер · ${used}/${LEADER_MINI_MAX_COPIES}`;

    meta.appendChild(name);
    meta.appendChild(sub);
    wrap.appendChild(thumb);
    wrap.appendChild(meta);

    wrap.addEventListener('dragstart', (e) => {
      if (atMax) {
        e.preventDefault();
        return;
      }
      const payload: ArmyDragPayload = {
        kind: 'leader',
        leaderId: l.id,
        unitId: l.catalogUnitId,
      };
      e.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
      e.dataTransfer?.setData('text/plain', l.catalogUnitId);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }

  private updatePointsBar(): void {
    const spent = this.opts.getPointsSpent();
    const over = spent > ARMY_POINTS_CAP;
    this.pointsEl.textContent = `${spent} / ${ARMY_POINTS_CAP}`;
    this.pointsEl.classList.toggle('army-points-over', over);
    if (over) {
      this.pointsEl.title = `Перерасход: +${spent - ARMY_POINTS_CAP}`;
    } else {
      this.pointsEl.title = '';
    }
  }

  private renderList(): void {
    this.updatePointsBar();
    this.syncLeaderRowActiveClass();
    this.listEl.replaceChildren();
    if (!this.selectedLeaderId) return;

    const rows = listRosterRows(this.selectedLeaderId, this.searchInput.value, this.opts.getUsedCount);
    for (const row of rows) {
      this.listEl.appendChild(this.makeTroopRow(row));
    }
    if (rows.length === 0) {
      this.listEl.appendChild(el('div', 'army-list-empty', 'Нет юнитов по фильтру'));
    }
  }

  private makeTroopRow(row: RosterRowView): HTMLElement {
    const wrap = el('div', 'army-unit-row');
    wrap.dataset.unitId = row.unitId;
    const atMax = row.used >= row.maxCopies;
    if (atMax) wrap.classList.add('army-unit-row-disabled');
    wrap.draggable = !atMax;

    const thumb = el('div', 'army-unit-thumb');
    if (row.card.sprite) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = row.card.sprite;
      img.alt = '';
      thumb.appendChild(img);
    }

    const meta = el('div', 'army-unit-meta');
    const name = el('div', 'army-unit-name', row.name);
    const sub = el('div', 'army-unit-sub');
    sub.textContent = `${row.points} pts · ${row.used}/${row.maxCopies}`;

    meta.appendChild(name);
    meta.appendChild(sub);
    wrap.appendChild(thumb);
    wrap.appendChild(meta);

    wrap.addEventListener('dragstart', (e) => {
      if (atMax) {
        e.preventDefault();
        return;
      }
      const payload: ArmyDragPayload = {
        kind: 'troop',
        leaderId: this.selectedLeaderId,
        unitId: row.unitId,
      };
      e.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
      e.dataTransfer?.setData('text/plain', row.unitId);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }

  private renderGodSection(): void {
    this.godCatalogEl.replaceChildren();
    for (const c of GOD_CARDS) {
      this.godCatalogEl.appendChild(this.makeGodCardRow(c));
    }
  }

  private makeGodCardRow(c: (typeof GOD_CARDS)[number]): HTMLElement {
    const wrap = el('div', 'army-unit-row army-god-dnd-row');
    wrap.dataset.godCardId = c.id;
    wrap.draggable = true;

    const thumb = el('div', 'army-unit-thumb army-god-thumb');
    thumb.appendChild(el('div', 'army-god-thumb-mark', '✦'));

    const meta = el('div', 'army-unit-meta');
    const name = el('div', 'army-unit-name', c.title);
    const sub = el('div', 'army-unit-sub');
    sub.textContent = c.text.length > 72 ? `${c.text.slice(0, 70)}…` : c.text;

    meta.appendChild(name);
    meta.appendChild(sub);
    wrap.appendChild(thumb);
    wrap.appendChild(meta);

    wrap.addEventListener('dragstart', (e) => {
      const payload: ArmyDragPayload = { kind: 'god', cardId: c.id };
      e.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
      e.dataTransfer?.setData('text/plain', c.id);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }
}

export { DND_MIME };
