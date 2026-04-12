/**
 * Army Builder — slide-in panel: factions, leader strip (click = filter), roster grid, click-to-select, DnD.
 */

import {
  ARMY_POINTS_CAP,
  FACTIONS,
  getCatalogUnit,
  godCardsForLeader,
  leadersForFaction,
  LEADER_MINI_MAX_COPIES,
  listInventoryItemsForLeader,
  listRosterRows,
  MERCENARY_FACTION_ID,
  type LeaderDef,
  type RosterRowView,
} from './armyCatalog';
import { CATALOG_OVERRIDES_CHANGED } from './catalog/catalogOverrides';
import type { InventoryItemDef } from './catalog/types';

const ARMY_CAP_OPTIONS = [200, 300, 400] as const;
import {
  getArmyRosterGodCardIdsInPlay,
  getArmyRosterInventoryItemIdsInPlay,
} from './godDeckState.ts';
import {
  applyGodCardSpriteCss,
  godCardAriaLabel,
  type GodCardDef,
} from './godCards';
import {
  DOMAIN_LABELS,
  UnitCard,
  unitPanelThumbSrc,
  type DiceRequest,
  type UnitSize,
} from './unitCard';

const DND_MIME = 'application/x-army-unit';

/** Масштаб превью карты бога в панели армии (inline style — не зависит от кэша старого CSS). */
const GOD_CARD_ARMY_PREVIEW_SCALE = 2.05;

/** Одна строка каталога = визуально уникальная карта (одинаковые название + стоимость). */
function godCardArmyUniquenessKey(c: GodCardDef): string {
  return `${c.title}\0${c.crystalCost ?? ''}`;
}

function groupGodCardsForArmyCatalog(cards: GodCardDef[]): GodCardDef[][] {
  const map = new Map<string, GodCardDef[]>();
  for (const c of cards) {
    const k = godCardArmyUniquenessKey(c);
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push(c);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  }
  return [...map.values()].sort((a, b) => a[0]!.id.localeCompare(b[0]!.id));
}

function pickAvailableGodCardId(group: readonly GodCardDef[], inPlay: ReadonlySet<string>): string | null {
  for (const d of group) {
    if (!inPlay.has(d.id)) return d.id;
  }
  return null;
}

/** Порядок «малый → огромный» для сортировки ростера. */
const ROSTER_SIZE_RANK: Record<UnitSize, number> = {
  small: 0,
  large: 1,
  big: 2,
  huge: 3,
  huge2: 4,
};

type RosterSortMode = 'roster' | 'pointsAsc' | 'pointsDesc' | 'sizeDesc' | 'sizeAsc' | 'nameAz';

const ROSTER_SORT_ORDER: readonly RosterSortMode[] = [
  'roster',
  'pointsAsc',
  'pointsDesc',
  'sizeDesc',
  'sizeAsc',
  'nameAz',
] as const;

const ROSTER_SORT_MENU_LABEL: Record<RosterSortMode, string> = {
  roster: 'Как в каталоге лидера',
  pointsAsc: 'От дешёвых к дорогим',
  pointsDesc: 'От дорогих к дешёвым',
  sizeDesc: 'От огромных к малым',
  sizeAsc: 'От малых к огромным',
  nameAz: 'По имени (А–Я)',
};

/** Иконка сортировки: стрелка вверх и стрелка вниз. */
const ROSTER_SORT_ICON_SVG =
  '<svg class="army-roster-sort-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5l4.5 6h-9L12 5zm0 14l-4.5-6h9L12 19z"/></svg>';

function godCardMatchesArmySearch(c: GodCardDef, q: string): boolean {
  if (!q) return true;
  const tags = (c.tags ?? []).join(' ');
  const cost = c.crystalCost != null ? String(c.crystalCost) : '';
  const hay = `${c.id} ${c.title} ${c.text} ${tags} ${cost}`.toLowerCase();
  return hay.includes(q);
}

function applyInventoryCardSpriteCss(el: HTMLElement, spriteUrl: string): void {
  el.style.backgroundImage = `url("${spriteUrl}")`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center center';
}

type ArmyMainTab = 'roster' | 'gods' | 'inventory';
type SelectedArmyCardSource = 'leader' | 'roster';

export type ArmyDragPayload =
  | { kind: 'troop'; leaderId: string; unitId: string }
  | { kind: 'leader'; leaderId: string; unitId: string }
  | { kind: 'god'; cardId: string }
  | { kind: 'inventory'; leaderId: string; itemId: string };

