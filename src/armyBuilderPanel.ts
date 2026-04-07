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
import { CATALOG_OVERRIDES_CHANGED } from './catalog/catalogOverrides';

const ARMY_CAP_OPTIONS = [200, 300, 400] as const;
import {
  applyGodCardSpriteCss,
  godCardAriaLabel,
  godCardsForFaction,
  type GodCardDef,
} from './godCards';
import { DOMAIN_LABELS, UnitCard, unitPanelThumbSrc, type DiceRequest } from './unitCard';

const DND_MIME = 'application/x-army-unit';

type ArmyMainTab = 'roster' | 'gods' | 'inventory';

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
  private factionTabs: HTMLElement;
  private leadersSection: HTMLElement;
  private leadersListEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private pointsBlock: HTMLElement;
  private pointsCapBtn: HTMLButtonElement;
  private pointsFillEl: HTMLElement;
  private pointsCapMenu: HTMLElement;
  private armyPointsCap: number = ARMY_POINTS_CAP;
  private listEl: HTMLElement;
  private godSection: HTMLElement;
  private godCatalogEl: HTMLElement;
  private mainTabBar: HTMLElement;
  private tabPanelsWrap: HTMLElement;
  private rosterPanel: HTMLElement;
  private godsPanel: HTMLElement;
  private inventoryPanel: HTMLElement;
  private mainTabButtons = new Map<ArmyMainTab, HTMLButtonElement>();
  private selectedMainTab: ArmyMainTab = 'roster';
  private godPreviewFloater: HTMLElement;
  private godPreviewAnchorEl: HTMLElement | null = null;
  private godPreviewListenersActive = false;
  private open = false;
  private selectedFactionId: string;
  private selectedLeaderId: string;
  private hoverCard: UnitCard;
  private hoverRowUnitId: string | null = null;
  private opts: ArmyPanelOptions;
  private boundKey = (e: KeyboardEvent) => this.onGlobalKey(e);
  private boundMove = (e: PointerEvent) => this.onGlobalPointerMove(e);
  private boundPreviewScroll = (): void => this.syncGodPreviewPosition();
  private boundPreviewResize = (): void => this.syncGodPreviewPosition();
  private boundPreviewOutside = (e: PointerEvent): void => {
    if (this.godPreviewFloater.hidden) return;
    const t = e.target as Node | null;
    if (t && this.godPreviewFloater.contains(t)) return;
    this.closeGodCardPreview();
  };

  /** Ряд с кнопкой «Армия» — сюда можно вешать соседние кнопки (например мультиплеер). */
  getToolbarMount(): HTMLElement {
    return this.menuWrap;
  }

  constructor(parent: HTMLElement, opts: ArmyPanelOptions) {
    this.opts = opts;
    this.selectedFactionId = FACTIONS[0]?.id ?? '';
    const firstLeaders = leadersForFaction(this.selectedFactionId);
    this.selectedLeaderId = firstLeaders[0]?.id ?? '';

    this.root = el('div', 'army-builder-root');
    parent.appendChild(this.root);

    this.menuWrap = el('div', 'army-menu-wrap');
    const menuBtn = el('button', 'army-menu-btn');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Открыть панель выбора юнитов');
    menuBtn.title = 'Армия';
    menuBtn.innerHTML = `<svg class="army-open-panel-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
    this.menuWrap.appendChild(menuBtn);
    this.root.appendChild(this.menuWrap);

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(true);
    });

    this.overlay = el('div', 'army-panel-overlay');

    this.panel = el('aside', 'army-panel');
    const header = el('div', 'army-panel-header');
    const headerMain = el('div', 'army-panel-header-text');
    const title = el('div', 'army-panel-title', 'Армия');
    headerMain.appendChild(title);
    const closeBtn = el('button', 'army-panel-close', '×');
    closeBtn.type = 'button';
    header.appendChild(headerMain);
    header.appendChild(closeBtn);
    closeBtn.addEventListener('click', () => this.setOpen(false));

    this.pointsBlock = el('div', 'army-points-block');
    const pointsInner = el('div', 'army-points-inner');
    this.pointsCapBtn = el('button', 'army-points-cap-btn') as HTMLButtonElement;
    this.pointsCapBtn.type = 'button';
    this.pointsCapBtn.textContent = `0 / ${this.armyPointsCap}`;
    this.pointsCapBtn.setAttribute('aria-haspopup', 'listbox');
    this.pointsCapBtn.setAttribute('aria-expanded', 'false');
    this.pointsCapBtn.title = 'Нажмите, чтобы выбрать лимит очков армии';
    const track = el('div', 'army-points-track');
    this.pointsFillEl = el('div', 'army-points-fill');
    track.appendChild(this.pointsFillEl);
    pointsInner.appendChild(this.pointsCapBtn);
    pointsInner.appendChild(track);
    this.pointsCapMenu = el('div', 'army-points-cap-menu');
    this.pointsCapMenu.setAttribute('role', 'listbox');
    this.pointsCapMenu.hidden = true;
    for (const cap of ARMY_CAP_OPTIONS) {
      const opt = el('button', 'army-points-cap-option', String(cap)) as HTMLButtonElement;
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.dataset.cap = String(cap);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setArmyPointsCap(cap);
      });
      this.pointsCapMenu.appendChild(opt);
    }
    this.syncPointsCapMenuActive();
    this.pointsCapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePointsCapMenu();
    });
    this.pointsBlock.appendChild(pointsInner);
    this.pointsBlock.appendChild(this.pointsCapMenu);

    this.searchInput = el('input', 'army-search-input') as HTMLInputElement;
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Имя или ключевое слово…';
    this.searchInput.setAttribute('aria-label', 'Фильтр по имени или ключевому слову');
    const searchRow = el('div', 'army-search-row');
    searchRow.appendChild(this.searchInput);

    this.factionTabs = el('div', 'army-faction-tabs');

    this.leadersSection = el('div', 'army-leaders-section');
    const leadersTitle = el('div', 'army-section-title', 'Лидеры');
    this.leadersListEl = el('div', 'army-leaders-list');
    this.leadersSection.appendChild(leadersTitle);
    this.leadersSection.appendChild(this.leadersListEl);

    this.listEl = el('div', 'army-unit-list');

    this.godSection = el('div', 'army-god-section army-god-section--in-tab');
    this.godCatalogEl = el('div', 'army-god-catalog');
    this.godSection.appendChild(this.godCatalogEl);

    this.mainTabBar = el('div', 'army-main-tabs');
    this.mainTabBar.setAttribute('role', 'tablist');
    this.mainTabBar.setAttribute('aria-label', 'Разделы панели армии');

    const addMainTab = (id: ArmyMainTab, label: string) => {
      const btn = el('button', 'army-main-tab') as HTMLButtonElement;
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.id = `army-main-tab-${id}`;
      btn.setAttribute('aria-controls', `army-main-panel-${id}`);
      btn.textContent = label;
      btn.addEventListener('click', () => this.selectMainTab(id));
      this.mainTabButtons.set(id, btn);
      this.mainTabBar.appendChild(btn);
    };
    addMainTab('roster', 'Ростер');
    addMainTab('gods', 'Карты богов');
    addMainTab('inventory', 'Инвентарь');

    this.tabPanelsWrap = el('div', 'army-tab-panels-wrap');
    this.rosterPanel = el('div', 'army-tab-panel');
    this.rosterPanel.id = 'army-main-panel-roster';
    this.rosterPanel.setAttribute('role', 'tabpanel');
    this.rosterPanel.setAttribute('aria-labelledby', 'army-main-tab-roster');
    this.rosterPanel.appendChild(this.listEl);

    this.godsPanel = el('div', 'army-tab-panel');
    this.godsPanel.id = 'army-main-panel-gods';
    this.godsPanel.setAttribute('role', 'tabpanel');
    this.godsPanel.setAttribute('aria-labelledby', 'army-main-tab-gods');
    this.godsPanel.hidden = true;
    this.godsPanel.appendChild(this.godSection);

    this.inventoryPanel = el('div', 'army-tab-panel');
    this.inventoryPanel.id = 'army-main-panel-inventory';
    this.inventoryPanel.setAttribute('role', 'tabpanel');
    this.inventoryPanel.setAttribute('aria-labelledby', 'army-main-tab-inventory');
    this.inventoryPanel.hidden = true;
    const invPlaceholder = el('div', 'army-inventory-placeholder', 'Инвентарь скоро появится здесь.');
    this.inventoryPanel.appendChild(invPlaceholder);

    this.tabPanelsWrap.appendChild(this.rosterPanel);
    this.tabPanelsWrap.appendChild(this.godsPanel);
    this.tabPanelsWrap.appendChild(this.inventoryPanel);

    this.panel.appendChild(header);
    this.panel.appendChild(this.pointsBlock);
    this.panel.appendChild(searchRow);
    this.panel.appendChild(this.factionTabs);
    this.panel.appendChild(this.leadersSection);
    this.panel.appendChild(this.mainTabBar);
    this.panel.appendChild(this.tabPanelsWrap);

    this.syncMainTabUi();

    this.root.appendChild(this.overlay);
    this.root.appendChild(this.panel);

    this.godPreviewFloater = el('div', 'army-god-preview-floater');
    this.godPreviewFloater.hidden = true;
    this.godPreviewFloater.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.godPreviewFloater);

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
    document.addEventListener('click', this.boundDocClick);
    window.addEventListener(CATALOG_OVERRIDES_CHANGED, this.boundCatalogOverridesChanged);
  }

  private boundDocClick = (): void => {
    this.closePointsCapMenu();
  };
  private boundCatalogOverridesChanged = (): void => {
    if (!this.open) return;
    this.refresh();
  };

  private selectMainTab(tab: ArmyMainTab): void {
    if (tab !== 'gods') this.closeGodCardPreview();
    this.selectedMainTab = tab;
    this.syncMainTabUi();
  }

  private syncMainTabUi(): void {
    const t = this.selectedMainTab;
    for (const [id, btn] of this.mainTabButtons) {
      const on = id === t;
      btn.classList.toggle('army-main-tab--active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    }
    this.rosterPanel.hidden = t !== 'roster';
    this.godsPanel.hidden = t !== 'gods';
    this.inventoryPanel.hidden = t !== 'inventory';
  }

  dispose(): void {
    this.detachGodPreviewListeners();
    window.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('pointermove', this.boundMove);
    document.removeEventListener('click', this.boundDocClick);
    window.removeEventListener(CATALOG_OVERRIDES_CHANGED, this.boundCatalogOverridesChanged);
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
    if (e.key !== 'Escape') return;
    if (!this.godPreviewFloater.hidden) {
      this.closeGodCardPreview();
      e.preventDefault();
      return;
    }
    if (this.open) {
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
    this.hoverCard.show(def.card, { x: e.clientX, y: e.clientY }, { catalogUnitId: unitId });
  }

  private hideHoverCard(): void {
    this.hoverRowUnitId = null;
    this.hoverCard.hide();
  }

  private setOpen(v: boolean): void {
    this.open = v;
    this.overlay.classList.toggle('army-panel-overlay-visible', v);
    this.panel.classList.toggle('army-panel-open', v);
    if (!v) {
      this.hideHoverCard();
      this.closeGodCardPreview();
    }
    if (v) this.refresh();
  }

  private attachGodPreviewListeners(): void {
    if (this.godPreviewListenersActive) return;
    this.godPreviewListenersActive = true;
    this.godCatalogEl.addEventListener('scroll', this.boundPreviewScroll, { passive: true });
    window.addEventListener('resize', this.boundPreviewResize);
    document.addEventListener('pointerdown', this.boundPreviewOutside, true);
  }

  private detachGodPreviewListeners(): void {
    if (!this.godPreviewListenersActive) return;
    this.godPreviewListenersActive = false;
    this.godCatalogEl.removeEventListener('scroll', this.boundPreviewScroll);
    window.removeEventListener('resize', this.boundPreviewResize);
    document.removeEventListener('pointerdown', this.boundPreviewOutside, true);
  }

  private syncGodPreviewPosition(): void {
    if (!this.godPreviewAnchorEl || this.godPreviewFloater.hidden) return;
    const r = this.godPreviewAnchorEl.getBoundingClientRect();
    const el = this.godPreviewFloater;
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }

  private openGodCardPreview(c: GodCardDef, anchor: HTMLElement): void {
    this.godPreviewAnchorEl = anchor;
    applyGodCardSpriteCss(this.godPreviewFloater, c);
    this.godPreviewFloater.setAttribute('aria-label', godCardAriaLabel(c));
    this.syncGodPreviewPosition();
    this.godPreviewFloater.hidden = false;
    this.godPreviewFloater.setAttribute('aria-hidden', 'false');
    this.godPreviewFloater.classList.remove('army-god-preview-floater--open');
    void this.godPreviewFloater.offsetWidth;
    requestAnimationFrame(() => {
      this.godPreviewFloater.classList.add('army-god-preview-floater--open');
    });
    this.attachGodPreviewListeners();
  }

  private closeGodCardPreview(): void {
    this.detachGodPreviewListeners();
    this.godPreviewAnchorEl = null;
    if (this.godPreviewFloater.hidden) return;
    this.godPreviewFloater.hidden = true;
    this.godPreviewFloater.setAttribute('aria-hidden', 'true');
    this.godPreviewFloater.classList.remove('army-god-preview-floater--open');
    this.godPreviewFloater.style.left = '';
    this.godPreviewFloater.style.top = '';
    this.godPreviewFloater.style.width = '';
    this.godPreviewFloater.style.height = '';
  }

  private buildFactionTabs(): void {
    this.factionTabs.replaceChildren();
    for (const f of FACTIONS) {
      const tab = el('button', 'army-faction-tab');
      tab.type = 'button';
      const domLabel = DOMAIN_LABELS[f.domain];
      tab.title = `${f.name} (${domLabel})`;
      tab.setAttribute('aria-label', `${f.name}, домен ${domLabel}`);
      tab.dataset.factionId = f.id;
      if (f.id === this.selectedFactionId) tab.classList.add('army-faction-tab-active');
      const img = document.createElement('img');
      img.className = 'army-faction-tab-icon';
      img.src = f.panelIconSrc;
      img.alt = '';
      img.draggable = false;
      tab.appendChild(img);
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
    this.renderGodSection();
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
    const leaderThumb = def?.card ? unitPanelThumbSrc(def.card) : undefined;
    if (leaderThumb) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = leaderThumb;
      img.alt = '';
      thumb.appendChild(img);
    }

    const meta = el('div', 'army-unit-meta');
    const name = el('div', 'army-unit-name', l.name);
    const sub = el('div', 'army-unit-sub');
    const pts = l.points ?? def?.points ?? 0;
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
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }

  private setArmyPointsCap(cap: number): void {
    this.armyPointsCap = cap;
    this.syncPointsCapMenuActive();
    this.closePointsCapMenu();
    this.updatePointsBar();
  }

  private syncPointsCapMenuActive(): void {
    for (const child of this.pointsCapMenu.children) {
      const b = child as HTMLButtonElement;
      const v = Number(b.dataset.cap);
      b.classList.toggle('army-points-cap-option-active', v === this.armyPointsCap);
      b.setAttribute('aria-selected', v === this.armyPointsCap ? 'true' : 'false');
    }
  }

  private togglePointsCapMenu(): void {
    const open = this.pointsCapMenu.hidden;
    this.pointsCapMenu.hidden = !open;
    this.pointsCapBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) this.syncPointsCapMenuActive();
  }

  private closePointsCapMenu(): void {
    if (this.pointsCapMenu.hidden) return;
    this.pointsCapMenu.hidden = true;
    this.pointsCapBtn.setAttribute('aria-expanded', 'false');
  }

  private updatePointsBar(): void {
    const spent = this.opts.getPointsSpent();
    const cap = this.armyPointsCap;
    const over = spent > cap;
    const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
    this.pointsCapBtn.textContent = `${spent} / ${cap}`;
    this.pointsFillEl.style.width = `${pct}%`;
    this.pointsBlock.classList.toggle('army-points-block-over', over);
    this.pointsCapBtn.classList.toggle('army-points-cap-btn-over', over);
    if (over) {
      this.pointsCapBtn.title = `Перерасход: +${spent - cap}. Нажмите, чтобы сменить лимит.`;
    } else {
      this.pointsCapBtn.title = 'Нажмите, чтобы выбрать лимит очков армии (200 / 300 / 400)';
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
    const blocked = row.rosterBlocked === true;
    if (atMax || blocked) wrap.classList.add('army-unit-row-disabled');
    wrap.draggable = !atMax && !blocked;
    if (blocked && row.rosterBlockedReason) wrap.title = row.rosterBlockedReason;

    const thumb = el('div', 'army-unit-thumb');
    const troopThumb = unitPanelThumbSrc(row.card);
    if (troopThumb) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = troopThumb;
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
      if (atMax || blocked) {
        e.preventDefault();
        return;
      }
      const payload: ArmyDragPayload = {
        kind: 'troop',
        leaderId: this.selectedLeaderId,
        unitId: row.unitId,
      };
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }

  private renderGodSection(): void {
    this.closeGodCardPreview();
    this.godCatalogEl.replaceChildren();
    for (const c of godCardsForFaction(this.selectedFactionId)) {
      this.godCatalogEl.appendChild(this.makeGodCardRow(c));
    }
  }

  private makeGodCardRow(c: GodCardDef): HTMLElement {
    const wrap = el('div', 'army-god-catalog-item');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.dataset.godCardId = c.id;
    wrap.draggable = true;
    wrap.setAttribute('aria-label', godCardAriaLabel(c));

    const thumb = el('div', 'army-god-thumb');
    applyGodCardSpriteCss(thumb, c);

    wrap.appendChild(thumb);

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openGodCardPreview(c, wrap);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openGodCardPreview(c, wrap);
      }
    });

    wrap.addEventListener('dragstart', (e) => {
      const payload: ArmyDragPayload = { kind: 'god', cardId: c.id };
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    return wrap;
  }
}

export { DND_MIME };