export type ArmyPanelOptions = {
  getAltKeyHeld?: () => boolean;
  getUsedCount: (leaderId: string, unitId: string) => number;
  getPointsSpent: () => number;
  onDiceRequest?: (req: DiceRequest) => void;
  /**
   * Touch fallback: tap row to arm payload; next tap on the board spawns (HTML5 DnD often missing on touch).
   */
  onTouchArmPayload?: (json: string) => void;
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
  private rosterSearchInput: HTMLInputElement;
  private rosterSortWrap!: HTMLElement;
  private rosterSortBtn!: HTMLButtonElement;
  private rosterSortPopover!: HTMLElement;
  private rosterSortMode: RosterSortMode = 'roster';
  private godSearchInput: HTMLInputElement;
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
  private inventorySection: HTMLElement;
  private inventoryCatalogEl: HTMLElement;
  private mainTabButtons = new Map<ArmyMainTab, HTMLButtonElement>();
  private selectedMainTab: ArmyMainTab = 'roster';
  private godPreviewFloater: HTMLElement;
  private godPreviewAnchorEl: HTMLElement | null = null;
  private godPreviewListenersActive = false;
  private inventoryPreviewFloater: HTMLElement;
  private inventoryPreviewAnchorEl: HTMLElement | null = null;
  private inventoryPreviewListenersActive = false;
  private open = false;
  private selectedFactionId: string;
  private selectedLeaderId: string;
  private selectedRosterCard: UnitCard;
  private selectedCardUnitId: string | null = null;
  private selectedCardSource: SelectedArmyCardSource | null = null;
  private opts: ArmyPanelOptions;
  private overridesRefreshQueued = false;
  private boundKey = (e: KeyboardEvent) => this.onGlobalKey(e);
  private boundPreviewScroll = (): void => this.syncGodPreviewPosition();
  private boundPreviewResize = (): void => this.syncGodPreviewPosition();
  private boundRepositionRosterSortPopover = (): void => {
    if (this.rosterSortPopover.hidden) return;
    this.positionRosterSortPopover();
  };
  /** Экранный прямоугольник увеличенной карты (учитывает `transform: scale` у флоатера). */
  private pointerInGodPreviewFloater(clientX: number, clientY: number): boolean {
    if (this.godPreviewFloater.hidden) return false;
    const r = this.godPreviewFloater.getBoundingClientRect();
    return clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom;
  }

  /**
   * Закрытие по нажатию вне визуала превью (включая пустое место в списке карт богов).
   * Проверка по координатам + getBoundingClientRect флоатера: у него `pointer-events: none`,
   * иначе scale раздувал бы hit-box и мешал кликать по соседним карточкам.
   */
  private boundPreviewOutside = (e: PointerEvent): void => {
    if (this.godPreviewFloater.hidden) return;
    if (this.pointerInGodPreviewFloater(e.clientX, e.clientY)) return;
    this.closeGodCardPreview();
  };

  /** Ряд с кнопкой «Армия» — сюда можно вешать соседние кнопки (например мультиплеер). */
  getToolbarMount(): HTMLElement {
    return this.menuWrap;
  }

  constructor(parent: HTMLElement, opts: ArmyPanelOptions) {
    this.opts = opts;
    this.selectedFactionId = FACTIONS.find((f) => f.id !== MERCENARY_FACTION_ID)?.id ?? FACTIONS[0]?.id ?? '';
    const firstLeaders = leadersForFaction(this.selectedFactionId);
    this.selectedLeaderId = firstLeaders[0]?.id ?? '';

    this.root = el('div', 'army-builder-root');
    parent.appendChild(this.root);

    this.menuWrap = el('div', 'army-menu-wrap');
    const menuBtn = el('button', 'army-menu-btn army-menu-btn--text');
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Открыть army builder');
    menuBtn.title = 'Army builder';
    menuBtn.textContent = 'army builder';
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

    const rosterToolbar = el('div', 'army-roster-toolbar');
    this.rosterSearchInput = el('input', 'army-search-input army-roster-search-input') as HTMLInputElement;
    this.rosterSearchInput.type = 'search';
    this.rosterSearchInput.placeholder = 'Поиск юнита (имя, id, слова)…';
    this.rosterSearchInput.setAttribute('aria-label', 'Поиск по юнитам ростера');

    this.rosterSortWrap = el('div', 'army-roster-sort-wrap');
    this.rosterSortBtn = el('button', 'army-roster-sort-btn') as HTMLButtonElement;
    this.rosterSortBtn.type = 'button';
    this.rosterSortBtn.innerHTML = ROSTER_SORT_ICON_SVG;
    this.rosterSortBtn.title = 'Сортировка списка ростера';
    this.rosterSortBtn.setAttribute('aria-label', 'Сортировка списка ростера');
    this.rosterSortBtn.setAttribute('aria-haspopup', 'true');
    this.rosterSortBtn.setAttribute('aria-expanded', 'false');

    this.rosterSortPopover = el('div', 'army-roster-sort-popover');
    this.rosterSortPopover.id = 'army-roster-sort-popover';
    this.rosterSortPopover.hidden = true;
    this.rosterSortPopover.setAttribute('role', 'menu');
    this.rosterSortBtn.setAttribute('aria-controls', this.rosterSortPopover.id);

    for (const mode of ROSTER_SORT_ORDER) {
      const item = el('button', 'army-roster-sort-menu-item') as HTMLButtonElement;
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.dataset.sortMode = mode;
      item.textContent = ROSTER_SORT_MENU_LABEL[mode];
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.rosterSortMode = mode;
        this.syncRosterSortMenuActive();
        this.closeRosterSortPopover();
        this.renderList();
      });
      this.rosterSortPopover.appendChild(item);
    }
    this.syncRosterSortMenuActive();

    this.rosterSortBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggleRosterSortPopover();
    });
    this.rosterSortWrap.appendChild(this.rosterSortBtn);
    this.rosterSortWrap.appendChild(this.rosterSortPopover);

    rosterToolbar.appendChild(this.rosterSearchInput);
    rosterToolbar.appendChild(this.rosterSortWrap);
    this.rosterPanel.appendChild(rosterToolbar);
    this.rosterPanel.appendChild(this.listEl);

    this.godsPanel = el('div', 'army-tab-panel');
    this.godsPanel.id = 'army-main-panel-gods';
    this.godsPanel.setAttribute('role', 'tabpanel');
    this.godsPanel.setAttribute('aria-labelledby', 'army-main-tab-gods');
    this.godsPanel.hidden = true;
    const godSearchRow = el('div', 'army-god-search-row');
    this.godSearchInput = el('input', 'army-search-input') as HTMLInputElement;
    this.godSearchInput.type = 'search';
    this.godSearchInput.placeholder = 'Поиск карты бога…';
    this.godSearchInput.setAttribute('aria-label', 'Поиск по картам богов');
    godSearchRow.appendChild(this.godSearchInput);
    this.godsPanel.appendChild(godSearchRow);
    this.godsPanel.appendChild(this.godSection);

    this.inventoryPanel = el('div', 'army-tab-panel');
    this.inventoryPanel.id = 'army-main-panel-inventory';
    this.inventoryPanel.setAttribute('role', 'tabpanel');
    this.inventoryPanel.setAttribute('aria-labelledby', 'army-main-tab-inventory');
    this.inventoryPanel.hidden = true;
    this.inventorySection = el('div', 'army-god-section army-god-section--in-tab');
    this.inventoryCatalogEl = el('div', 'army-god-catalog');
    this.inventorySection.appendChild(this.inventoryCatalogEl);
    this.inventoryPanel.appendChild(this.inventorySection);

    this.tabPanelsWrap.appendChild(this.rosterPanel);
    this.tabPanelsWrap.appendChild(this.godsPanel);
    this.tabPanelsWrap.appendChild(this.inventoryPanel);

    this.panel.appendChild(header);
    this.panel.appendChild(this.pointsBlock);
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

    this.inventoryPreviewFloater = el('div', 'army-god-preview-floater');
    this.inventoryPreviewFloater.hidden = true;
    this.inventoryPreviewFloater.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.inventoryPreviewFloater);

    this.selectedRosterCard = new UnitCard(this.root, 'army-catalog-selected');
    if (opts.onDiceRequest) {
      this.selectedRosterCard.onDiceRequest = opts.onDiceRequest;
    }

    this.buildFactionTabs();
    this.renderLeaders();
    this.rosterSearchInput.addEventListener('input', () => this.renderList());
    this.godSearchInput.addEventListener('input', () => this.renderGodSection());
    this.renderList();
    this.renderGodSection();
    this.renderInventorySection();

    window.addEventListener('keydown', this.boundKey);
    document.addEventListener('click', this.boundDocClick);
    window.addEventListener(CATALOG_OVERRIDES_CHANGED, this.boundCatalogOverridesChanged);
  }

  private boundDocClick = (e: MouseEvent): void => {
    this.closePointsCapMenu();
    this.closeRosterSortPopover();
    if (!this.selectedCardUnitId) return;
    const target = e.target;
    if (target instanceof Node && this.panel.contains(target)) return;
    if (this.selectedRosterCard.containsEventTarget(target)) return;
    this.clearSelectedCard();
  };
  private boundCatalogOverridesChanged = (): void => {
    if (!this.open) return;
    if (this.overridesRefreshQueued) return;
    this.overridesRefreshQueued = true;
    requestAnimationFrame(() => {
      this.overridesRefreshQueued = false;
      if (!this.open) return;
      this.refresh();
    });
  };

  private selectMainTab(tab: ArmyMainTab): void {
    if (tab !== 'roster') this.closeRosterSortPopover();
    if (tab !== 'gods') this.closeGodCardPreview();
    if (tab !== 'inventory') this.closeInventoryCardPreview();
    if (tab !== 'roster') this.clearSelectedCard();
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
    this.closeRosterSortPopover();
    this.closeGodCardPreview();
    this.closeInventoryCardPreview();
    window.removeEventListener('keydown', this.boundKey);
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

  /** Current army points cap (200 / 300 / 400). */
  getArmyPointsCap(): number {
    return this.armyPointsCap;
  }

  refresh(): void {
    this.buildFactionTabs();
    this.updatePointsBar();
    this.renderLeaders();
    this.renderList();
    this.renderGodSection();
    this.renderInventorySection();
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (!this.rosterSortPopover.hidden) {
      this.closeRosterSortPopover();
      e.preventDefault();
      return;
    }
    if (!this.inventoryPreviewFloater.hidden) {
      this.closeInventoryCardPreview();
      e.preventDefault();
      return;
    }
    if (!this.godPreviewFloater.hidden) {
      this.closeGodCardPreview();
      e.preventDefault();
      return;
    }
    if (this.open) {
      this.setOpen(false);
    }
  }

  private showSelectedCard(unitId: string, source: SelectedArmyCardSource): void {
    const def = getCatalogUnit(unitId);
    if (!def) return;
    this.selectedCardUnitId = unitId;
    this.selectedCardSource = source;
    this.selectedRosterCard.show(def.card, undefined, { catalogUnitId: unitId });
    this.syncRosterSelectionUi();
  }

  private selectRosterUnit(unitId: string): void {
    this.showSelectedCard(unitId, 'roster');
  }

  private selectLeaderCard(unitId: string): void {
    this.showSelectedCard(unitId, 'leader');
  }

  private clearSelectedCard(): void {
    if (!this.selectedCardUnitId && !this.selectedRosterCard.isVisible) return;
    this.selectedCardUnitId = null;
    this.selectedCardSource = null;
    this.selectedRosterCard.hide();
    this.syncRosterSelectionUi();
  }

  private syncRosterSelectionUi(): void {
    for (const child of this.listEl.children) {
      const row = child as HTMLElement;
      if (!row.classList.contains('army-unit-row')) continue;
      row.classList.toggle(
        'army-unit-row-selected',
        this.selectedCardSource === 'roster' && row.dataset.unitId === this.selectedCardUnitId,
      );
    }
  }

  private setOpen(v: boolean): void {
    this.open = v;
    this.overlay.classList.toggle('army-panel-overlay-visible', v);
    this.panel.classList.toggle('army-panel-open', v);
    if (!v) {
      this.clearSelectedCard();
      this.closeRosterSortPopover();
      this.closeGodCardPreview();
      this.closeInventoryCardPreview();
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
    if (!this.godPreviewAnchorEl) return;
    const r = this.godPreviewAnchorEl.getBoundingClientRect();
    const el = this.godPreviewFloater;
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }

  private openGodCardPreview(c: GodCardDef, anchor: HTMLElement): void {
    this.closeInventoryCardPreview();
    this.godPreviewAnchorEl = anchor;
    applyGodCardSpriteCss(this.godPreviewFloater, c);
    this.godPreviewFloater.setAttribute('aria-label', godCardAriaLabel(c));
    this.godPreviewFloater.hidden = false;
    this.godPreviewFloater.setAttribute('aria-hidden', 'false');
    this.godPreviewFloater.style.transformOrigin = 'center center';
    this.godPreviewFloater.style.transform = `scale(${GOD_CARD_ARMY_PREVIEW_SCALE})`;
    this.syncGodPreviewPosition();
    this.attachGodPreviewListeners();
  }

  private closeGodCardPreview(): void {
    this.detachGodPreviewListeners();
    this.godPreviewAnchorEl = null;
    if (this.godPreviewFloater.hidden) return;
    this.godPreviewFloater.hidden = true;
    this.godPreviewFloater.setAttribute('aria-hidden', 'true');
    this.godPreviewFloater.style.left = '';
    this.godPreviewFloater.style.top = '';
    this.godPreviewFloater.style.width = '';
    this.godPreviewFloater.style.height = '';
    this.godPreviewFloater.style.transform = '';
    this.godPreviewFloater.style.transformOrigin = '';
  }

  private pointerInInventoryPreviewFloater(clientX: number, clientY: number): boolean {
    if (this.inventoryPreviewFloater.hidden) return false;
    const r = this.inventoryPreviewFloater.getBoundingClientRect();
    return clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom;
  }

  private boundInventoryPreviewOutside = (e: PointerEvent): void => {
    if (this.inventoryPreviewFloater.hidden) return;
    if (this.pointerInInventoryPreviewFloater(e.clientX, e.clientY)) return;
    this.closeInventoryCardPreview();
  };

  private boundInventoryPreviewScroll = (): void => this.syncInventoryPreviewPosition();
  private boundInventoryPreviewResize = (): void => this.syncInventoryPreviewPosition();

  private syncInventoryPreviewPosition(): void {
    if (!this.inventoryPreviewAnchorEl) return;
    const r = this.inventoryPreviewAnchorEl.getBoundingClientRect();
    const el = this.inventoryPreviewFloater;
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }

  private attachInventoryPreviewListeners(): void {
    if (this.inventoryPreviewListenersActive) return;
    this.inventoryPreviewListenersActive = true;
    this.inventoryCatalogEl.addEventListener('scroll', this.boundInventoryPreviewScroll, { passive: true });
    window.addEventListener('resize', this.boundInventoryPreviewResize);
    document.addEventListener('pointerdown', this.boundInventoryPreviewOutside, true);
  }

  private detachInventoryPreviewListeners(): void {
    if (!this.inventoryPreviewListenersActive) return;
    this.inventoryPreviewListenersActive = false;
    this.inventoryCatalogEl.removeEventListener('scroll', this.boundInventoryPreviewScroll);
    window.removeEventListener('resize', this.boundInventoryPreviewResize);
    document.removeEventListener('pointerdown', this.boundInventoryPreviewOutside, true);
  }

  private openInventoryCardPreview(def: InventoryItemDef, anchor: HTMLElement): void {
    this.closeGodCardPreview();
    this.inventoryPreviewAnchorEl = anchor;
    applyInventoryCardSpriteCss(this.inventoryPreviewFloater, def.sprite);
    this.inventoryPreviewFloater.setAttribute('aria-label', def.name);
    this.inventoryPreviewFloater.hidden = false;
    this.inventoryPreviewFloater.setAttribute('aria-hidden', 'false');
    this.inventoryPreviewFloater.style.transformOrigin = 'center center';
    this.inventoryPreviewFloater.style.transform = `scale(${GOD_CARD_ARMY_PREVIEW_SCALE})`;
    this.syncInventoryPreviewPosition();
    this.attachInventoryPreviewListeners();
  }

  private closeInventoryCardPreview(): void {
    this.detachInventoryPreviewListeners();
    this.inventoryPreviewAnchorEl = null;
    if (this.inventoryPreviewFloater.hidden) return;
    this.inventoryPreviewFloater.hidden = true;
    this.inventoryPreviewFloater.setAttribute('aria-hidden', 'true');
    this.inventoryPreviewFloater.style.left = '';
    this.inventoryPreviewFloater.style.top = '';
    this.inventoryPreviewFloater.style.width = '';
    this.inventoryPreviewFloater.style.height = '';
    this.inventoryPreviewFloater.style.transform = '';
    this.inventoryPreviewFloater.style.transformOrigin = '';
  }

  private buildFactionTabs(): void {
    const tabFactions = FACTIONS.filter(
      (f) => f.id !== MERCENARY_FACTION_ID && f.panelIconSrc !== '/mercenaries.webp',
    );
    if (!tabFactions.some((f) => f.id === this.selectedFactionId)) {
      this.selectedFactionId = tabFactions[0]?.id ?? '';
      const leaders = leadersForFaction(this.selectedFactionId);
      this.selectedLeaderId = leaders[0]?.id ?? '';
      this.clearSelectedCard();
    }
    this.factionTabs.replaceChildren();
    for (const f of tabFactions) {
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
    this.clearSelectedCard();
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
    this.renderInventorySection();
  }

  private selectLeader(leaderId: string): void {
    this.selectedLeaderId = leaderId;
    const selectedLeader = leadersForFaction(this.selectedFactionId).find((l) => l.id === leaderId) ?? null;
    if (selectedLeader?.catalogUnitId) {
      this.selectLeaderCard(selectedLeader.catalogUnitId);
    } else {
      this.clearSelectedCard();
    }
    this.syncLeaderRowActiveClass();
    this.renderList();
    this.renderGodSection();
    this.renderInventorySection();
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
    const wrap = el('div', 'army-unit-row army-catalog-card army-leader-row');
    wrap.dataset.leaderId = l.id;
    wrap.dataset.unitId = l.catalogUnitId;
    const used = this.opts.getUsedCount(l.id, l.catalogUnitId);
    const atMax = used >= LEADER_MINI_MAX_COPIES;
    if (atMax) wrap.classList.add('army-unit-row-disabled');
    wrap.draggable = !atMax;

    const pts = l.points ?? def?.points ?? 0;
    const availText = `${used}/${LEADER_MINI_MAX_COPIES}`;
    const ptsText = pts > 0 ? String(pts) : '—';
    wrap.setAttribute(
      'aria-label',
      `${l.name}. ${pts > 0 ? `${pts} очков. ` : ''}Миниатюры лидера: ${used} из ${LEADER_MINI_MAX_COPIES}.`,
    );

    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      this.selectLeader(l.id);
    });

    const title = el('div', 'army-unit-name army-catalog-card__title', l.name);

    const portrait = el('div', 'army-catalog-card__portrait');
    const badgeAvail = el('span', 'army-catalog-card__badge army-catalog-card__badge--avail', availText);
    badgeAvail.setAttribute('aria-hidden', 'true');

    const thumb = el('div', 'army-unit-thumb army-catalog-card__thumb');
    const leaderThumb = def?.card ? unitPanelThumbSrc(def.card) : undefined;
    if (leaderThumb) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = leaderThumb;
      img.alt = '';
      thumb.appendChild(img);
    }
    const badgePts = el('span', 'army-catalog-card__badge army-catalog-card__badge--pts', ptsText);
    badgePts.setAttribute('aria-hidden', 'true');

    portrait.appendChild(badgeAvail);
    portrait.appendChild(thumb);
    portrait.appendChild(badgePts);

    wrap.appendChild(title);
    wrap.appendChild(portrait);

    let leaderTapX = 0;
    let leaderTapY = 0;
    let leaderDragStarted = false;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      leaderDragStarted = false;
      leaderTapX = e.clientX;
      leaderTapY = e.clientY;
    });
    wrap.addEventListener('dragstart', (e) => {
      if (atMax) {
        e.preventDefault();
        return;
      }
      leaderDragStarted = true;
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
    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') return;
      if (atMax || !this.opts.onTouchArmPayload) return;
      if (leaderDragStarted) return;
      const dx = e.clientX - leaderTapX;
      const dy = e.clientY - leaderTapY;
      if (dx * dx + dy * dy > 100) return;
      const payload: ArmyDragPayload = {
        kind: 'leader',
        leaderId: l.id,
        unitId: l.catalogUnitId,
      };
      this.opts.onTouchArmPayload!(JSON.stringify(payload));
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

  private syncRosterSortMenuActive(): void {
    for (const child of this.rosterSortPopover.children) {
      const b = child as HTMLButtonElement;
      const mode = b.dataset.sortMode as RosterSortMode | undefined;
      if (!mode) continue;
      const on = mode === this.rosterSortMode;
      b.classList.toggle('army-roster-sort-menu-item--active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  private positionRosterSortPopover(): void {
    const rect = this.rosterSortBtn.getBoundingClientRect();
    const gap = 6;
    const menuWidth = 240;
    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    this.rosterSortPopover.style.top = `${rect.bottom + gap}px`;
    this.rosterSortPopover.style.left = `${left}px`;
    this.rosterSortPopover.style.width = `${menuWidth}px`;
  }

  private clearRosterSortPopoverPosition(): void {
    this.rosterSortPopover.style.top = '';
    this.rosterSortPopover.style.left = '';
    this.rosterSortPopover.style.width = '';
  }

  private toggleRosterSortPopover(): void {
    const open = this.rosterSortPopover.hidden;
    this.rosterSortPopover.hidden = !open;
    this.rosterSortBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.rosterSortBtn.classList.toggle('army-roster-sort-btn--open', open);
    if (open) {
      this.syncRosterSortMenuActive();
      this.positionRosterSortPopover();
      window.addEventListener('resize', this.boundRepositionRosterSortPopover);
    } else {
      window.removeEventListener('resize', this.boundRepositionRosterSortPopover);
      this.clearRosterSortPopoverPosition();
    }
  }

  private closeRosterSortPopover(): void {
    if (this.rosterSortPopover.hidden) return;
    window.removeEventListener('resize', this.boundRepositionRosterSortPopover);
    this.rosterSortPopover.hidden = true;
    this.rosterSortBtn.setAttribute('aria-expanded', 'false');
    this.rosterSortBtn.classList.remove('army-roster-sort-btn--open');
    this.clearRosterSortPopoverPosition();
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

    let rows = listRosterRows(this.selectedLeaderId, this.rosterSearchInput.value, this.opts.getUsedCount);
    rows = this.applyRosterSort(rows);
    for (const row of rows) {
      this.listEl.appendChild(this.makeTroopRow(row));
    }
    if (
      this.selectedCardSource === 'roster' &&
      this.selectedCardUnitId &&
      !rows.some((row) => row.unitId === this.selectedCardUnitId)
    ) {
      this.clearSelectedCard();
    } else {
      this.syncRosterSelectionUi();
    }
    if (rows.length === 0) {
      this.listEl.appendChild(el('div', 'army-list-empty', 'Нет юнитов по фильтру'));
    }
  }

  private applyRosterSort(rows: RosterRowView[]): RosterRowView[] {
    const out = [...rows];
    const mode = this.rosterSortMode;
    const cmpPoints = (a: RosterRowView, b: RosterRowView) => a.points - b.points || a.name.localeCompare(b.name, 'ru');
    const cmpSize = (a: RosterRowView, b: RosterRowView) =>
      ROSTER_SIZE_RANK[a.card.size] - ROSTER_SIZE_RANK[b.card.size] || a.name.localeCompare(b.name, 'ru');
    const cmpName = (a: RosterRowView, b: RosterRowView) =>
      a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }) || a.unitId.localeCompare(b.unitId);
    switch (mode) {
      case 'roster':
        break;
      case 'pointsAsc':
        out.sort(cmpPoints);
        break;
      case 'pointsDesc':
        out.sort((a, b) => -cmpPoints(a, b));
        break;
      case 'sizeAsc':
        out.sort(cmpSize);
        break;
      case 'sizeDesc':
        out.sort((a, b) => -cmpSize(a, b));
        break;
      case 'nameAz':
        out.sort(cmpName);
        break;
      default:
        break;
    }
    return out;
  }

  private makeTroopRow(row: RosterRowView): HTMLElement {
    const wrap = el('div', 'army-unit-row army-catalog-card');
    wrap.dataset.unitId = row.unitId;
    const atMax = row.used >= row.maxCopies;
    const blocked = row.rosterBlocked === true;
    if (atMax || blocked) wrap.classList.add('army-unit-row-disabled');
    wrap.draggable = !atMax && !blocked;
    if (blocked && row.rosterBlockedReason) wrap.title = row.rosterBlockedReason;

    const availText = `${row.used}/${row.maxCopies}`;
    const ptsText = String(row.points);
    wrap.setAttribute(
      'aria-label',
      blocked && row.rosterBlockedReason
        ? `${row.name}. ${row.rosterBlockedReason}`
        : `${row.name}. ${row.points} очков. В ростере: ${row.used} из ${row.maxCopies}.`,
    );

    const title = el('div', 'army-unit-name army-catalog-card__title', row.name);

    const portrait = el('div', 'army-catalog-card__portrait');
    const badgeAvail = el('span', 'army-catalog-card__badge army-catalog-card__badge--avail', availText);
    badgeAvail.setAttribute('aria-hidden', 'true');

    const thumb = el('div', 'army-unit-thumb army-catalog-card__thumb');
    const troopThumb = unitPanelThumbSrc(row.card);
    if (troopThumb) {
      const img = el('img', 'army-unit-thumb-img');
      img.src = troopThumb;
      img.alt = '';
      thumb.appendChild(img);
    }
    const badgePts = el('span', 'army-catalog-card__badge army-catalog-card__badge--pts', ptsText);
    badgePts.setAttribute('aria-hidden', 'true');

    portrait.appendChild(badgeAvail);
    portrait.appendChild(thumb);
    portrait.appendChild(badgePts);

    wrap.appendChild(title);
    wrap.appendChild(portrait);
    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      this.selectRosterUnit(row.unitId);
    });

    let troopTapX = 0;
    let troopTapY = 0;
    let troopDragStarted = false;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      troopDragStarted = false;
      troopTapX = e.clientX;
      troopTapY = e.clientY;
    });
    wrap.addEventListener('dragstart', (e) => {
      if (atMax || blocked) {
        e.preventDefault();
        return;
      }
      troopDragStarted = true;
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
    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') return;
      if (atMax || blocked || !this.opts.onTouchArmPayload) return;
      if (troopDragStarted) return;
      const dx = e.clientX - troopTapX;
      const dy = e.clientY - troopTapY;
      if (dx * dx + dy * dy > 100) return;
      const payload: ArmyDragPayload = {
        kind: 'troop',
        leaderId: this.selectedLeaderId,
        unitId: row.unitId,
      };
      this.opts.onTouchArmPayload!(JSON.stringify(payload));
    });

    return wrap;
  }

  private renderGodSection(): void {
    this.closeGodCardPreview();
    this.closeInventoryCardPreview();
    this.godCatalogEl.replaceChildren();
    const leaderId = this.selectedLeaderId;
    if (!leaderId) {
      this.godCatalogEl.appendChild(
        el('div', 'army-list-empty', 'Выберите лидера, чтобы увидеть доступные карты богов'),
      );
      return;
    }
    const inPlay = getArmyRosterGodCardIdsInPlay();
    const cards = godCardsForLeader(leaderId);
    const q = this.godSearchInput.value.trim().toLowerCase();
    const allGroups = groupGodCardsForArmyCatalog(cards);
    const groups = allGroups.filter((g) => godCardMatchesArmySearch(g[0]!, q));
    for (const group of groups) {
      this.godCatalogEl.appendChild(this.makeGodCardGroupRow(group, inPlay));
    }
    if (this.godCatalogEl.children.length === 0) {
      const emptyMsg =
        q.length > 0 && allGroups.length > 0
          ? 'Нет карт богов по фильтру'
          : 'Нет карт богов для этого лидера';
      this.godCatalogEl.appendChild(el('div', 'army-list-empty', emptyMsg));
    }
  }

  private makeGodCardGroupRow(group: GodCardDef[], inPlay: ReadonlySet<string>): HTMLElement {
    const total = group.length;
    const used = group.reduce((n, d) => n + (inPlay.has(d.id) ? 1 : 0), 0);
    const remaining = total - used;
    const representative = group[0]!;
    const canDrag = remaining > 0;

    const wrap = el('div', 'army-god-catalog-item');
    if (!canDrag) wrap.classList.add('army-god-catalog-item--depleted');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.dataset.godCardId = representative.id;
    wrap.setAttribute(
      'aria-label',
      `${godCardAriaLabel(representative)} · доступно ${remaining} из ${total}`,
    );
    wrap.title = canDrag
      ? 'Нажмите — превью · перетащите на стол'
      : 'Все копии уже на столе · нажмите для превью';

    const thumbWrap = el('div', 'army-god-thumb-wrap');
    const thumb = el('div', 'army-god-thumb');
    applyGodCardSpriteCss(thumb, representative);
    /** DnD только на миниатюре: при `draggable` на всём ряду браузер часто не шлёт `click` после одного нажатия. */
    thumb.draggable = canDrag;

    const badge = el('div', 'army-god-avail-badge', String(remaining));
    badge.setAttribute('aria-hidden', 'true');

    thumbWrap.appendChild(thumb);
    thumbWrap.appendChild(badge);
    wrap.appendChild(thumbWrap);

    let dragStartedForThisRow = false;
    let tapDownX = 0;
    let tapDownY = 0;
    /** После открытия по pointerup подавляем следующий click (дубль от той же «мышиной» активации). */
    let suppressNextClickForRow = false;

    const TAP_MOVE_THRESHOLD_PX = 10;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragStartedForThisRow = false;
      suppressNextClickForRow = false;
      tapDownX = e.clientX;
      tapDownY = e.clientY;
    });

    wrap.addEventListener('pointercancel', () => {
      dragStartedForThisRow = false;
    });

    thumb.addEventListener('dragstart', (e) => {
      const id = pickAvailableGodCardId(group, inPlay);
      if (!id) {
        e.preventDefault();
        return;
      }
      dragStartedForThisRow = true;
      const payload: ArmyDragPayload = { kind: 'god', cardId: id };
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    /** После drop на стол список должен обновиться; rAF — после применения состояния в main. */
    thumb.addEventListener('dragend', () => {
      requestAnimationFrame(() => this.refresh());
    });

    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (dragStartedForThisRow) return;
      const dx = e.clientX - tapDownX;
      const dy = e.clientY - tapDownY;
      if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_PX * TAP_MOVE_THRESHOLD_PX) return;
      if (
        this.opts.onTouchArmPayload &&
        (e.pointerType === 'touch' || e.pointerType === 'pen')
      ) {
        const id = pickAvailableGodCardId(group, inPlay);
        if (id) {
          this.opts.onTouchArmPayload(JSON.stringify({ kind: 'god', cardId: id }));
        }
        suppressNextClickForRow = true;
        e.stopPropagation();
        return;
      }
      suppressNextClickForRow = true;
      e.stopPropagation();
      this.openGodCardPreview(representative, wrap);
    });

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (suppressNextClickForRow) {
        suppressNextClickForRow = false;
        return;
      }
      if (dragStartedForThisRow) return;
      this.openGodCardPreview(representative, wrap);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openGodCardPreview(representative, wrap);
      }
    });

    return wrap;
  }

  private renderInventorySection(): void {
    this.closeInventoryCardPreview();
    this.inventoryCatalogEl.replaceChildren();
    const leaderId = this.selectedLeaderId;
    if (!leaderId) return;
    const inPlay = getArmyRosterInventoryItemIdsInPlay();
    const items = listInventoryItemsForLeader(leaderId);
    for (const def of items) {
      if (inPlay.has(def.id)) continue;
      this.inventoryCatalogEl.appendChild(this.makeInventoryCardRow(def, leaderId));
    }
    if (this.inventoryCatalogEl.children.length === 0) {
      this.inventoryCatalogEl.appendChild(
        el(
          'div',
          'army-list-empty',
          items.length === 0
            ? 'Нет предметов для этого лидера'
            : 'Все доступные предметы уже на столе',
        ),
      );
    }
  }

  private makeInventoryCardRow(def: InventoryItemDef, leaderId: string): HTMLElement {
    const wrap = el('div', 'army-god-catalog-item');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.dataset.inventoryItemId = def.id;
    wrap.setAttribute('aria-label', def.name);
    wrap.title = 'Нажмите — превью · перетащите на стол';

    const thumb = el('div', 'army-god-thumb');
    applyInventoryCardSpriteCss(thumb, def.sprite);
    thumb.draggable = true;

    wrap.appendChild(thumb);

    let dragStartedForThisRow = false;
    let tapDownX = 0;
    let tapDownY = 0;
    let suppressNextClickForRow = false;

    const TAP_MOVE_THRESHOLD_PX = 10;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragStartedForThisRow = false;
      suppressNextClickForRow = false;
      tapDownX = e.clientX;
      tapDownY = e.clientY;
    });

    wrap.addEventListener('pointercancel', () => {
      dragStartedForThisRow = false;
    });

    thumb.addEventListener('dragstart', (e) => {
      dragStartedForThisRow = true;
      const payload: ArmyDragPayload = { kind: 'inventory', leaderId, itemId: def.id };
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      e.dataTransfer!.effectAllowed = 'copy';
    });

    thumb.addEventListener('dragend', () => {
      requestAnimationFrame(() => this.refresh());
    });

    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (dragStartedForThisRow) return;
      const dx = e.clientX - tapDownX;
      const dy = e.clientY - tapDownY;
      if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_PX * TAP_MOVE_THRESHOLD_PX) return;
      if (
        this.opts.onTouchArmPayload &&
        (e.pointerType === 'touch' || e.pointerType === 'pen')
      ) {
        this.opts.onTouchArmPayload(
          JSON.stringify({ kind: 'inventory', leaderId, itemId: def.id } as ArmyDragPayload),
        );
        suppressNextClickForRow = true;
        e.stopPropagation();
        return;
      }
      suppressNextClickForRow = true;
      e.stopPropagation();
      this.openInventoryCardPreview(def, wrap);
    });

    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      if (suppressNextClickForRow) {
        suppressNextClickForRow = false;
        return;
      }
      if (dragStartedForThisRow) return;
      this.openInventoryCardPreview(def, wrap);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openInventoryCardPreview(def, wrap);
      }
    });

    return wrap;
  }
}

export { DND_MIME };
