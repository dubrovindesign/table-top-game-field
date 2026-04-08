/**
 * In-app catalog editor: unit patches, new units, roster additions, hotspot layout.
 */

import './catalogEditorPanel.css';

import {
  addRosterSlot,
  CATALOG_OVERRIDES_CHANGED,
  clearCardSpriteFromUnitOverrides,
  createStubCatalogUnit,
  exportCatalogOverridesJson,
  finalizeCardForUnitSave,
  getCatalogOverrides,
  getHotspotsForUnit,
  importCatalogOverridesJson,
  listAllUnitIds,
  listNewLeaderIds,
  listNewUnitIds,
  removeLeaderEverywhere,
  removeRosterAddition,
  removeUnitEverywhere,
  resetCatalogOverrides,
  setLeaderHidden,
  setLeaderRosterOrder,
  setLeaderPointsOverride,
  setNewLeader,
  setHotspotsForUnit,
  setNewUnit,
  setRosterSlotPatch,
  setUnitPatch,
  setUnitLibraryOrder,
  setDefaultHotspotLayoutPresetId,
  upsertHotspotLayoutPreset,
} from './catalog/catalogOverrides';
import { getStaticHotspotForUnit } from './catalog/staticHotspots';
import {
  applyHotspotLayoutBoxesToRegions,
  DEFAULT_HOTSPOT_LAYOUT_PRESET_REGIONS,
  type HotspotFile,
  type HotspotRegion,
} from './catalog/hotspotTypes';
import type { CatalogUnitDef, FactionDef, LeaderDef, RosterSlotDef } from './catalog/types';
import {
  FACTIONS,
  getCatalogUnit,
  getFaction,
  getLeader,
  leadersForFaction,
  LEADER_MINI_MAX_COPIES,
  rosterSpawnPoints,
} from './armyCatalog';
import { buildCatalogArmyStyleRow, createPencilEditButton } from './catalogEditorRosterRow';
import {
  unitPanelThumbSrc,
  type AttackAbility,
  type DamageType,
  type Domain,
  type UnitCardData,
} from './unitCard';

const DAMAGE_TYPES: DamageType[] = ['physical', 'fire', 'mental', 'poison', 'cold', 'electric'];
const DOMAIN_IDS: Domain[] = ['life', 'creation', 'death', 'destruction'];

const DOMAIN_LABELS: Record<Domain, string> = {
  life: 'Жизнь',
  creation: 'Созидание',
  death: 'Смерть',
  destruction: 'Разрушение',
};

function factionsForDomain(domain: Domain): FactionDef[] {
  return FACTIONS.filter((f) => f.domain === domain);
}

/** Unit ids used by any leader of this faction (mini + roster). */
function unitIdsForFaction(factionId: string): Set<string> {
  const ids = new Set<string>();
  for (const l of leadersForFaction(factionId)) {
    ids.add(l.catalogUnitId);
    for (const s of l.roster) ids.add(s.unitId);
  }
  return ids;
}

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function numOrU(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function numOr0(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function reorderIds(ids: string[], movedId: string, targetId: string, before: boolean): string[] {
  if (!movedId || !targetId || movedId === targetId) return ids;
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  next.splice(from, 1);
  const insertAt = before ? (from < to ? to - 1 : to) : from < to ? to : to + 1;
  next.splice(insertAt, 0, movedId);
  return next;
}

/** `blob:` from file pickers dies after reload; persist as data URLs in localStorage. */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
    r.readAsDataURL(blob);
  });
}

async function resolveImageUrlForStorage(url: string | undefined): Promise<string | undefined> {
  const u = url?.trim();
  if (!u) return undefined;
  if (!u.startsWith('blob:')) return u;
  try {
    return await blobUrlToDataUrl(u);
  } catch (e) {
    console.warn('[catalogEditor] could not persist blob: URL (session ended?)', e);
    return undefined;
  }
}

async function resolveCardImageUrlsForStorage(card: UnitCardData): Promise<UnitCardData> {
  const [sprite, miniatureSprite] = await Promise.all([
    resolveImageUrlForStorage(card.sprite),
    resolveImageUrlForStorage(card.miniatureSprite),
  ]);
  return { ...card, sprite, miniatureSprite };
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

function commitCatalogLeaderPoints(
  leaderId: string,
  kind: 'mini' | 'slot',
  unitId: string,
  raw: string,
): void {
  const v = raw.trim() === '' ? undefined : numOrU(raw);
  if (kind === 'mini') {
    setLeaderPointsOverride(leaderId, v);
    return;
  }
  if (v === undefined) setRosterSlotPatch(leaderId, unitId, { points: undefined });
  else setRosterSlotPatch(leaderId, unitId, { points: v });
}

function commitCatalogLeaderMaxCopies(leaderId: string, unitId: string, raw: string): void {
  const o = getCatalogOverrides();
  const isNewLeader = o.newLeaders[leaderId] != null;
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (isNewLeader) setRosterSlotPatch(leaderId, unitId, { maxCopies: 1 });
    else setRosterSlotPatch(leaderId, unitId, { maxCopies: undefined });
    return;
  }
  const v = numOrU(raw);
  if (v === undefined) {
    if (isNewLeader) setRosterSlotPatch(leaderId, unitId, { maxCopies: 1 });
    else setRosterSlotPatch(leaderId, unitId, { maxCopies: undefined });
    return;
  }
  const mc = Math.max(1, Math.floor(v));
  setRosterSlotPatch(leaderId, unitId, { maxCopies: mc });
}

/** Убрать legacy binding при редактировании; custom dice → поля. */
function normalizeHotspotRegion(r: HotspotRegion): HotspotRegion {
  const out: HotspotRegion = { ...r };
  if (out.binding?.kind === 'custom' && out.binding.dice) {
    const d = out.binding.dice;
    if (d.red != null) out.red = d.red;
    if (d.black != null) out.black = d.black;
    if (d.green != null) out.green = d.green;
    if (d.white != null) out.white = d.white;
  }
  delete (out as { binding?: unknown }).binding;
  return out;
}

function stripRegionForSave(r: HotspotRegion): HotspotRegion {
  const { binding: _b, ...rest } = r;
  return rest;
}

type AttackRowRefs = {
  wrap: HTMLElement;
  name: HTMLInputElement;
  range: HTMLInputElement;
  melee: HTMLInputElement;
  dmgType: HTMLSelectElement;
  damage: HTMLInputElement;
  red: HTMLInputElement;
  black: HTMLInputElement;
  green: HTMLInputElement;
  white: HTMLInputElement;
};

export class CatalogEditorPanel {
  private menuBtn: HTMLButtonElement;
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private overridesRefreshQueued = false;
  private selectedFactionId: string;
  private selectedDomainId: Domain;
  private selectedLeaderId: string;
  private selectedUnitId: string | null = null;

  private crumbsEl!: HTMLElement;
  private unitSearchInput!: HTMLInputElement;
  private unitFormMainWrap!: HTMLElement;
  private unitFormDiceWrap!: HTMLElement;
  private unitFormAtkWrap!: HTMLElement;
  private unitSubTabMain!: HTMLButtonElement;
  private unitSubTabDice!: HTMLButtonElement;
  private unitSubTabAtk!: HTMLButtonElement;
  private unitSubTabHot!: HTMLButtonElement;

  private modalBackdrop!: HTMLElement;
  private unitModalBackdrop!: HTMLElement;
  private leaderModalLeaderId: string | null = null;
  private leaderModalIsNew = false;
  private leaderModalOpen = false;
  private leaderModalPendingRoster: RosterSlotDef[] = [];
  private lmLeaderId!: HTMLInputElement;
  private lmLeaderName!: HTMLInputElement;
  private lmLeaderPoints!: HTMLInputElement;
  private lmTemplateSel!: HTMLSelectElement;
  private lmSize!: HTMLSelectElement;
  private lmHealth!: HTMLInputElement;
  private lmMaxHealth!: HTMLInputElement;
  private lmWalk!: HTMLInputElement;
  private lmRun!: HTMLInputElement;
  private lmDomains!: HTMLInputElement;
  private lmSprite!: HTMLInputElement;
  private lmMiniatureSprite!: HTMLInputElement;
  private lmDefW!: HTMLInputElement;
  private lmDefG!: HTMLInputElement;
  private lmTabCard!: HTMLButtonElement;
  private lmTabRoster!: HTMLButtonElement;
  private lmPaneCard!: HTMLElement;
  private lmPaneRoster!: HTMLElement;
  private lmRosterHint!: HTMLElement;
  private lmModalTitleEl!: HTMLElement;
  /** Root `.ce-modal` for leader create/edit — used for roster-tab sizing. */
  private leaderModalEl!: HTMLDivElement;

  private applyError!: HTMLElement;
  private unitListEl!: HTMLElement;
  private leaderDeleteBtn!: HTMLButtonElement;
  private leaderRosterListEl!: HTMLElement;
  private leaderCatalogUnitSel!: HTMLSelectElement;
  private leaderRosterUnitSel!: HTMLSelectElement;
  private leaderRosterMaxCopies!: HTMLInputElement;
  private leaderRosterPoints!: HTMLInputElement;
  private leaderRosterRequiresUnitId!: HTMLSelectElement;
  private factionSelectEl!: HTMLSelectElement;

  private cardName!: HTMLInputElement;
  private cardSize!: HTMLSelectElement;
  private cardHealth!: HTMLInputElement;
  private cardMaxHealth!: HTMLInputElement;
  private cardWalk!: HTMLInputElement;
  private cardRun!: HTMLInputElement;
  private cardMoveUnit!: HTMLSelectElement;
  private cardDefW!: HTMLInputElement;
  private cardDefG!: HTMLInputElement;
  private cardDomains!: HTMLInputElement;
  private cardKeywords!: HTMLInputElement;
  private cardSprite!: HTMLInputElement;
  private cardMiniatureSprite!: HTMLInputElement;
  private cardConcR!: HTMLInputElement;
  private cardConcG!: HTMLInputElement;
  private cardConcB!: HTMLInputElement;
  private cardConcW!: HTMLInputElement;
  private cardReactW!: HTMLInputElement;
  private cardReactG!: HTMLInputElement;
  private cardExpR!: HTMLInputElement;
  private cardExpG!: HTMLInputElement;
  private cardExpB!: HTMLInputElement;
  private cardExpW!: HTMLInputElement;
  private cardExplorationRange!: HTMLInputElement;
  private cardGrabRange!: HTMLInputElement;
  private cardGrabRangeUnit!: HTMLSelectElement;
  private attacksContainer!: HTMLElement;
  private attackRows: AttackRowRefs[] = [];

  private hotspotImageInput!: HTMLInputElement;
  private hotspotStage!: HTMLElement;
  private hotspotImg!: HTMLImageElement;
  private hsRange!: HTMLInputElement;
  private hsRangeUnit!: HTMLSelectElement;
  private hsDamage!: HTMLInputElement;
  private hsRed!: HTMLInputElement;
  private hsBlack!: HTMLInputElement;
  private hsGreen!: HTMLInputElement;
  private hsWhite!: HTMLInputElement;
  private hsPresetSelect!: HTMLSelectElement;
  private saveHotspotPresetBtn!: HTMLButtonElement;
  private hotspotHint!: HTMLElement;
  private hotspotPresetSaveBackdrop!: HTMLElement;
  private hotspotPresetNameInput!: HTMLInputElement;
  private hotspotPresetDefaultCb!: HTMLInputElement;
  private hotspotQuickEditWrap!: HTMLElement;
  private hsQeRange!: HTMLInputElement;
  private hsQeRangeUnit!: HTMLSelectElement;
  private hsQeDamage!: HTMLInputElement;
  private hsQeRed!: HTMLInputElement;
  private hsQeBlack!: HTMLInputElement;
  private hsQeGreen!: HTMLInputElement;
  private hsQeWhite!: HTMLInputElement;

  private hotspotRegions: HotspotRegion[] = [];
  private hotspotImageUrl = '';
  private selectedRegionIndex: number | null = null;
  private hotspotClipboard: HotspotRegion | null = null;
  private unitIdInput!: HTMLInputElement;
  private unitNameInput!: HTMLInputElement;
  private unitCloneSelect!: HTMLSelectElement;
  private unitCostHintEl!: HTMLElement;
  private drag:
    | { kind: 'move'; index: number; offX: number; offY: number }
    | {
        kind: 'resize';
        index: number;
        startX: number;
        startY: number;
        ox: number;
        oy: number;
        ow: number;
        oh: number;
      }
    | null = null;

  private unitFormIsNew = false;
  private unitCreatePresetLeaderId: string | null = null;
  private unitListViewWrap!: HTMLElement;
  private unitFormViewWrap!: HTMLElement;
  private unitFormTitleEl!: HTMLElement;
  private unitPresetHintEl!: HTMLElement;
  private unitFormSaveBtn!: HTMLButtonElement;
  private unitAddListBtn!: HTMLButtonElement;
  private unitFactionFilterSel!: HTMLSelectElement;
  private unitHotSectionWrap!: HTMLElement;
  private removeUnitBtn!: HTMLButtonElement;

  private leaderAttachedUnitsEl!: HTMLElement;
  private leaderAttachExistingUnitSel!: HTMLSelectElement;
  private unitStubFieldsWrap!: HTMLElement;

  constructor(toolbarMount: HTMLElement) {
    this.selectedFactionId = FACTIONS[0]?.id ?? '';
    this.selectedDomainId = (FACTIONS[0]?.domain ?? 'life') as Domain;
    const first = leadersForFaction(this.selectedFactionId);
    this.selectedLeaderId = first[0]?.id ?? '';

    this.menuBtn = el('button', 'catalog-editor-menu-btn') as HTMLButtonElement;
    this.menuBtn.type = 'button';
    this.menuBtn.title = 'Редактор каталога';
    this.menuBtn.setAttribute('aria-label', 'Редактор каталога');
    this.menuBtn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(true);
    });
    toolbarMount.appendChild(this.menuBtn);

    this.overlay = el('div', 'catalog-editor-overlay');
    this.overlay.addEventListener('click', () => this.setOpen(false));
    document.body.appendChild(this.overlay);

    this.panel = el('aside', 'catalog-editor-panel');
    this.panel.tabIndex = -1;
    const header = el('div', 'catalog-editor-header');
    header.appendChild(el('div', 'catalog-editor-title', 'Каталог'));
    const closeBtn = el('button', 'catalog-editor-close', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.setOpen(false));
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    this.body = el('div', 'catalog-editor-body');
    this.panel.appendChild(this.body);
    document.body.appendChild(this.panel);

    this.buildBody();

    document.addEventListener('keydown', this.onDocumentHotspotShortcutsCapture, true);

    window.addEventListener(CATALOG_OVERRIDES_CHANGED, () => {
      if (!this.open) return;
      this.scheduleOverridesRefresh();
    });
  }

  private scheduleOverridesRefresh(): void {
    if (this.overridesRefreshQueued) return;
    this.overridesRefreshQueued = true;
    requestAnimationFrame(() => {
      this.overridesRefreshQueued = false;
      if (!this.open) return;
      this.refreshLeaderSelect();
      this.refreshUnitLibraryList();
      this.updateBreadcrumbs();
      this.refreshLeaderAttachedUnits();
      this.refreshLeaderRosterEditor();
      this.refreshUnitSelectors();
      this.refreshHotspotPresetSelect();
    });
  }

  getMenuButton(): HTMLElement {
    return this.menuBtn;
  }

  private buildBody(): void {
    this.body.innerHTML = '';
    const leaderPane = el('div', 'ce-root-pane ce-pane--leaders');
    const unitPane = el('div', 'ce-root-pane ce-pane--units');
    unitPane.hidden = true;
    const rootTabs = el('div', 'catalog-editor-tabs ce-root-tabs');
    const tLeaders = el('button', 'catalog-editor-tab catalog-editor-tab--active', 'Лидеры');
    const tUnits = el('button', 'catalog-editor-tab', 'Юниты');
    tLeaders.type = 'button';
    tUnits.type = 'button';
    tLeaders.addEventListener('click', () => {
      tLeaders.classList.add('catalog-editor-tab--active');
      tUnits.classList.remove('catalog-editor-tab--active');
      leaderPane.hidden = false;
      unitPane.hidden = true;
      this.panel.classList.remove('ce-panel--units-mode');
      this.panel.classList.add('ce-panel--leaders-mode');
      this.backFromUnitFormIfNeeded();
    });
    tUnits.addEventListener('click', () => {
      tUnits.classList.add('catalog-editor-tab--active');
      tLeaders.classList.remove('catalog-editor-tab--active');
      unitPane.hidden = false;
      leaderPane.hidden = true;
      this.panel.classList.remove('ce-panel--leaders-mode');
      this.panel.classList.add('ce-panel--units-mode');
    });
    rootTabs.appendChild(tLeaders);
    rootTabs.appendChild(tUnits);
    this.panel.classList.add('ce-panel--leaders-mode');

    this.body.appendChild(
      el(
        'p',
        'catalog-editor-hint',
        'Изменения хранятся в localStorage. Экспортируйте JSON для коммита в репозиторий. Большие картинки кладите в public/ и укажите путь.',
      ),
    );

    this.crumbsEl = el('div', 'ce-breadcrumbs', '');
    leaderPane.appendChild(this.crumbsEl);

    const domainRow = el('div', 'ce-domain-chips');
    domainRow.appendChild(el('span', 'ce-domain-chips-label', 'Домен'));
    for (const d of DOMAIN_IDS) {
      const chip = el(
        'button',
        `ce-domain-chip ce-domain-chip--${d}`,

        DOMAIN_LABELS[d],
      ) as HTMLButtonElement;
      chip.type = 'button';
      if (d === this.selectedDomainId) chip.classList.add('ce-domain-chip--active');
      chip.addEventListener('click', () => {
        this.selectedDomainId = d;
        domainRow.querySelectorAll('.ce-domain-chip').forEach((c) => c.classList.remove('ce-domain-chip--active'));
        chip.classList.add('ce-domain-chip--active');
        const facs = factionsForDomain(d);
        this.factionSelectEl.innerHTML = '';
        for (const f of facs) {
          this.factionSelectEl.appendChild(new Option(f.name, f.id));
        }
        this.selectedFactionId = facs[0]?.id ?? '';
        this.factionSelectEl.value = this.selectedFactionId;
        const ls = leadersForFaction(this.selectedFactionId);
        this.selectedLeaderId = ls[0]?.id ?? '';
        this.selectedUnitId = null;
        this.refreshLeaderSelect();
        this.updateBreadcrumbs();
        this.clearEditor();
      });
      domainRow.appendChild(chip);
    }
    leaderPane.appendChild(domainRow);

    const row1 = el('div', 'catalog-editor-row');
    row1.appendChild(el('label', '', 'Фракция'));
    this.factionSelectEl = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.factionSelectEl.id = 'ce-faction-select';
    const facsInDomain = factionsForDomain(this.selectedDomainId);
    for (const f of facsInDomain) {
      this.factionSelectEl.appendChild(new Option(f.name, f.id));
    }
    if (facsInDomain.some((f) => f.id === this.selectedFactionId)) {
      this.factionSelectEl.value = this.selectedFactionId;
    } else {
      this.selectedFactionId = facsInDomain[0]?.id ?? '';
      this.factionSelectEl.value = this.selectedFactionId;
    }
    this.factionSelectEl.addEventListener('change', () => {
      this.selectedFactionId = this.factionSelectEl.value;
      const ls = leadersForFaction(this.selectedFactionId);
      this.selectedLeaderId = ls[0]?.id ?? '';
      this.selectedUnitId = null;
      this.refreshLeaderSelect();
      this.updateBreadcrumbs();
      this.clearEditor();
    });
    row1.appendChild(this.factionSelectEl);
    leaderPane.appendChild(row1);

    const row2 = el('div', 'catalog-editor-row');
    row2.appendChild(el('label', '', 'Лидер'));
    const leadSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    leadSel.id = 'ce-leader-select';
    row2.appendChild(leadSel);
    this.leaderDeleteBtn = el('button', 'catalog-editor-icon-btn', '×') as HTMLButtonElement;
    this.leaderDeleteBtn.type = 'button';
    this.leaderDeleteBtn.title = 'Удалить лидера';
    this.leaderDeleteBtn.setAttribute('aria-label', 'Удалить лидера');
    this.leaderDeleteBtn.addEventListener('click', () => this.deleteSelectedLeader());
    row2.appendChild(this.leaderDeleteBtn);
    const createLeaderBtn = el('button', 'catalog-editor-btn', 'Создать лидера') as HTMLButtonElement;
    createLeaderBtn.type = 'button';
    createLeaderBtn.addEventListener('click', () => this.openLeaderModal('new'));
    row2.appendChild(createLeaderBtn);
    const editLeaderBtn = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', 'Изменить') as HTMLButtonElement;
    editLeaderBtn.type = 'button';
    editLeaderBtn.addEventListener('click', () => {
      if (!this.selectedLeaderId) {
        alert('Выберите лидера');
        return;
      }
      this.openLeaderModal('edit', this.selectedLeaderId);
    });
    row2.appendChild(editLeaderBtn);
    leaderPane.appendChild(row2);

    const rosterSection = el('div', 'ce-leader-roster-section');
    rosterSection.appendChild(el('div', 'ce-field-label', 'Юниты ростера'));
    this.leaderAttachedUnitsEl = el('div', 'ce-leader-attached-units');
    rosterSection.appendChild(this.leaderAttachedUnitsEl);
    const addUnitFromLeaderBtn = el('button', 'catalog-editor-btn', 'Новый юнит') as HTMLButtonElement;
    addUnitFromLeaderBtn.type = 'button';
    addUnitFromLeaderBtn.title = 'Создать нового юнита и сразу добавить в ростер';
    addUnitFromLeaderBtn.addEventListener('click', () => this.openUnitCreateFromLeader());
    rosterSection.appendChild(addUnitFromLeaderBtn);

    const attachRow = el('div', 'ce-leader-attach-existing-row');
    this.leaderAttachExistingUnitSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.leaderAttachExistingUnitSel.id = 'ce-leader-attach-unit';
    const attachExistingBtn = el(
      'button',
      'catalog-editor-btn catalog-editor-btn-secondary',
      'Добавить из библиотеки',
    ) as HTMLButtonElement;
    attachExistingBtn.type = 'button';
    attachExistingBtn.title = 'Добавить уже существующего юнита (из вкладки «Юниты») в ростер';
    attachExistingBtn.addEventListener('click', () => this.attachExistingUnitToSelectedLeader());
    attachRow.appendChild(this.leaderAttachExistingUnitSel);
    attachRow.appendChild(attachExistingBtn);
    rosterSection.appendChild(attachRow);

    leaderPane.appendChild(rosterSection);

    unitPane.appendChild(el('div', 'ce-pane-title', 'Библиотека юнитов'));

    this.unitListViewWrap = el('div', 'ce-unit-list-view');
    this.unitSearchInput = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.unitSearchInput.type = 'search';
    this.unitSearchInput.placeholder = 'Поиск по id или имени…';
    this.unitSearchInput.addEventListener('input', () => this.refreshUnitLibraryList());
    this.unitListViewWrap.appendChild(this.unitSearchInput);

    this.unitAddListBtn = el('button', 'catalog-editor-btn', 'Добавить юнита') as HTMLButtonElement;
    this.unitAddListBtn.type = 'button';
    this.unitAddListBtn.addEventListener('click', () => this.openUnitFormCreate());
    this.unitListViewWrap.appendChild(this.unitAddListBtn);

    const facFilterRow = el('div', 'catalog-editor-row ce-faction-filter-row');
    facFilterRow.appendChild(el('label', '', 'Фракция'));
    this.unitFactionFilterSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.unitFactionFilterSel.appendChild(new Option('Все фракции', ''));
    for (const f of FACTIONS) {
      this.unitFactionFilterSel.appendChild(new Option(f.name, f.id));
    }
    this.unitFactionFilterSel.addEventListener('change', () => this.refreshUnitLibraryList());
    facFilterRow.appendChild(this.unitFactionFilterSel);
    this.unitListViewWrap.appendChild(facFilterRow);

    this.unitListEl = el('div', 'catalog-editor-unit-list ce-unit-lib-list');
    this.unitListViewWrap.appendChild(this.unitListEl);
    unitPane.appendChild(this.unitListViewWrap);

    this.unitFormTitleEl = el('div', 'ce-modal__title', 'Юнит');
    this.unitFormViewWrap = el('div', 'ce-unit-form-view ce-modal-pane ce-unit-form-modal-body');

    this.unitPresetHintEl = el('div', 'catalog-editor-hint ce-unit-preset-hint');
    this.unitPresetHintEl.hidden = true;
    this.unitFormViewWrap.appendChild(this.unitPresetHintEl);

    const unitEditorCol = el('div', 'ce-unit-editor-col');
    this.unitFormViewWrap.appendChild(unitEditorCol);

    const newBlock = el('div', 'catalog-editor-row ce-unit-stub-fields');
    newBlock.style.flexDirection = 'column';
    this.unitStubFieldsWrap = newBlock;
    newBlock.appendChild(el('label', '', 'Идентификатор и шаблон'));
    this.unitIdInput = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.unitIdInput.type = 'text';
    this.unitIdInput.placeholder = 'id (латиница, уникально)';
    this.unitNameInput = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.unitNameInput.type = 'text';
    this.unitNameInput.placeholder = 'Имя на карте';
    this.unitCloneSelect = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.unitCloneSelect.appendChild(new Option('— без клона —', ''));
    for (const uid of listAllUnitIds()) {
      this.unitCloneSelect.appendChild(new Option(uid, uid));
    }
    newBlock.appendChild(this.unitIdInput);
    newBlock.appendChild(this.unitNameInput);
    newBlock.appendChild(this.unitCloneSelect);
    this.unitCostHintEl = el(
      'div',
      'catalog-editor-hint ce-unit-cost-hint',
      'Стоимость в армии задаётся у лидера: миниатюра лидера и слоты ростера (не здесь).',
    );
    newBlock.appendChild(this.unitCostHintEl);
    unitEditorCol.appendChild(newBlock);

    const unitSubTabs = el('div', 'catalog-editor-tabs ce-unit-subtabs');
    this.unitSubTabMain = el('button', 'catalog-editor-tab catalog-editor-tab--active', 'Основное') as HTMLButtonElement;
    this.unitSubTabDice = el('button', 'catalog-editor-tab', 'Кубы') as HTMLButtonElement;
    this.unitSubTabAtk = el('button', 'catalog-editor-tab', 'Атаки') as HTMLButtonElement;
    this.unitSubTabHot = el('button', 'catalog-editor-tab', 'Хотспоты') as HTMLButtonElement;
    this.unitSubTabMain.type = 'button';
    this.unitSubTabDice.type = 'button';
    this.unitSubTabAtk.type = 'button';
    this.unitSubTabHot.type = 'button';
    this.unitFormMainWrap = el('div', 'ce-unit-subpane ce-unit-subpane--active catalog-editor-data-section');
    this.unitFormDiceWrap = el('div', 'ce-unit-subpane catalog-editor-data-section');
    this.unitFormDiceWrap.hidden = true;
    this.unitFormAtkWrap = el('div', 'ce-unit-subpane catalog-editor-data-section');
    this.unitFormAtkWrap.hidden = true;
    const hotSection = el('div', 'catalog-editor-hot-section ce-unit-subpane');
    hotSection.hidden = true;
    this.unitHotSectionWrap = hotSection;
    this.unitSubTabMain.addEventListener('click', () => this.activateUnitSubPane('main'));
    this.unitSubTabDice.addEventListener('click', () => this.activateUnitSubPane('dice'));
    this.unitSubTabAtk.addEventListener('click', () => this.activateUnitSubPane('atk'));
    this.unitSubTabHot.addEventListener('click', () => this.activateUnitSubPane('hot'));
    unitSubTabs.appendChild(this.unitSubTabMain);
    unitSubTabs.appendChild(this.unitSubTabDice);
    unitSubTabs.appendChild(this.unitSubTabAtk);
    unitSubTabs.appendChild(this.unitSubTabHot);
    unitEditorCol.appendChild(unitSubTabs);

    this.applyError = el('div', 'catalog-editor-error');

    const mk = (label: string, inp: HTMLElement) => {
      const row = el('div', 'catalog-editor-field');
      row.appendChild(el('span', 'catalog-editor-field-label', label));
      row.appendChild(inp);
      this.unitFormMainWrap.appendChild(row);
    };

    this.cardName = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardName.type = 'text';
    mk('Имя', this.cardName);

    this.cardSize = el('select', 'catalog-editor-select') as HTMLSelectElement;
    for (const s of ['small', 'big', 'large', 'huge'] as const) {
      this.cardSize.appendChild(new Option(s, s));
    }
    mk('Размер', this.cardSize);

    this.cardHealth = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardHealth.type = 'number';
    mk('Здоровье', this.cardHealth);

    this.cardMaxHealth = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardMaxHealth.type = 'number';
    mk('Макс. здоровье', this.cardMaxHealth);

    this.cardWalk = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardWalk.type = 'number';
    mk('Шаг', this.cardWalk);

    this.cardRun = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardRun.type = 'number';
    mk('Бег', this.cardRun);

    this.cardMoveUnit = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.cardMoveUnit.appendChild(new Option('по умолчанию', ''));
    this.cardMoveUnit.appendChild(new Option('hex', 'hex'));
    this.cardMoveUnit.appendChild(new Option('hexon', 'hexon'));
    mk('Единица движения', this.cardMoveUnit);

    this.cardDefW = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardDefW.type = 'number';
    mk('Защита (белые)', this.cardDefW);
    this.cardDefG = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardDefG.type = 'number';
    mk('Защита (зелёные)', this.cardDefG);

    this.cardDomains = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardDomains.placeholder = 'life, creation';
    mk('Домены (через запятую)', this.cardDomains);

    this.cardKeywords = el('input', 'catalog-editor-input') as HTMLInputElement;
    mk('Ключевые слова (через запятую)', this.cardKeywords);

    this.cardSprite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardMiniatureSprite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardSprite.placeholder = '/card.png';
    this.cardMiniatureSprite.placeholder = '/token.png';
    const mkImgRow = (label: string, inp: HTMLInputElement) => {
      const row = el('div', 'catalog-editor-field ce-img-url-row');
      row.appendChild(el('span', 'catalog-editor-field-label', label));
      const wrap = el('div', 'ce-img-url-row-controls');
      wrap.appendChild(inp);
      const fileIn = el('input', 'catalog-editor-input') as HTMLInputElement;
      fileIn.type = 'file';
      fileIn.accept = 'image/*';
      fileIn.title =
        'Файл сохраняется в оверрайды как data URL. Либо укажите путь под public/, например /card.png';
      fileIn.addEventListener('change', () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        void readImageFileAsDataUrl(f)
          .then((dataUrl) => {
            inp.value = dataUrl;
          })
          .catch((e) => {
            console.error(e);
            this.applyError.textContent = 'Не удалось прочитать файл изображения';
          });
      });
      wrap.appendChild(fileIn);
      row.appendChild(wrap);
      this.unitFormMainWrap.appendChild(row);
    };
    mkImgRow('Карточка (изображение)', this.cardSprite);
    mkImgRow('Миниатюра (токен на столе)', this.cardMiniatureSprite);

    const mkDiceRow = (
      sectionTitle: string,
      fields: Array<{ label: string; color: string; input: HTMLInputElement }>,
      extraField?: { label: string; input: HTMLInputElement },
    ) => {
      const sec = el('div', 'ce-dice-section');
      sec.appendChild(el('div', 'ce-dice-title', sectionTitle));
      const row = el('div', 'ce-dice-row');
      for (const field of fields) {
        const item = el('label', 'ce-dice-cell');
        const swatch = el('span', 'ce-dice-cell-swatch');
        swatch.style.background = field.color;
        swatch.title = field.label;
        swatch.setAttribute('aria-label', field.label);
        item.appendChild(swatch);
        row.appendChild(item);
        item.appendChild(field.input);
      }
      sec.appendChild(row);
      if (extraField) {
        const extra = el('div', 'catalog-editor-field');
        extra.appendChild(el('span', 'catalog-editor-field-label', extraField.label));
        extra.appendChild(extraField.input);
        sec.appendChild(extra);
      }
      this.unitFormDiceWrap.appendChild(sec);
    };

    this.cardConcR = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardConcR.type = 'number';
    this.cardConcG = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardConcG.type = 'number';
    this.cardConcB = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardConcB.type = 'number';
    this.cardConcW = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardConcW.type = 'number';
    mkDiceRow('Концентрация', [
      { label: 'Красные кубики', color: '#d14b4b', input: this.cardConcR },
      { label: 'Зелёные кубики', color: '#46b969', input: this.cardConcG },
      { label: 'Чёрные кубики', color: '#1e1e1e', input: this.cardConcB },
      { label: 'Белые кубики', color: '#f2f3f5', input: this.cardConcW },
    ]);

    this.cardReactW = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardReactW.type = 'number';
    this.cardReactG = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardReactG.type = 'number';
    mkDiceRow('Реакция защиты', [
      { label: 'Зелёные кубики', color: '#46b969', input: this.cardReactG },
      { label: 'Белые кубики', color: '#f2f3f5', input: this.cardReactW },
    ]);

    this.cardExpR = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardExpR.type = 'number';
    this.cardExpG = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardExpG.type = 'number';
    this.cardExpB = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardExpB.type = 'number';
    this.cardExpW = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardExpW.type = 'number';
    this.cardExplorationRange = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardExplorationRange.type = 'number';
    mkDiceRow(
      'Исследование',
      [
        { label: 'Красные кубики', color: '#d14b4b', input: this.cardExpR },
        { label: 'Зелёные кубики', color: '#46b969', input: this.cardExpG },
        { label: 'Чёрные кубики', color: '#1e1e1e', input: this.cardExpB },
        { label: 'Белые кубики', color: '#f2f3f5', input: this.cardExpW },
      ],
      { label: 'Дальность исследования', input: this.cardExplorationRange },
    );

    this.cardGrabRange = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.cardGrabRange.type = 'number';
    this.cardGrabRange.min = '0';
    this.cardGrabRange.step = '1';
    this.cardGrabRangeUnit = el('select', 'catalog-editor-select ce-hs-range-unit') as HTMLSelectElement;
    this.cardGrabRangeUnit.appendChild(new Option('по умолчанию', ''));
    this.cardGrabRangeUnit.appendChild(new Option('гекс', 'hex'));
    this.cardGrabRangeUnit.appendChild(new Option('гексон', 'hexon'));
    this.cardGrabRangeUnit.title = 'Малая / large: по умолчанию гекс; big / huge: по умолчанию гексон';
    const grabGrabRow = el('div', 'catalog-editor-field');
    grabGrabRow.appendChild(el('span', 'catalog-editor-field-label', 'Дальность «взять»'));
    const grabInner = el('div', 'ce-hs-range-row');
    grabInner.appendChild(this.cardGrabRange);
    grabInner.appendChild(this.cardGrabRangeUnit);
    grabGrabRow.appendChild(grabInner);
    this.unitFormDiceWrap.appendChild(grabGrabRow);

    this.unitFormAtkWrap.appendChild(el('label', '', 'Атаки'));
    this.attacksContainer = el('div', 'ce-attacks-wrap');
    this.unitFormAtkWrap.appendChild(this.attacksContainer);
    const addAtk = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', '+ Атака');
    addAtk.type = 'button';
    addAtk.addEventListener('click', () => this.addAttackRow());
    this.unitFormAtkWrap.appendChild(addAtk);

    this.unitFormMainWrap.appendChild(this.applyError);

    this.hotspotImageInput = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hotspotImageInput.type = 'text';
    this.hotspotImageInput.placeholder = '/kellantra-on-lagvud.png';
    this.hotspotImageInput.addEventListener('change', () => {
      const v = this.hotspotImageInput.value.trim();
      if (v) {
        this.hotspotImg.src = v;
        this.hotspotImageUrl = v;
      }
    });
    const fileIn = el('input', 'catalog-editor-input') as HTMLInputElement;
    fileIn.type = 'file';
    fileIn.accept = 'image/*';
    fileIn.addEventListener('change', () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      void readImageFileAsDataUrl(f)
        .then((dataUrl) => {
          this.hotspotImageUrl = dataUrl;
          this.hotspotImg.src = dataUrl;
          this.hotspotImageInput.value = dataUrl;
          this.hotspotHint.textContent =
            'Изображение встроено (data URL). Нажмите «Сохранить хотспоты», чтобы записать в оверрайды.';
        })
        .catch((e) => {
          console.error(e);
          this.hotspotHint.textContent = 'Не удалось прочитать файл.';
        });
    });

    this.hotspotStage = el('div', 'ce-hotspot-stage uc-image-card-inner');
    this.hotspotStage.tabIndex = 0;
    this.hotspotImg = document.createElement('img');
    this.hotspotImg.className = 'uc-image-card-img';
    this.hotspotImg.alt = '';
    this.hotspotStage.appendChild(this.hotspotImg);
    this.hotspotStage.addEventListener('pointerdown', (e) => this.onStagePointerDown(e));

    const addReg = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', '+ Зона');
    addReg.type = 'button';
    addReg.addEventListener('click', () => {
      const n = this.hotspotRegions.length;
      this.hotspotRegions.push({
        id: `zone_${Date.now()}`,
        label: `Зона ${n + 1}`,
        x: 0.05,
        y: 0.1 + n * 0.05,
        w: 0.9,
        h: 0.04,
        rangeUnit: 'hex',
      });
      this.selectedRegionIndex = this.hotspotRegions.length - 1;
      this.renderHotspotRects();
      this.syncHotspotFieldsFromRegion();
    });

    const hotKeysHint = el(
      'div',
      'ce-hs-keys-hint',
      'Двойной щелчок по зоне — дальность, урон и кубики. Ctrl+C / Ctrl+V — копировать и вставить зону, Delete — удалить выбранную.',
    );

    const hsGrid = el('div', 'ce-hs-fields');
    const h = (lab: string, inp: HTMLInputElement) => {
      const d = el('div', 'ce-hs-field');
      d.appendChild(el('span', 'ce-hs-field-lab', lab));
      d.appendChild(inp);
      hsGrid.appendChild(d);
    };
    const rangeField = el('div', 'ce-hs-field');
    rangeField.appendChild(el('span', 'ce-hs-field-lab', 'Дальность'));
    const rangeRow = el('div', 'ce-hs-range-row');
    this.hsRange = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsRange.type = 'number';
    this.hsRange.min = '0';
    this.hsRange.step = '1';
    this.hsRangeUnit = el('select', 'catalog-editor-select ce-hs-range-unit') as HTMLSelectElement;
    this.hsRangeUnit.appendChild(new Option('гекс', 'hex'));
    this.hsRangeUnit.appendChild(new Option('гексон', 'hexon'));
    this.hsRangeUnit.title = 'Единица дальности для подсветки на поле';
    rangeRow.appendChild(this.hsRange);
    rangeRow.appendChild(this.hsRangeUnit);
    rangeField.appendChild(rangeRow);
    hsGrid.appendChild(rangeField);
    this.hsDamage = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsDamage.type = 'number';
    h('Урон', this.hsDamage);
    this.hsRed = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsRed.type = 'number';
    this.hsBlack = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsBlack.type = 'number';
    this.hsGreen = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsGreen.type = 'number';
    this.hsWhite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsWhite.type = 'number';
    const diceRow = el('div', 'ce-hs-field ce-hs-field--dice-row');
    diceRow.appendChild(el('span', 'ce-hs-field-lab', 'Кубики'));
    const diceIn = el('div', 'ce-hs-dice-inputs');
    const mkDiceChip = (inp: HTMLInputElement, bg: string, border?: string) => {
      const lab = el('label', 'ce-hs-dice-chip');
      const sw = el('span', 'ce-hs-dice-swatch');
      sw.style.background = bg;
      if (border) sw.style.boxShadow = `inset 0 0 0 1px ${border}`;
      lab.appendChild(sw);
      inp.classList.add('ce-hs-dice-num');
      inp.min = '0';
      inp.step = '1';
      lab.appendChild(inp);
      diceIn.appendChild(lab);
    };
    mkDiceChip(this.hsRed, '#d14b4b');
    mkDiceChip(this.hsBlack, '#1a1a22', 'rgba(255,255,255,0.2)');
    mkDiceChip(this.hsGreen, '#46b969');
    mkDiceChip(this.hsWhite, '#e8eaef', 'rgba(0,0,0,0.22)');
    diceRow.appendChild(diceIn);
    hsGrid.appendChild(diceRow);
    [this.hsRange, this.hsDamage, this.hsRed, this.hsBlack, this.hsGreen, this.hsWhite].forEach((inp) => {
      inp.addEventListener('change', () => this.applyHotspotFieldsToSelected());
      inp.addEventListener('input', () => this.applyHotspotFieldsToSelected());
    });
    this.hsRangeUnit.addEventListener('change', () => this.applyHotspotFieldsToSelected());

    const saveHotBtn = el('button', 'catalog-editor-btn', 'Сохранить хотспоты');
    saveHotBtn.type = 'button';
    saveHotBtn.addEventListener('click', () => void this.saveHotspots());

    this.saveHotspotPresetBtn = el(
      'button',
      'catalog-editor-btn catalog-editor-btn-secondary',
      'Сохранить пресет',
    ) as HTMLButtonElement;
    this.saveHotspotPresetBtn.type = 'button';
    this.saveHotspotPresetBtn.title = 'Сохранить только раскладку зон (x,y,w,h), без дальности и кубиков';
    this.saveHotspotPresetBtn.addEventListener('click', () => this.saveHotspotLayoutPresetFromUi());

    this.hsPresetSelect = el('select', 'catalog-editor-select ce-hs-preset-select') as HTMLSelectElement;
    this.hsPresetSelect.setAttribute('aria-label', 'Пресет раскладки хот-спотов');
    this.hsPresetSelect.addEventListener('change', () => this.applyHotspotLayoutPresetSelection());

    this.hotspotHint = el('div', 'catalog-editor-hint');

    hotSection.appendChild(el('label', '', 'URL картинки (public/)'));
    hotSection.appendChild(this.hotspotImageInput);
    hotSection.appendChild(fileIn);
    hotSection.appendChild(this.hotspotStage);
    hotSection.appendChild(addReg);
    hotSection.appendChild(hotKeysHint);
    hotSection.appendChild(el('label', '', 'Параметры выбранной зоны'));
    hotSection.appendChild(hsGrid);
    const presetRow = el('div', 'ce-hs-preset-row');
    presetRow.appendChild(el('span', 'ce-hs-field-lab', 'Пресет раскладки'));
    presetRow.appendChild(this.hsPresetSelect);
    hotSection.appendChild(presetRow);
    const saveHotRow = el('div', 'ce-hs-save-row');
    saveHotRow.appendChild(saveHotBtn);
    saveHotRow.appendChild(this.saveHotspotPresetBtn);
    hotSection.appendChild(saveHotRow);
    hotSection.appendChild(this.hotspotHint);
    this.refreshHotspotPresetSelect();

    unitEditorCol.appendChild(this.unitFormMainWrap);
    unitEditorCol.appendChild(this.unitFormDiceWrap);
    unitEditorCol.appendChild(this.unitFormAtkWrap);
    unitEditorCol.appendChild(hotSection);

    const formFooter = el('div', 'ce-unit-form-footer catalog-editor-row');
    this.removeUnitBtn = el('button', 'catalog-editor-btn catalog-editor-btn-danger', 'Удалить юнита') as HTMLButtonElement;
    this.removeUnitBtn.type = 'button';
    this.removeUnitBtn.hidden = true;
    this.removeUnitBtn.addEventListener('click', () => this.deleteSelectedUnit());
    this.unitFormSaveBtn = el('button', 'catalog-editor-btn', 'Сохранить') as HTMLButtonElement;
    this.unitFormSaveBtn.type = 'button';
    this.unitFormSaveBtn.addEventListener('click', () => void this.saveUnitForm());
    formFooter.appendChild(this.removeUnitBtn);
    formFooter.appendChild(this.unitFormSaveBtn);
    unitEditorCol.appendChild(formFooter);

    const ioRow = el('div', 'catalog-editor-row');
    ioRow.style.flexWrap = 'wrap';
    const exp = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', 'Экспорт JSON');
    exp.type = 'button';
    exp.addEventListener('click', () => {
      const blob = new Blob([exportCatalogOverridesJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hex-board-catalog-overrides.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const imp = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', 'Импорт JSON');
    imp.type = 'button';
    imp.addEventListener('click', () => {
      const inp = el('input', '') as HTMLInputElement;
      inp.type = 'file';
      inp.accept = 'application/json';
      inp.addEventListener('change', () => {
        const f = inp.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const t = typeof r.result === 'string' ? r.result : '';
          const res = importCatalogOverridesJson(t);
          if (!res.ok) alert(res.error);
          else {
            this.refreshUnitLibraryList();
            alert('Импортировано');
          }
        };
        r.readAsText(f);
      });
      inp.click();
    });
    const reset = el('button', 'catalog-editor-btn catalog-editor-btn-danger', 'Сбросить всё');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      if (confirm('Удалить все оверрайды каталога?')) resetCatalogOverrides();
    });
    ioRow.appendChild(exp);
    ioRow.appendChild(imp);
    ioRow.appendChild(reset);
    unitPane.appendChild(ioRow);
    this.body.appendChild(rootTabs);
    this.body.appendChild(leaderPane);
    this.body.appendChild(unitPane);

    this.buildLeaderModal();
    this.buildUnitModal();
    this.buildHotspotPresetSaveDialog();
    this.buildHotspotQuickEdit();
    this.setupModalEscapeHandler();
    this.refreshLeaderSelect();
    this.refreshUnitLibraryList();
    this.updateBreadcrumbs();
    this.refreshLeaderAttachedUnits();
    this.refreshRequiresUnitSelect();
  }

  private activateUnitSubPane(which: 'main' | 'dice' | 'atk' | 'hot'): void {
    this.unitSubTabMain.classList.toggle('catalog-editor-tab--active', which === 'main');
    this.unitSubTabDice.classList.toggle('catalog-editor-tab--active', which === 'dice');
    this.unitSubTabAtk.classList.toggle('catalog-editor-tab--active', which === 'atk');
    this.unitSubTabHot.classList.toggle('catalog-editor-tab--active', which === 'hot');
    this.unitFormMainWrap.hidden = which !== 'main';
    this.unitFormDiceWrap.hidden = which !== 'dice';
    this.unitFormAtkWrap.hidden = which !== 'atk';
    this.unitHotSectionWrap.hidden = which !== 'hot';
  }

  private backFromUnitFormIfNeeded(): void {
    if (this.unitModalBackdrop.classList.contains('ce-modal-backdrop--open')) this.finishUnitForm();
  }

  private finishUnitForm(): void {
    this.closeHotspotQuickEditDiscard();
    this.unitModalBackdrop.classList.remove('ce-modal-backdrop--open');
    this.unitFormIsNew = false;
    this.unitCreatePresetLeaderId = null;
    this.selectedUnitId = null;
    this.unitPresetHintEl.textContent = '';
    this.unitPresetHintEl.hidden = true;
    this.clearEditor();
    this.refreshUnitLibraryList();
    this.refreshUnitSelectors();
    this.refreshLeaderAttachedUnits();
  }

  private resetUnitFormCardFields(): void {
    const stub = createStubCatalogUnit('_draft', 'Черновик', 0, undefined);
    this.loadCardIntoForm(stub.card);
    this.attacksContainer.innerHTML = '';
    this.attackRows = [];
    this.addAttackRow();
  }

  private openUnitFormCreate(preset?: { leaderId: string; factionId: string; domain: Domain }): void {
    this.unitFormIsNew = true;
    this.selectedUnitId = null;
    this.unitModalBackdrop.classList.add('ce-modal-backdrop--open');
    this.unitCreatePresetLeaderId = preset?.leaderId ?? null;
    this.unitIdInput.value = '';
    this.unitIdInput.disabled = false;
    this.unitNameInput.value = '';
    this.unitCloneSelect.value = '';
    this.unitStubFieldsWrap.hidden = false;
    this.clearEditor();
    this.resetUnitFormCardFields();
    if (preset) {
      const L = getLeader(preset.leaderId);
      const fac = getFaction(preset.factionId);
      this.unitPresetHintEl.textContent = `Лидер: ${L?.name ?? preset.leaderId} · Фракция: ${fac?.name ?? preset.factionId} · Домен: ${DOMAIN_LABELS[preset.domain]}`;
      this.unitPresetHintEl.hidden = false;
      this.cardDomains.value = preset.domain;
    } else {
      this.unitPresetHintEl.textContent = '';
      this.unitPresetHintEl.hidden = true;
    }
    this.unitFormTitleEl.textContent = 'Новый юнит';
    this.removeUnitBtn.hidden = true;
    this.activateUnitSubPane('main');
    this.applyDefaultHotspotLayoutPresetForNewUnit();
  }

  private openUnitCreateFromLeader(): void {
    if (!this.selectedLeaderId) {
      alert('Выберите лидера');
      return;
    }
    const L = getLeader(this.selectedLeaderId);
    if (!L) return;
    const fac = getFaction(L.factionId);
    const domain = (fac?.domain ?? 'life') as Domain;
    this.openUnitFormCreate({ leaderId: L.id, factionId: L.factionId, domain });
  }

  private attachExistingUnitToSelectedLeader(): void {
    if (!this.selectedLeaderId) {
      alert('Выберите лидера');
      return;
    }
    const unitId = this.leaderAttachExistingUnitSel.value.trim();
    if (!unitId) {
      alert('Выберите юнита в списке');
      return;
    }
    if (!getCatalogUnit(unitId)) {
      alert('Неизвестный юнит');
      return;
    }
    const leader = getLeader(this.selectedLeaderId);
    if (!leader) return;
    if (leader.catalogUnitId === unitId) {
      alert('Эта карточка уже миниатюра лидера; отдельный слот ростера не нужен');
      return;
    }
    if (leader.roster.some((s) => s.unitId === unitId)) {
      alert('Этот юнит уже в ростере');
      return;
    }
    addRosterSlot(leader.id, { unitId, maxCopies: 1 });
    this.leaderAttachExistingUnitSel.value = '';
    this.refreshLeaderAttachedUnits();
    this.refreshUnitLibraryList();
  }

  private openUnitFormEdit(unitId: string): void {
    this.unitFormIsNew = false;
    this.unitModalBackdrop.classList.add('ce-modal-backdrop--open');
    this.unitCreatePresetLeaderId = null;
    this.unitPresetHintEl.hidden = true;
    this.unitStubFieldsWrap.hidden = true;
    this.unitIdInput.value = unitId;
    this.unitIdInput.disabled = true;
    this.unitFormTitleEl.textContent = `Редактирование: ${unitId}`;
    this.removeUnitBtn.hidden = false;
    this.loadUnitIntoEditor(unitId);
    this.activateUnitSubPane('main');
  }

  private loadUnitIntoEditor(unitId: string): void {
    this.selectedUnitId = unitId;
    const def = getCatalogUnit(unitId);
    if (!def) return;
    this.unitNameInput.value = def.card.name;
    this.loadCardIntoForm(def.card, unitId);
    this.applyError.textContent = '';

    const hf = getHotspotsForUnit(unitId);
    if (hf) {
      this.hotspotRegions = hf.regions.map((r) => normalizeHotspotRegion(structuredClone(r)));
      this.hotspotImageUrl = hf.image;
      this.hotspotImageInput.value = hf.image;
      this.hotspotImg.src = hf.image;
    } else {
      this.hotspotRegions = [];
      this.hotspotImageUrl = def.card.sprite ?? '';
      this.hotspotImageInput.value = this.hotspotImageUrl;
      this.hotspotImg.src = this.hotspotImageUrl;
    }
    const o = getCatalogOverrides();
    if (o.hotspots[unitId] !== undefined && getStaticHotspotForUnit(unitId) !== undefined) {
      this.hotspotHint.textContent =
        'В localStorage есть хотспоты для этого юнита — они перекрывают файлы из репозитория (как на проде). Сбросьте оверрайды каталога, чтобы увидеть только прод-версию.';
    } else {
      this.hotspotHint.textContent = '';
    }
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
  }

  private async saveUnitForm(): Promise<void> {
    if (this.unitFormIsNew) {
      const id = this.unitIdInput.value.trim();
      if (!id) {
        alert('Укажите id юнита');
        return;
      }
      if (getCatalogUnit(id)) {
        alert('Такой id уже есть');
        return;
      }
      const name = this.unitNameInput.value.trim() || id;
      const cloneId = this.unitCloneSelect.value;
      const cloneFrom = cloneId ? getCatalogUnit(cloneId) : undefined;
      const stubDef = createStubCatalogUnit(id, name, 0, cloneFrom);
      const rawCard = this.readCardFromForm(stubDef.card);
      if (!rawCard) return;
      const cardResolved = await resolveCardImageUrlsForStorage(rawCard);
      const card = finalizeCardForUnitSave(id, cardResolved, 'newUnit');
      setNewUnit(id, { id, points: 0, card });
      this.selectedUnitId = id;
      if (this.unitCreatePresetLeaderId) {
        addRosterSlot(this.unitCreatePresetLeaderId, { unitId: id, maxCopies: 1 });
        this.unitCreatePresetLeaderId = null;
      }
      await this.saveHotspotsAsync({ softIfNoImage: true });
      this.finishUnitForm();
      return;
    }
    await this.applyUnitPatch();
    if (!this.applyError.textContent) {
      this.finishUnitForm();
    }
  }

  private refreshLeaderAttachedUnits(): void {
    if (!this.leaderAttachedUnitsEl) return;
    this.leaderAttachedUnitsEl.innerHTML = '';
    const leader = this.selectedLeaderId ? getLeader(this.selectedLeaderId) : undefined;
    if (!leader) {
      this.leaderAttachedUnitsEl.appendChild(el('div', 'catalog-editor-hint', 'Выберите лидера.'));
      return;
    }
    const lid = leader.id;
    const mini = leader.catalogUnitId;
    const seen = new Set<string>([mini]);
    const rosterUnitIds = leader.roster.map((s) => s.unitId);
    const dndState: { draggedUnitId: string | null } = { draggedUnitId: null };

    const appendRow = (unitId: string, title: string, kind: 'mini' | 'slot', slotMax: number): void => {
      const def = getCatalogUnit(unitId);
      const nm = def?.card.name ?? unitId;
      const pts = rosterSpawnPoints(lid, unitId);
      const sub = `${pts} pts · 0/${slotMax}`;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ce-catalog-points-input catalog-editor-input';
      inp.value = String(pts);
      inp.min = '0';
      inp.step = '1';
      inp.title = 'Очки для этого лидера (переопределение)';
      inp.addEventListener('blur', () => {
        commitCatalogLeaderPoints(lid, kind, unitId, inp.value);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      });
      const editBtn = createPencilEditButton(() => {
        this.openUnitFormEdit(unitId);
      });
      const actions: HTMLElement[] = [inp];
      if (kind === 'slot') {
        const maxInp = document.createElement('input');
        maxInp.type = 'number';
        maxInp.className = 'ce-catalog-maxcopies-input catalog-editor-input';
        maxInp.value = String(slotMax);
        maxInp.min = '1';
        maxInp.step = '1';
        maxInp.title = 'Максимум моделей этого юнита в армии под этим лидером';
        maxInp.addEventListener('blur', () => {
          commitCatalogLeaderMaxCopies(lid, unitId, maxInp.value);
          this.refreshLeaderAttachedUnits();
        });
        maxInp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        });
        actions.push(maxInp);
      }
      actions.push(editBtn);
      const row = buildCatalogArmyStyleRow({
        sprite: def ? unitPanelThumbSrc(def.card) : undefined,
        name: title ? `${nm} — ${title}` : nm,
        sub,
        onMainClick: () => {
          this.openUnitFormEdit(unitId);
        },
        actions,
      });
      if (kind === 'slot') {
        row.draggable = true;
        row.dataset.unitId = unitId;
        row.addEventListener('dragstart', (e) => {
          dndState.draggedUnitId = unitId;
          row.classList.add('ce-row-dragging');
          e.dataTransfer?.setData('text/plain', unitId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          dndState.draggedUnitId = null;
          row.classList.remove('ce-row-dragging');
        });
        row.addEventListener('dragover', (e) => {
          if (!dndState.draggedUnitId || dndState.draggedUnitId === unitId) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        });
        row.addEventListener('drop', (e) => {
          const movedId = dndState.draggedUnitId ?? e.dataTransfer?.getData('text/plain') ?? '';
          if (!movedId || movedId === unitId) return;
          e.preventDefault();
          const rect = row.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          const next = reorderIds(rosterUnitIds, movedId, unitId, before);
          if (next.join('|') === rosterUnitIds.join('|')) return;
          setLeaderRosterOrder(lid, next);
        });
      }
      this.leaderAttachedUnitsEl!.appendChild(row);
    };

    appendRow(mini, 'миниатюра лидера', 'mini', LEADER_MINI_MAX_COPIES);

    for (const s of leader.roster) {
      if (seen.has(s.unitId)) continue;
      seen.add(s.unitId);
      const extra =
        s.requiresUnitId != null ? ` · требует ${s.requiresUnitId}` : '';
      appendRow(s.unitId, `ростер${extra}`, 'slot', s.maxCopies);
    }
    this.leaderAttachedUnitsEl.title =
      rosterUnitIds.length > 1 ? 'Перетащите слот, чтобы изменить порядок юнитов у лидера' : '';
  }

  private buildLeaderModal(): void {
    this.modalBackdrop = el('div', 'ce-modal-backdrop');
    const modal = el('div', 'ce-modal') as HTMLDivElement;
    this.leaderModalEl = modal;
    const head = el('div', 'ce-modal__header');
    this.lmModalTitleEl = el('div', 'ce-modal__title', 'Лидер');
    const closeM = el('button', 'catalog-editor-close', '×') as HTMLButtonElement;
    closeM.type = 'button';
    closeM.addEventListener('click', () => this.closeLeaderModal());
    head.appendChild(this.lmModalTitleEl);
    head.appendChild(closeM);

    const lmTabs = el('div', 'catalog-editor-tabs ce-modal-tabs');
    this.lmTabCard = el('button', 'catalog-editor-tab catalog-editor-tab--active', 'Карточка миниатюры') as HTMLButtonElement;
    this.lmTabRoster = el('button', 'catalog-editor-tab', 'Ростер') as HTMLButtonElement;
    this.lmTabCard.type = 'button';
    this.lmTabRoster.type = 'button';
    this.lmPaneCard = el('div', 'ce-modal-pane');
    this.lmPaneRoster = el('div', 'ce-modal-pane ce-modal-pane--leader-roster');
    this.lmPaneRoster.hidden = true;
    this.lmTabCard.addEventListener('click', () => {
      this.lmTabCard.classList.add('catalog-editor-tab--active');
      this.lmTabRoster.classList.remove('catalog-editor-tab--active');
      this.lmPaneCard.hidden = false;
      this.lmPaneRoster.hidden = true;
      this.leaderModalEl.classList.remove('ce-modal--leader-roster');
    });
    this.lmTabRoster.addEventListener('click', () => {
      this.lmTabRoster.classList.add('catalog-editor-tab--active');
      this.lmTabCard.classList.remove('catalog-editor-tab--active');
      this.lmPaneRoster.hidden = false;
      this.lmPaneCard.hidden = true;
      this.leaderModalEl.classList.add('ce-modal--leader-roster');
    });
    lmTabs.appendChild(this.lmTabCard);
    lmTabs.appendChild(this.lmTabRoster);

    const lmMk = (label: string, inp: HTMLElement) => {
      const row = el('div', 'catalog-editor-field');
      row.appendChild(el('span', 'catalog-editor-field-label', label));
      row.appendChild(inp);
      this.lmPaneCard.appendChild(row);
    };
    this.lmLeaderId = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmLeaderId.type = 'text';
    this.lmLeaderId.placeholder = 'id лидера (латиница)';
    lmMk('Id лидера', this.lmLeaderId);
    this.lmLeaderName = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmLeaderName.type = 'text';
    lmMk('Имя лидера', this.lmLeaderName);
    this.lmLeaderPoints = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmLeaderPoints.type = 'number';
    this.lmLeaderPoints.placeholder = 'Очки лидера (опц.)';
    lmMk('Очки лидера', this.lmLeaderPoints);
    this.lmTemplateSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.lmTemplateSel.appendChild(new Option('Шаблон карточки (опц.)', ''));
    lmMk('Шаблон', this.lmTemplateSel);
    this.lmSize = el('select', 'catalog-editor-select') as HTMLSelectElement;
    for (const s of ['small', 'big', 'large', 'huge'] as const) {
      this.lmSize.appendChild(new Option(s, s));
    }
    lmMk('Размер', this.lmSize);
    this.lmHealth = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmHealth.type = 'number';
    this.lmHealth.value = '10';
    lmMk('Здоровье', this.lmHealth);
    this.lmMaxHealth = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmMaxHealth.type = 'number';
    this.lmMaxHealth.value = '10';
    lmMk('Макс. здоровье', this.lmMaxHealth);
    this.lmWalk = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmWalk.type = 'number';
    this.lmWalk.value = '3';
    lmMk('Шаг', this.lmWalk);
    this.lmRun = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmRun.type = 'number';
    this.lmRun.value = '5';
    lmMk('Бег', this.lmRun);
    this.lmDomains = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmDomains.placeholder = 'life, creation';
    lmMk('Домены карточки', this.lmDomains);
    this.lmSprite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmMiniatureSprite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmSprite.placeholder = '/card.png';
    this.lmMiniatureSprite.placeholder = '/token.png';
    const lmImgRow = (label: string, inp: HTMLInputElement) => {
      const row = el('div', 'catalog-editor-field ce-img-url-row');
      row.appendChild(el('span', 'catalog-editor-field-label', label));
      const wrap = el('div', 'ce-img-url-row-controls');
      wrap.appendChild(inp);
      const fileIn = el('input', 'catalog-editor-input') as HTMLInputElement;
      fileIn.type = 'file';
      fileIn.accept = 'image/*';
      fileIn.title =
        'Файл сохраняется в оверрайды как data URL. Либо укажите путь под public/, например /card.png';
      fileIn.addEventListener('change', () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        void readImageFileAsDataUrl(f)
          .then((dataUrl) => {
            inp.value = dataUrl;
          })
          .catch((e) => {
            console.error(e);
            alert('Не удалось прочитать файл изображения');
          });
      });
      wrap.appendChild(fileIn);
      row.appendChild(wrap);
      this.lmPaneCard.appendChild(row);
    };
    lmImgRow('Карточка (изображение)', this.lmSprite);
    lmImgRow('Миниатюра (токен на столе)', this.lmMiniatureSprite);
    this.lmDefW = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmDefW.type = 'number';
    lmMk('Защита белые', this.lmDefW);
    this.lmDefG = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.lmDefG.type = 'number';
    lmMk('Защита зелёные', this.lmDefG);

    this.lmRosterHint = el('div', 'catalog-editor-hint');
    this.lmRosterHint.textContent =
      'Юниты выбираются из глобальной библиотеки. «Требует юнита в армии» — id другого слота ростера (командир / приспешник).';
    this.lmPaneRoster.appendChild(this.lmRosterHint);
    this.leaderRosterListEl = el('div', 'catalog-editor-unit-list ce-modal-roster-list');
    this.lmPaneRoster.appendChild(el('label', 'ce-roster-slots-label', 'Слоты ростера'));
    this.lmPaneRoster.appendChild(this.leaderRosterListEl);
    const rosterAddRow = el('div', 'catalog-editor-row ce-modal-roster-add-row');
    this.leaderRosterUnitSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.leaderRosterMaxCopies = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.leaderRosterMaxCopies.type = 'number';
    this.leaderRosterMaxCopies.placeholder = 'Макс.';
    this.leaderRosterMaxCopies.value = '1';
    this.leaderRosterPoints = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.leaderRosterPoints.type = 'number';
    this.leaderRosterPoints.placeholder = 'Очки (опц.)';
    this.leaderRosterRequiresUnitId = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.leaderRosterRequiresUnitId.appendChild(new Option('Требует юнита (requiresUnitId)', ''));
    const addRosterBtn = el(
      'button',
      'catalog-editor-btn catalog-editor-btn-secondary',
      '+ Слот',
    ) as HTMLButtonElement;
    addRosterBtn.type = 'button';
    addRosterBtn.addEventListener('click', () => this.addRosterSlotForModalLeader());
    rosterAddRow.appendChild(this.leaderRosterUnitSel);
    rosterAddRow.appendChild(this.leaderRosterPoints);
    rosterAddRow.appendChild(this.leaderRosterMaxCopies);
    rosterAddRow.appendChild(this.leaderRosterRequiresUnitId);
    rosterAddRow.appendChild(addRosterBtn);
    this.lmPaneRoster.appendChild(rosterAddRow);

    this.leaderCatalogUnitSel = el('select', 'catalog-editor-select') as HTMLSelectElement;
    this.leaderCatalogUnitSel.style.display = 'none';
    this.leaderCatalogUnitSel.setAttribute('aria-hidden', 'true');

    const foot = el('div', 'ce-modal__footer');
    const cancelBtn = el('button', 'catalog-editor-btn catalog-editor-btn-secondary', 'Отмена') as HTMLButtonElement;
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.closeLeaderModal());
    const saveBtn = el('button', 'catalog-editor-btn', 'Сохранить') as HTMLButtonElement;
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => void this.saveLeaderModal());
    foot.appendChild(cancelBtn);
    foot.appendChild(saveBtn);

    modal.appendChild(head);
    modal.appendChild(lmTabs);
    modal.appendChild(this.lmPaneCard);
    modal.appendChild(this.lmPaneRoster);
    modal.appendChild(foot);
    this.modalBackdrop.appendChild(modal);
    document.body.appendChild(this.modalBackdrop);
  }

  private buildUnitModal(): void {
    this.unitModalBackdrop = el('div', 'ce-modal-backdrop ce-unit-modal-backdrop');
    const modal = el('div', 'ce-modal ce-modal--unit');
    modal.addEventListener('click', (e) => e.stopPropagation());
    const head = el('div', 'ce-modal__header');
    head.appendChild(this.unitFormTitleEl);
    const closeU = el('button', 'catalog-editor-close', '×') as HTMLButtonElement;
    closeU.type = 'button';
    closeU.addEventListener('click', () => this.finishUnitForm());
    head.appendChild(closeU);
    modal.appendChild(head);
    modal.appendChild(this.unitFormViewWrap);
    this.unitModalBackdrop.appendChild(modal);
    document.body.appendChild(this.unitModalBackdrop);
  }

  /**
   * Горячие клавиши хот-спотов: фаза capture на `document`, чтобы срабатывало при фокусе на канвасе
   * игры или `body`, а не только внутри модалки (bubbling до backdrop не происходит).
   */
  private onDocumentHotspotShortcutsCapture = (e: KeyboardEvent): void => {
    if (!this.unitModalBackdrop.classList.contains('ce-modal-backdrop--open')) return;
    if (this.unitHotSectionWrap.hidden) return;

    const raw = e.target;
    if (raw instanceof HTMLElement) {
      const t = raw;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (t.isContentEditable) return;
      if (
        this.hotspotQuickEditWrap.classList.contains('ce-hs-quick-edit--open') &&
        this.hotspotQuickEditWrap.contains(t)
      ) {
        return;
      }
      if (
        this.hotspotPresetSaveBackdrop.classList.contains('ce-modal-backdrop--open') &&
        this.hotspotPresetSaveBackdrop.contains(t)
      ) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (t.closest('button, a, [role="button"]')) return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (this.selectedRegionIndex === null) return;
      e.preventDefault();
      e.stopPropagation();
      this.copyHotspot();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      e.stopPropagation();
      this.pasteHotspot();
      return;
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (this.selectedRegionIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    this.deleteSelectedHotspot();
  };

  private buildHotspotPresetSaveDialog(): void {
    this.hotspotPresetSaveBackdrop = el('div', 'ce-modal-backdrop ce-hotspot-preset-save-backdrop');
    this.hotspotPresetSaveBackdrop.addEventListener('click', (e) => {
      if (e.target === this.hotspotPresetSaveBackdrop) this.closeHotspotPresetSaveDialog();
    });
    const modal = el('div', 'ce-modal ce-modal--preset-save');
    modal.addEventListener('click', (e) => e.stopPropagation());
    const head = el('div', 'ce-modal__header');
    head.appendChild(el('div', 'ce-modal__title', 'Сохранить пресет раскладки'));
    const closeBtn = el('button', 'catalog-editor-close', '×') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.closeHotspotPresetSaveDialog());
    head.appendChild(closeBtn);
    const body = el('div', 'ce-modal-pane ce-hotspot-preset-save-body');
    const nameLab = el('label', 'ce-hotspot-preset-save-label');
    nameLab.appendChild(document.createTextNode('Имя пресета'));
    this.hotspotPresetNameInput = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hotspotPresetNameInput.type = 'text';
    this.hotspotPresetNameInput.autocomplete = 'off';
    this.hotspotPresetNameInput.placeholder = 'Например, присед';
    nameLab.appendChild(this.hotspotPresetNameInput);
    this.hotspotPresetDefaultCb = el('input', '') as HTMLInputElement;
    this.hotspotPresetDefaultCb.type = 'checkbox';
    const cbRow = el('label', 'ce-hotspot-preset-save-label ce-hotspot-preset-save-cb');
    cbRow.appendChild(this.hotspotPresetDefaultCb);
    cbRow.appendChild(
      document.createTextNode(' Поставить пресет по умолчанию для новых юнитов'),
    );
    const foot = el('div', 'ce-modal__footer');
    const cancelBtn = el(
      'button',
      'catalog-editor-btn catalog-editor-btn-secondary',
      'Отмена',
    ) as HTMLButtonElement;
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.closeHotspotPresetSaveDialog());
    const okBtn = el('button', 'catalog-editor-btn', 'Сохранить') as HTMLButtonElement;
    okBtn.type = 'button';
    okBtn.addEventListener('click', () => this.confirmHotspotPresetSave());
    foot.appendChild(cancelBtn);
    foot.appendChild(okBtn);
    this.hotspotPresetNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmHotspotPresetSave();
      }
    });
    modal.appendChild(head);
    modal.appendChild(body);
    body.appendChild(nameLab);
    body.appendChild(cbRow);
    modal.appendChild(foot);
    this.hotspotPresetSaveBackdrop.appendChild(modal);
    document.body.appendChild(this.hotspotPresetSaveBackdrop);
  }

  private hotspotQuickEditOutsideBound = (e: PointerEvent): void => {
    if (!this.hotspotQuickEditWrap.classList.contains('ce-hs-quick-edit--open')) return;
    if (this.hotspotQuickEditWrap.contains(e.target as Node)) return;
    this.closeHotspotQuickEditDiscard();
  };

  private buildHotspotQuickEdit(): void {
    this.hotspotQuickEditWrap = el('div', 'ce-hs-quick-edit');
    this.hotspotQuickEditWrap.style.display = 'none';
    this.hotspotQuickEditWrap.setAttribute('role', 'dialog');
    this.hotspotQuickEditWrap.setAttribute('aria-label', 'Параметры зоны');
    const inner = el('div', 'ce-hs-quick-edit-inner');
    inner.appendChild(el('div', 'ce-hs-quick-edit-title', 'Параметры зоны'));

    const mkDiceChip = (inp: HTMLInputElement, bg: string, border?: string) => {
      const lab = el('label', 'ce-hs-dice-chip');
      const sw = el('span', 'ce-hs-dice-swatch');
      sw.style.background = bg;
      if (border) sw.style.boxShadow = `inset 0 0 0 1px ${border}`;
      lab.appendChild(sw);
      inp.classList.add('ce-hs-dice-num');
      inp.min = '0';
      inp.step = '1';
      lab.appendChild(inp);
      return lab;
    };

    const rangeLabRow = el('div', 'ce-hs-quick-edit-row');
    rangeLabRow.appendChild(el('span', 'ce-hs-quick-edit-lab', 'Дальность'));
    const rangeRow = el('div', 'ce-hs-quick-edit-range-row');
    this.hsQeRange = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeRange.type = 'number';
    this.hsQeRange.min = '0';
    this.hsQeRange.step = '1';
    this.hsQeRangeUnit = el('select', 'catalog-editor-select ce-hs-range-unit') as HTMLSelectElement;
    this.hsQeRangeUnit.appendChild(new Option('гекс', 'hex'));
    this.hsQeRangeUnit.appendChild(new Option('гексон', 'hexon'));
    rangeRow.appendChild(this.hsQeRange);
    rangeRow.appendChild(this.hsQeRangeUnit);
    rangeLabRow.appendChild(rangeRow);
    inner.appendChild(rangeLabRow);

    const dmgRow = el('div', 'ce-hs-quick-edit-row');
    dmgRow.appendChild(el('span', 'ce-hs-quick-edit-lab', 'Урон'));
    this.hsQeDamage = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeDamage.type = 'number';
    dmgRow.appendChild(this.hsQeDamage);
    inner.appendChild(dmgRow);

    const diceRow = el('div', 'ce-hs-quick-edit-row ce-hs-quick-edit-row--dice');
    diceRow.appendChild(el('span', 'ce-hs-quick-edit-lab', 'Кубики'));
    const diceIn = el('div', 'ce-hs-dice-inputs');
    this.hsQeRed = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeRed.type = 'number';
    this.hsQeBlack = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeBlack.type = 'number';
    this.hsQeGreen = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeGreen.type = 'number';
    this.hsQeWhite = el('input', 'catalog-editor-input') as HTMLInputElement;
    this.hsQeWhite.type = 'number';
    diceIn.appendChild(mkDiceChip(this.hsQeRed, '#d14b4b'));
    diceIn.appendChild(mkDiceChip(this.hsQeBlack, '#1a1a22', 'rgba(255,255,255,0.2)'));
    diceIn.appendChild(mkDiceChip(this.hsQeGreen, '#46b969'));
    diceIn.appendChild(mkDiceChip(this.hsQeWhite, '#e8eaef', 'rgba(0,0,0,0.22)'));
    diceRow.appendChild(diceIn);
    inner.appendChild(diceRow);

    const ok = el('button', 'catalog-editor-btn ce-hs-quick-edit-ok', 'Готово') as HTMLButtonElement;
    ok.type = 'button';
    ok.addEventListener('click', () => this.commitHotspotQuickEdit());
    inner.appendChild(ok);

    this.hotspotQuickEditWrap.appendChild(inner);
    document.body.appendChild(this.hotspotQuickEditWrap);

    const qeLive = () => this.applyHotspotQuickEditToRegion();
    for (const inp of [
      this.hsQeRange,
      this.hsQeDamage,
      this.hsQeRed,
      this.hsQeBlack,
      this.hsQeGreen,
      this.hsQeWhite,
    ]) {
      inp.addEventListener('input', qeLive);
      inp.addEventListener('change', qeLive);
    }
    this.hsQeRangeUnit.addEventListener('change', qeLive);

    ok.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitHotspotQuickEdit();
      }
    });
  }

  /** Записывает поля поп-апа в выбранную зону и синхронизирует боковую панель (вызывается при каждом вводе). */
  private applyHotspotQuickEditToRegion(): void {
    if (!this.hotspotQuickEditWrap.classList.contains('ce-hs-quick-edit--open')) return;
    if (this.selectedRegionIndex === null) return;
    const r = this.hotspotRegions[this.selectedRegionIndex];
    if (!r) return;
    r.range = numOrU(this.hsQeRange.value);
    r.rangeUnit = this.hsQeRangeUnit.value === 'hexon' ? 'hexon' : 'hex';
    r.damage = numOrU(this.hsQeDamage.value);
    r.red = numOrU(this.hsQeRed.value);
    r.black = numOrU(this.hsQeBlack.value);
    r.green = numOrU(this.hsQeGreen.value);
    r.white = numOrU(this.hsQeWhite.value);
    this.syncHotspotFieldsFromRegion();
  }

  private loadHotspotQuickEditFromRegion(): void {
    const r =
      this.selectedRegionIndex !== null ? this.hotspotRegions[this.selectedRegionIndex] : undefined;
    if (!r) return;
    this.hsQeRange.value = r.range != null ? String(r.range) : '';
    this.hsQeRangeUnit.value = r.rangeUnit === 'hexon' ? 'hexon' : 'hex';
    this.hsQeDamage.value = r.damage != null ? String(r.damage) : '';
    this.hsQeRed.value = r.red != null ? String(r.red) : '';
    this.hsQeBlack.value = r.black != null ? String(r.black) : '';
    this.hsQeGreen.value = r.green != null ? String(r.green) : '';
    this.hsQeWhite.value = r.white != null ? String(r.white) : '';
  }

  private openHotspotQuickEdit(clientX: number, clientY: number): void {
    if (this.selectedRegionIndex === null) return;
    this.loadHotspotQuickEditFromRegion();
    this.hotspotQuickEditWrap.classList.add('ce-hs-quick-edit--open');
    this.hotspotQuickEditWrap.style.display = 'block';
    const pad = 8;
    let left = clientX + pad;
    let top = clientY + pad;
    this.hotspotQuickEditWrap.style.left = `${left}px`;
    this.hotspotQuickEditWrap.style.top = `${top}px`;
    document.addEventListener('pointerdown', this.hotspotQuickEditOutsideBound, true);
    requestAnimationFrame(() => {
      const rect = this.hotspotQuickEditWrap.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rect.right > vw) left = Math.max(pad, vw - rect.width - pad);
      if (rect.bottom > vh) top = Math.max(pad, vh - rect.height - pad);
      if (rect.left < 0) left = pad;
      if (rect.top < 0) top = pad;
      this.hotspotQuickEditWrap.style.left = `${left}px`;
      this.hotspotQuickEditWrap.style.top = `${top}px`;
    });
    queueMicrotask(() => this.hsQeRange.focus());
  }

  private commitHotspotQuickEdit(): void {
    this.applyHotspotQuickEditToRegion();
    this.closeHotspotQuickEditDiscard();
  }

  private closeHotspotQuickEditDiscard(): void {
    document.removeEventListener('pointerdown', this.hotspotQuickEditOutsideBound, true);
    this.hotspotQuickEditWrap.classList.remove('ce-hs-quick-edit--open');
    this.hotspotQuickEditWrap.style.display = 'none';
  }

  private openHotspotPresetSaveDialog(): void {
    this.hotspotPresetNameInput.value = '';
    this.hotspotPresetDefaultCb.checked = false;
    this.hotspotPresetSaveBackdrop.classList.add('ce-modal-backdrop--open');
    queueMicrotask(() => this.hotspotPresetNameInput.focus());
  }

  private closeHotspotPresetSaveDialog(): void {
    this.hotspotPresetSaveBackdrop.classList.remove('ce-modal-backdrop--open');
  }

  private confirmHotspotPresetSave(): void {
    if (this.hotspotRegions.length === 0) {
      alert('Нет зон — нечего сохранять в пресет.');
      return;
    }
    const trimmed = this.hotspotPresetNameInput.value.trim();
    if (!trimmed) {
      alert('Введите имя пресета');
      return;
    }
    const existing = getCatalogOverrides().hotspotLayoutPresets?.find((p) => p.name === trimmed);
    if (existing) {
      if (!confirm(`Пресет «${trimmed}» уже есть. Перезаписать раскладку?`)) return;
    }
    this.applyHotspotFieldsToSelected();
    const regions = this.hotspotRegions.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    const preset = upsertHotspotLayoutPreset(trimmed, regions);
    if (this.hotspotPresetDefaultCb.checked) {
      setDefaultHotspotLayoutPresetId(preset.id);
    }
    this.refreshHotspotPresetSelect();
    this.hsPresetSelect.value = preset.id;
    this.closeHotspotPresetSaveDialog();
    this.hotspotHint.textContent = 'Пресет раскладки сохранён (в JSON оверрайдов и localStorage).';
  }

  private setupModalEscapeHandler(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.hotspotQuickEditWrap.classList.contains('ce-hs-quick-edit--open')) {
        e.preventDefault();
        this.closeHotspotQuickEditDiscard();
        return;
      }
      if (this.hotspotPresetSaveBackdrop.classList.contains('ce-modal-backdrop--open')) {
        e.preventDefault();
        this.closeHotspotPresetSaveDialog();
        return;
      }
      if (this.unitModalBackdrop.classList.contains('ce-modal-backdrop--open')) {
        return;
      }
      if (this.modalBackdrop.classList.contains('ce-modal-backdrop--open')) {
        this.closeLeaderModal();
      }
    });
  }

  private addAttackRow(atk?: AttackAbility): void {
    const wrap = el('div', 'ce-attack-row');
    const name = el('input', 'catalog-editor-input') as HTMLInputElement;
    name.type = 'text';
    name.placeholder = 'Название';
    const range = el('input', 'catalog-editor-input') as HTMLInputElement;
    range.type = 'number';
    range.placeholder = 'Дальн.';
    const melee = el('input', '') as HTMLInputElement;
    melee.type = 'checkbox';
    melee.title = 'Ближний бой';
    const dmgType = el('select', 'catalog-editor-select') as HTMLSelectElement;
    for (const dt of DAMAGE_TYPES) dmgType.appendChild(new Option(dt, dt));
    const damage = el('input', 'catalog-editor-input') as HTMLInputElement;
    damage.type = 'number';
    const red = el('input', 'catalog-editor-input') as HTMLInputElement;
    red.type = 'number';
    const black = el('input', 'catalog-editor-input') as HTMLInputElement;
    black.type = 'number';
    const green = el('input', 'catalog-editor-input') as HTMLInputElement;
    green.type = 'number';
    const white = el('input', 'catalog-editor-input') as HTMLInputElement;
    white.type = 'number';
    const rm = el('button', 'catalog-editor-btn catalog-editor-btn-danger', '×');
    rm.type = 'button';
    rm.title = 'Удалить атаку';
    const refs: AttackRowRefs = {
      wrap,
      name,
      range,
      melee,
      dmgType,
      damage,
      red,
      black,
      green,
      white,
    };
    rm.addEventListener('click', () => {
      wrap.remove();
      this.attackRows = this.attackRows.filter((x) => x !== refs);
    });
    wrap.appendChild(name);
    wrap.appendChild(range);
    wrap.appendChild(el('span', 'ce-atk-melee-lab', 'Ближ.'));
    wrap.appendChild(melee);
    wrap.appendChild(dmgType);
    wrap.appendChild(damage);
    wrap.appendChild(el('span', 'ce-atk-dice-lab', 'Кубы R/B/G/W'));
    wrap.appendChild(red);
    wrap.appendChild(black);
    wrap.appendChild(green);
    wrap.appendChild(white);
    wrap.appendChild(rm);
    if (atk) {
      name.value = atk.name;
      range.value = String(atk.range);
      melee.checked = atk.attackRange === 'melee';
      dmgType.value = atk.damageType;
      damage.value = String(atk.damage);
      red.value = atk.dice.red != null ? String(atk.dice.red) : '';
      black.value = atk.dice.black != null ? String(atk.dice.black) : '';
      green.value = atk.dice.green != null ? String(atk.dice.green) : '';
      white.value = atk.dice.white != null ? String(atk.dice.white) : '';
    }
    this.attacksContainer.appendChild(wrap);
    this.attackRows.push(refs);
  }

  private loadCardIntoForm(card: UnitCardData, unitId?: string): void {
    this.cardName.value = card.name;
    this.cardSize.value = card.size;
    this.cardHealth.value = String(card.health);
    this.cardMaxHealth.value = String(card.maxHealth);
    this.cardWalk.value = String(card.walk);
    this.cardRun.value = String(card.run);
    this.cardMoveUnit.value = card.movementDistanceUnit ?? '';
    this.cardDefW.value = card.defense.white != null ? String(card.defense.white) : '';
    this.cardDefG.value = card.defense.green != null ? String(card.defense.green) : '';
    this.cardDomains.value = card.domains.join(', ');
    this.cardKeywords.value = (card.keywords ?? []).join(', ');
    const spriteFallback =
      unitId && !card.sprite?.trim() ? getHotspotsForUnit(unitId)?.image?.trim() : '';
    this.cardSprite.value = card.sprite?.trim() || spriteFallback || '';
    this.cardMiniatureSprite.value = card.miniatureSprite ?? '';
    const conc = card.concentration ?? {};
    this.cardConcR.value = conc.red != null ? String(conc.red) : '';
    this.cardConcG.value = conc.green != null ? String(conc.green) : '';
    this.cardConcB.value = conc.black != null ? String(conc.black) : '';
    this.cardConcW.value = conc.white != null ? String(conc.white) : '';
    const dr = card.defenseReaction ?? {};
    this.cardReactW.value = dr.white != null ? String(dr.white) : '';
    this.cardReactG.value = dr.green != null ? String(dr.green) : '';
    const ex = card.exploration ?? {};
    this.cardExpR.value = ex.red != null ? String(ex.red) : '';
    this.cardExpG.value = ex.green != null ? String(ex.green) : '';
    this.cardExpB.value = ex.black != null ? String(ex.black) : '';
    this.cardExpW.value = ex.white != null ? String(ex.white) : '';
    this.cardExplorationRange.value =
      card.explorationRange != null ? String(card.explorationRange) : '';
    this.cardGrabRange.value = card.grabRange != null ? String(card.grabRange) : '';
    this.cardGrabRangeUnit.value = card.grabRangeUnit === 'hexon' ? 'hexon' : card.grabRangeUnit === 'hex' ? 'hex' : '';
    this.attacksContainer.innerHTML = '';
    this.attackRows = [];
    for (const a of card.attacks) {
      this.addAttackRow(a);
    }
    if (card.attacks.length === 0) this.addAttackRow();
  }

  private readCardFromForm(base: UnitCardData): UnitCardData | null {
    const name = this.cardName.value.trim();
    if (!name) {
      this.applyError.textContent = 'Укажите имя';
      return null;
    }
    const domains: Domain[] = [];
    for (const part of this.cardDomains.value.split(/[,\s]+/).filter(Boolean)) {
      const p = part.trim() as Domain;
      if (DOMAIN_IDS.includes(p)) domains.push(p);
    }
    if (domains.length === 0) domains.push('life');

    const attacks: AttackAbility[] = [];
    for (const row of this.attackRows) {
      const an = row.name.value.trim();
      if (!an) continue;
      const dice: AttackAbility['dice'] = {};
      const rv = numOrU(row.red.value);
      const bv = numOrU(row.black.value);
      const gv = numOrU(row.green.value);
      const wv = numOrU(row.white.value);
      if (rv != null) dice.red = rv;
      if (bv != null) dice.black = bv;
      if (gv != null) dice.green = gv;
      if (wv != null) dice.white = wv;
      attacks.push({
        name: an,
        range: numOr0(row.range.value),
        attackRange: row.melee.checked ? 'melee' : 'ranged',
        damageType: (row.dmgType.value || 'physical') as DamageType,
        damage: numOr0(row.damage.value),
        dice,
      });
    }

    const mu = this.cardMoveUnit.value;
    const gru = this.cardGrabRangeUnit.value;
    const exploration = {
      red: numOrU(this.cardExpR.value),
      green: numOrU(this.cardExpG.value),
      black: numOrU(this.cardExpB.value),
      white: numOrU(this.cardExpW.value),
    };
    const card: UnitCardData = {
      ...base,
      name,
      size: this.cardSize.value as UnitCardData['size'],
      health: numOr0(this.cardHealth.value),
      maxHealth: numOr0(this.cardMaxHealth.value),
      walk: numOr0(this.cardWalk.value),
      run: numOr0(this.cardRun.value),
      movementDistanceUnit: mu === 'hex' || mu === 'hexon' ? mu : undefined,
      defense: {
        white: numOrU(this.cardDefW.value),
        green: numOrU(this.cardDefG.value),
      },
      domains,
      concentration: {
        red: numOrU(this.cardConcR.value),
        green: numOrU(this.cardConcG.value),
        black: numOrU(this.cardConcB.value),
        white: numOrU(this.cardConcW.value),
      },
      defenseReaction: {
        white: numOrU(this.cardReactW.value),
        green: numOrU(this.cardReactG.value),
      },
      explorationRange: numOrU(this.cardExplorationRange.value),
      grabRange: numOrU(this.cardGrabRange.value),
      grabRangeUnit: gru === 'hex' || gru === 'hexon' ? gru : undefined,
      attacks,
      keywords: this.cardKeywords.value
        .split(/[,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      sprite: this.cardSprite.value.trim() || undefined,
      miniatureSprite: this.cardMiniatureSprite.value.trim() || undefined,
      ...(dicePoolEmpty(exploration) ? {} : { exploration }),
    };
    return card;
  }

  private refreshLeaderSelect(): void {
    const leadSel = this.body.querySelector('#ce-leader-select') as HTMLSelectElement | null;
    if (!leadSel) return;
    const leaders = leadersForFaction(this.selectedFactionId);
    leadSel.innerHTML = '';
    for (const l of leaders) {
      leadSel.appendChild(new Option(l.name, l.id));
    }
    const hasSelected = leaders.some((l) => l.id === this.selectedLeaderId);
    if (!hasSelected) {
      this.selectedLeaderId = leaders[0]?.id ?? '';
    }
    leadSel.value = this.selectedLeaderId;
    this.leaderDeleteBtn.disabled = !this.selectedLeaderId;
    leadSel.onchange = () => {
      this.selectedLeaderId = leadSel.value;
      this.selectedUnitId = null;
      this.updateBreadcrumbs();
      this.refreshUnitLibraryList();
      this.refreshLeaderAttachedUnits();
      this.clearEditor();
    };
    this.updateBreadcrumbs();
    this.refreshLeaderAttachedUnits();
  }

  private refreshUnitLibraryList(): void {
    if (!this.unitListEl) return;
    this.unitListEl.innerHTML = '';
    const q = (this.unitSearchInput?.value ?? '').trim().toLowerCase();
    const facId = this.unitFactionFilterSel?.value ?? '';
    const allowed = facId ? unitIdsForFaction(facId) : null;
    const visibleIds: string[] = [];
    const dndState: { draggedUnitId: string | null } = { draggedUnitId: null };
    for (const id of listAllUnitIds()) {
      if (allowed && !allowed.has(id)) continue;
      const def = getCatalogUnit(id);
      const name = def?.card.name ?? id;
      const hay = `${id} ${name}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const isNew = listNewUnitIds().includes(id);
      const lid = this.selectedLeaderId;
      const L = lid ? getLeader(lid) : undefined;
      const onLeader = L && (L.catalogUnitId === id || L.roster.some((s) => s.unitId === id));
      const sub = onLeader
        ? `${rosterSpawnPoints(lid!, id)} pts · у выбранного лидера`
        : 'очки задаются у лидера (мини / ростер)';
      const displayName = `${name}${isNew ? ' (новый)' : ''}`;
      const editBtn = createPencilEditButton(() => this.openUnitFormEdit(id));
      const row = buildCatalogArmyStyleRow({
        sprite: def ? unitPanelThumbSrc(def.card) : undefined,
        name: displayName,
        sub,
        onMainClick: () => this.openUnitFormEdit(id),
        actions: [editBtn],
      });
      row.dataset.unitId = id;
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        dndState.draggedUnitId = id;
        row.classList.add('ce-row-dragging');
        e.dataTransfer?.setData('text/plain', id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        dndState.draggedUnitId = null;
        row.classList.remove('ce-row-dragging');
      });
      row.addEventListener('dragover', (e) => {
        if (!dndState.draggedUnitId || dndState.draggedUnitId === id) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', (e) => {
        const movedId = dndState.draggedUnitId ?? e.dataTransfer?.getData('text/plain') ?? '';
        if (!movedId || movedId === id) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        const nextOrder = reorderIds(listAllUnitIds(), movedId, id, before);
        if (nextOrder.join('|') === listAllUnitIds().join('|')) return;
        setUnitLibraryOrder(nextOrder);
      });
      this.unitListEl.appendChild(row);
      visibleIds.push(id);
    }
    this.unitListEl.title = visibleIds.length > 1 ? 'Перетащите юнита, чтобы изменить порядок в библиотеке' : '';
  }

  private refreshUnitSelectors(): void {
    const unitIds = listAllUnitIds();
    const refill = (sel: HTMLSelectElement, placeholder: string | null = null) => {
      const prev = sel.value;
      sel.innerHTML = '';
      if (placeholder !== null) {
        sel.appendChild(new Option(placeholder, ''));
      }
      for (const id of unitIds) {
        sel.appendChild(new Option(id, id));
      }
      sel.value = unitIds.includes(prev) ? prev : '';
    };
    refill(this.unitCloneSelect, '— без клона —');
    refill(this.leaderCatalogUnitSel, 'Шаблон карточки (опц.)');
    refill(this.leaderRosterUnitSel);
    refill(this.leaderAttachExistingUnitSel, 'Юнит из библиотеки…');
    this.refreshRequiresUnitSelect();
  }

  private refreshRequiresUnitSelect(): void {
    if (!this.leaderRosterRequiresUnitId) return;
    const prev = this.leaderRosterRequiresUnitId.value;
    let options: string[] = [];
    if (this.leaderModalOpen && this.leaderModalIsNew && !this.leaderModalLeaderId) {
      options = this.leaderModalPendingRoster.map((s) => s.unitId);
    } else {
      const lid = this.leaderModalLeaderId ?? this.selectedLeaderId;
      const leader = lid ? getLeader(lid) : undefined;
      options = leader?.roster.map((s) => s.unitId) ?? [];
    }
    this.leaderRosterRequiresUnitId.innerHTML = '';
    this.leaderRosterRequiresUnitId.appendChild(new Option('Требует юнита (requiresUnitId)', ''));
    for (const id of options) {
      this.leaderRosterRequiresUnitId.appendChild(new Option(`${id} (в ростере)`, id));
    }
    this.leaderRosterRequiresUnitId.value = options.includes(prev) ? prev : '';
  }

  private refreshLeaderRosterEditor(): void {
    if (!this.leaderRosterListEl) return;
    this.leaderRosterListEl.innerHTML = '';
    if (this.leaderModalOpen && this.leaderModalIsNew && !this.leaderModalLeaderId) {
      if (this.leaderModalPendingRoster.length === 0) {
        this.leaderRosterListEl.appendChild(
          el('div', 'catalog-editor-hint', 'Сохраните карточку лидера, затем добавляйте слоты — или добавьте слоты здесь до сохранения.'),
        );
      }
      for (const slot of this.leaderModalPendingRoster) {
        const def = getCatalogUnit(slot.unitId);
        const nm = def?.card.name ?? slot.unitId;
        const basePts = 0;
        const pts = slot.points ?? basePts;
        const extra = slot.requiresUnitId != null ? ` · требует ${slot.requiresUnitId}` : '';
        const sub = `${pts} pts · 0/${slot.maxCopies}${extra}`;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'ce-catalog-points-input catalog-editor-input';
        inp.value = String(pts);
        inp.min = '0';
        inp.step = '1';
        inp.title = 'Очки для этого слота у лидера';
        inp.addEventListener('blur', () => {
          const v = numOrU(inp.value);
          const idx = this.leaderModalPendingRoster.findIndex((s) => s.unitId === slot.unitId);
          if (idx < 0) return;
          const next = { ...this.leaderModalPendingRoster[idx] };
          if (v === undefined || v === basePts) delete next.points;
          else next.points = v;
          this.leaderModalPendingRoster[idx] = next;
          this.refreshLeaderRosterEditor();
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        });
        const maxInp = document.createElement('input');
        maxInp.type = 'number';
        maxInp.className = 'ce-catalog-maxcopies-input catalog-editor-input';
        maxInp.value = String(slot.maxCopies);
        maxInp.min = '1';
        maxInp.step = '1';
        maxInp.title = 'Максимум моделей этого юнита в армии под этим лидером';
        maxInp.addEventListener('blur', () => {
          const v = numOrU(maxInp.value);
          const idx = this.leaderModalPendingRoster.findIndex((s) => s.unitId === slot.unitId);
          if (idx < 0) return;
          const next = { ...this.leaderModalPendingRoster[idx] };
          const mc = v === undefined || v < 1 ? 1 : Math.floor(v);
          next.maxCopies = Math.max(1, mc);
          this.leaderModalPendingRoster[idx] = next;
          this.refreshLeaderRosterEditor();
        });
        maxInp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        });
        const editBtn = createPencilEditButton(() => {
          this.openUnitFormEdit(slot.unitId);
        });
        const rm = el('button', 'catalog-editor-icon-btn', '×') as HTMLButtonElement;
        rm.type = 'button';
        rm.title = `Удалить слот ${slot.unitId}`;
        rm.setAttribute('aria-label', `Удалить слот ${slot.unitId}`);
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          this.leaderModalPendingRoster = this.leaderModalPendingRoster.filter((s) => s.unitId !== slot.unitId);
          this.refreshLeaderRosterEditor();
          this.refreshRequiresUnitSelect();
        });
        const row = buildCatalogArmyStyleRow({
          sprite: def ? unitPanelThumbSrc(def.card) : undefined,
          name: `${nm} — ростер`,
          sub,
          onMainClick: () => {
            this.openUnitFormEdit(slot.unitId);
          },
          actions: [inp, maxInp, editBtn, rm],
        });
        this.leaderRosterListEl.appendChild(row);
      }
      this.refreshRequiresUnitSelect();
      return;
    }
    const lid = this.leaderModalLeaderId ?? this.selectedLeaderId;
    const leader = lid ? getLeader(lid) : undefined;
    if (!leader) {
      this.leaderRosterListEl.appendChild(el('div', 'catalog-editor-hint', 'Лидер не выбран.'));
      this.refreshRequiresUnitSelect();
      return;
    }
    const o = getCatalogOverrides();
    const isCustomLeader = o.newLeaders[leader.id] != null;
    const addedForLeader = new Set((o.rosterAdditions[leader.id] ?? []).map((s) => s.unitId));
    for (const slot of leader.roster) {
      const def = getCatalogUnit(slot.unitId);
      const nm = def?.card.name ?? slot.unitId;
      const pts = rosterSpawnPoints(leader.id, slot.unitId);
      const extra = slot.requiresUnitId != null ? ` · требует ${slot.requiresUnitId}` : '';
      const sub = `${pts} pts · 0/${slot.maxCopies}${extra}`;
      const removable = isCustomLeader || addedForLeader.has(slot.unitId);
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ce-catalog-points-input catalog-editor-input';
      inp.value = String(pts);
      inp.min = '0';
      inp.step = '1';
      inp.title = 'Очки для этого лидера (переопределение)';
      inp.disabled = false;
      inp.addEventListener('blur', () => {
        commitCatalogLeaderPoints(leader.id, 'slot', slot.unitId, inp.value);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      });
      const maxInp = document.createElement('input');
      maxInp.type = 'number';
      maxInp.className = 'ce-catalog-maxcopies-input catalog-editor-input';
      maxInp.value = String(slot.maxCopies);
      maxInp.min = '1';
      maxInp.step = '1';
      maxInp.title = 'Максимум моделей этого юнита в армии под этим лидером';
      maxInp.addEventListener('blur', () => {
        commitCatalogLeaderMaxCopies(leader.id, slot.unitId, maxInp.value);
        this.refreshLeaderRosterEditor();
      });
      maxInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      });
      const editBtn = createPencilEditButton(() => {
        this.openUnitFormEdit(slot.unitId);
      });
      const actions: HTMLElement[] = [inp, maxInp, editBtn];
      if (removable) {
        const rm = el('button', 'catalog-editor-icon-btn', '×') as HTMLButtonElement;
        rm.type = 'button';
        rm.title = `Удалить слот ${slot.unitId}`;
        rm.setAttribute('aria-label', `Удалить слот ${slot.unitId}`);
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          removeRosterAddition(leader.id, slot.unitId);
          this.refreshLeaderRosterEditor();
          this.refreshUnitLibraryList();
        });
        actions.push(rm);
      }
      const row = buildCatalogArmyStyleRow({
        sprite: def ? unitPanelThumbSrc(def.card) : undefined,
        name: `${nm} — ростер${removable ? '' : ' · базовый слот'}`,
        sub,
        onMainClick: () => {
          this.openUnitFormEdit(slot.unitId);
        },
        actions,
      });
      this.leaderRosterListEl.appendChild(row);
    }
    this.refreshRequiresUnitSelect();
  }

  private addRosterSlotForModalLeader(): void {
    const unitId = this.leaderRosterUnitSel.value.trim();
    if (!unitId) {
      alert('Выберите юнита');
      return;
    }
    const slot: RosterSlotDef = {
      unitId,
      maxCopies: Math.max(1, numOr0(this.leaderRosterMaxCopies.value)),
      ...(numOrU(this.leaderRosterPoints.value) != null ? { points: numOrU(this.leaderRosterPoints.value) } : {}),
      ...(this.leaderRosterRequiresUnitId.value ? { requiresUnitId: this.leaderRosterRequiresUnitId.value } : {}),
    };
    if (this.leaderModalIsNew && !this.leaderModalLeaderId) {
      if (this.leaderModalPendingRoster.some((s) => s.unitId === unitId)) {
        alert('Этот юнит уже в ростере');
        return;
      }
      if (slot.requiresUnitId && !this.leaderModalPendingRoster.some((s) => s.unitId === slot.requiresUnitId)) {
        alert('Сначала добавьте в ростер юнита, от которого зависит этот слот');
        return;
      }
      this.leaderModalPendingRoster.push(slot);
      this.refreshLeaderRosterEditor();
      return;
    }
    const lid = this.leaderModalLeaderId ?? this.selectedLeaderId;
    if (!lid) {
      alert('Нет id лидера');
      return;
    }
    if (slot.requiresUnitId) {
      const leader = getLeader(lid);
      const ids = leader?.roster.map((s) => s.unitId) ?? [];
      if (!ids.includes(slot.requiresUnitId)) {
        alert('Сначала добавьте в ростер юнита, от которого зависит этот слот');
        return;
      }
    }
    addRosterSlot(lid, slot);
    this.refreshLeaderRosterEditor();
  }

  private readLeaderMiniCardFromModal(template?: CatalogUnitDef): UnitCardData | null {
    const domains = this.lmDomains.value
      .split(/[,\s]+/)
      .map((s) => s.trim() as Domain)
      .filter((d) => DOMAIN_IDS.includes(d));
    const name = this.lmLeaderName.value.trim() || this.lmLeaderId.value.trim();
    if (!name) return null;
    if (template) {
      return {
        ...structuredClone(template.card),
        name,
        size: this.lmSize.value as UnitCardData['size'],
        health: numOr0(this.lmHealth.value),
        maxHealth: numOr0(this.lmMaxHealth.value),
        walk: numOr0(this.lmWalk.value),
        run: numOr0(this.lmRun.value),
        defense: {
          white: numOrU(this.lmDefW.value),
          green: numOrU(this.lmDefG.value),
        },
        domains: domains.length > 0 ? domains : ['life'],
        sprite: this.lmSprite.value.trim() || undefined,
        miniatureSprite: this.lmMiniatureSprite.value.trim() || undefined,
      };
    }
    return {
      name,
      size: this.lmSize.value as UnitCardData['size'],
      health: numOr0(this.lmHealth.value),
      maxHealth: numOr0(this.lmMaxHealth.value),
      defense: { white: numOrU(this.lmDefW.value), green: numOrU(this.lmDefG.value) },
      walk: numOr0(this.lmWalk.value),
      run: numOr0(this.lmRun.value),
      domains: domains.length > 0 ? domains : ['life'],
      concentration: {},
      defenseReaction: {},
      attacks: [],
      keywords: [],
      sprite: this.lmSprite.value.trim() || undefined,
      miniatureSprite: this.lmMiniatureSprite.value.trim() || undefined,
    };
  }

  private openLeaderModal(mode: 'new' | 'edit', leaderId?: string): void {
    this.leaderModalIsNew = mode === 'new';
    this.leaderModalLeaderId = mode === 'edit' ? leaderId ?? null : null;
    this.leaderModalPendingRoster = [];
    this.leaderModalOpen = true;
    this.lmTabCard.classList.add('catalog-editor-tab--active');
    this.lmTabRoster.classList.remove('catalog-editor-tab--active');
    this.lmPaneCard.hidden = false;
    this.lmPaneRoster.hidden = true;
    this.leaderModalEl.classList.remove('ce-modal--leader-roster');
    this.refreshUnitSelectors();
    if (mode === 'new') {
      this.lmModalTitleEl.textContent = 'Новый лидер';
      this.lmLeaderId.value = '';
      this.lmLeaderId.disabled = false;
      this.lmLeaderName.value = '';
      this.lmLeaderName.disabled = false;
      this.lmLeaderPoints.value = '';
      this.lmTemplateSel.value = '';
      this.lmSize.value = 'small';
      this.lmHealth.value = '10';
      this.lmMaxHealth.value = '10';
      this.lmWalk.value = '3';
      this.lmRun.value = '5';
      this.lmDomains.value = '';
      this.lmSprite.value = '';
      this.lmMiniatureSprite.value = '';
      this.lmDefW.value = '';
      this.lmDefG.value = '';
    } else {
      const id = leaderId!;
      const L = getLeader(id);
      if (!L) return;
      const o = getCatalogOverrides();
      const isCustom = o.newLeaders[id] != null;
      this.lmModalTitleEl.textContent = `Лидер: ${L.name}`;
      this.lmLeaderId.value = id;
      this.lmLeaderId.disabled = true;
      this.lmLeaderName.value = L.name;
      this.lmLeaderName.disabled = !isCustom;
      this.lmLeaderPoints.value = L.points != null ? String(L.points) : '';
      const u = getCatalogUnit(L.catalogUnitId);
      if (u) {
        const c = u.card;
        this.lmSize.value = c.size;
        this.lmHealth.value = String(c.health);
        this.lmMaxHealth.value = String(c.maxHealth);
        this.lmWalk.value = String(c.walk);
        this.lmRun.value = String(c.run);
        this.lmDomains.value = c.domains.join(', ');
        this.lmSprite.value = c.sprite ?? '';
        this.lmMiniatureSprite.value = c.miniatureSprite ?? '';
        this.lmDefW.value = c.defense.white != null ? String(c.defense.white) : '';
        this.lmDefG.value = c.defense.green != null ? String(c.defense.green) : '';
      }
    }
    this.refreshLeaderRosterEditor();
    this.modalBackdrop.classList.add('ce-modal-backdrop--open');
  }

  private closeLeaderModal(): void {
    this.modalBackdrop.classList.remove('ce-modal-backdrop--open');
    this.leaderModalEl.classList.remove('ce-modal--leader-roster');
    this.leaderModalOpen = false;
    this.leaderModalLeaderId = null;
    this.leaderModalPendingRoster = [];
    this.leaderModalIsNew = false;
  }

  private saveLeaderModal(): void {
    void this.saveLeaderModalAsync();
  }

  private async saveLeaderModalAsync(): Promise<void> {
    if (this.leaderModalIsNew) {
      const id = this.lmLeaderId.value.trim();
      if (!id) {
        alert('Укажите id лидера');
        return;
      }
      if (getLeader(id) || getCatalogOverrides().newLeaders[id]) {
        alert('Такой лидер уже есть');
        return;
      }
      const catalogUnitId = id;
      if (getCatalogUnit(catalogUnitId) || getCatalogOverrides().newUnits[catalogUnitId]) {
        alert('Невозможно создать лидера: id лидера совпадает с существующим unit id');
        return;
      }
      const template = this.lmTemplateSel.value ? getCatalogUnit(this.lmTemplateSel.value) : undefined;
      const rawCard = this.readLeaderMiniCardFromModal(template);
      if (!rawCard) {
        alert('Укажите имя лидера');
        return;
      }
      const cardResolved = await resolveCardImageUrlsForStorage(rawCard);
      const card = finalizeCardForUnitSave(catalogUnitId, cardResolved, 'newUnit');
      setNewUnit(catalogUnitId, {
        id: catalogUnitId,
        points: 0,
        card,
      });
      const points = numOrU(this.lmLeaderPoints.value);
      const next: LeaderDef = {
        id,
        name: this.lmLeaderName.value.trim() || id,
        factionId: this.selectedFactionId,
        catalogUnitId,
        roster: [...this.leaderModalPendingRoster],
        ...(points != null ? { points } : {}),
      };
      setNewLeader(id, next);
      this.selectedLeaderId = id;
    } else {
      const id = this.leaderModalLeaderId!;
      const L = getLeader(id);
      if (!L) return;
      const o = getCatalogOverrides();
      const template = this.lmTemplateSel.value ? getCatalogUnit(this.lmTemplateSel.value) : undefined;
      const rawCard = this.readLeaderMiniCardFromModal(template);
      if (!rawCard) {
        alert('Укажите имя на карточке');
        return;
      }
      const catalogUnitId = L.catalogUnitId;
      const cardResolved = await resolveCardImageUrlsForStorage(rawCard);
      const storage = o.newLeaders[id] ? 'newUnit' : 'patch';
      const card = finalizeCardForUnitSave(catalogUnitId, cardResolved, storage);
      const udef = getCatalogUnit(catalogUnitId);
      if (!udef) {
        alert('Нет юнита миниатюры');
        return;
      }
      if (o.newLeaders[id]) {
        setNewUnit(catalogUnitId, {
          ...udef,
          card,
        });
        const base = o.newLeaders[id];
        const lp = numOrU(this.lmLeaderPoints.value);
        setNewLeader(id, {
          ...base,
          name: this.lmLeaderName.value.trim() || base.name,
          ...(lp != null ? { points: lp } : {}),
        });
      } else {
        setUnitPatch(catalogUnitId, {
          card,
        });
      }
    }
    this.closeLeaderModal();
    this.refreshLeaderSelect();
    this.updateBreadcrumbs();
    this.refreshUnitLibraryList();
    this.refreshUnitSelectors();
  }

  private updateBreadcrumbs(): void {
    if (!this.crumbsEl) return;
    const domain = DOMAIN_LABELS[this.selectedDomainId];
    const fac = FACTIONS.find((f) => f.id === this.selectedFactionId);
    const leader = this.selectedLeaderId ? getLeader(this.selectedLeaderId) : undefined;
    this.crumbsEl.textContent = `${domain} › ${fac?.name ?? '—'} › ${leader?.name ?? '—'}`;
  }

  private deleteSelectedUnit(): void {
    const id =
      (this.selectedUnitId ?? this.unitIdInput?.value?.trim() ?? '').trim() || null;
    if (!id) {
      alert('Сначала выберите юнита');
      return;
    }
    if (!confirm(`Удалить юнита ${id} и его привязки?`)) return;
    removeUnitEverywhere(id);
    this.finishUnitForm();
  }

  private deleteSelectedLeader(): void {
    if (!this.selectedLeaderId) {
      alert('Сначала выберите лидера');
      return;
    }
    const id = this.selectedLeaderId;
    const isCustom = listNewLeaderIds().includes(id);
    const actionText = isCustom ? 'Удалить лидера?' : 'Скрыть лидера из списка?';
    if (!confirm(actionText)) return;
    if (isCustom) {
      removeLeaderEverywhere(id);
    } else {
      setLeaderHidden(id, true);
    }
    const next = leadersForFaction(this.selectedFactionId);
    this.selectedLeaderId = next[0]?.id ?? '';
    this.selectedUnitId = null;
    this.refreshLeaderSelect();
    this.updateBreadcrumbs();
    this.refreshUnitLibraryList();
  }

  private clearEditor(): void {
    this.applyError.textContent = '';
    this.hotspotRegions = [];
    this.hotspotImageUrl = '';
    this.hotspotImg.src = '';
    this.selectedRegionIndex = null;
  }

  private applyHotspotFieldsToSelected(): void {
    if (this.selectedRegionIndex === null) return;
    const r = this.hotspotRegions[this.selectedRegionIndex];
    if (!r) return;
    r.range = numOrU(this.hsRange.value);
    r.rangeUnit = this.hsRangeUnit.value === 'hexon' ? 'hexon' : 'hex';
    r.damage = numOrU(this.hsDamage.value);
    r.red = numOrU(this.hsRed.value);
    r.black = numOrU(this.hsBlack.value);
    r.green = numOrU(this.hsGreen.value);
    r.white = numOrU(this.hsWhite.value);
  }

  private syncHotspotFieldsFromRegion(): void {
    if (this.selectedRegionIndex === null) {
      this.hsRange.value = '';
      this.hsRangeUnit.value = 'hex';
      this.hsDamage.value = '';
      this.hsRed.value = '';
      this.hsBlack.value = '';
      this.hsGreen.value = '';
      this.hsWhite.value = '';
      return;
    }
    const r = this.hotspotRegions[this.selectedRegionIndex];
    if (!r) return;
    this.hsRange.value = r.range != null ? String(r.range) : '';
    this.hsRangeUnit.value = r.rangeUnit === 'hexon' ? 'hexon' : 'hex';
    this.hsDamage.value = r.damage != null ? String(r.damage) : '';
    this.hsRed.value = r.red != null ? String(r.red) : '';
    this.hsBlack.value = r.black != null ? String(r.black) : '';
    this.hsGreen.value = r.green != null ? String(r.green) : '';
    this.hsWhite.value = r.white != null ? String(r.white) : '';
  }

  private refreshHotspotPresetSelect(): void {
    if (!this.hsPresetSelect) return;
    const prev = this.hsPresetSelect.value;
    const defId = getCatalogOverrides().defaultHotspotLayoutPresetId;
    this.hsPresetSelect.innerHTML = '';
    this.hsPresetSelect.appendChild(new Option('— выберите пресет —', ''));
    this.hsPresetSelect.appendChild(new Option('По умолчанию', '__default__'));
    for (const p of getCatalogOverrides().hotspotLayoutPresets ?? []) {
      const label = defId === p.id ? `${p.name} (по умолчанию)` : p.name;
      this.hsPresetSelect.appendChild(new Option(label, p.id));
    }
    if ([...this.hsPresetSelect.options].some((o) => o.value === prev)) {
      this.hsPresetSelect.value = prev;
    }
  }

  private applyHotspotLayoutPresetSelection(): void {
    const v = this.hsPresetSelect.value;
    if (!v) return;
    const layout =
      v === '__default__'
        ? DEFAULT_HOTSPOT_LAYOUT_PRESET_REGIONS
        : getCatalogOverrides().hotspotLayoutPresets?.find((p) => p.id === v)?.regions;
    if (!layout || layout.length === 0) {
      this.hotspotHint.textContent = 'Пресет пуст или не найден.';
      return;
    }
    this.applyHotspotFieldsToSelected();
    this.hotspotRegions = applyHotspotLayoutBoxesToRegions(this.hotspotRegions, layout);
    this.selectedRegionIndex = this.hotspotRegions.length > 0 ? 0 : null;
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
    this.hotspotHint.textContent =
      'Применена только раскладка; дальность и кубики по зонам совпадают по порядку с прежними.';
  }

  private saveHotspotLayoutPresetFromUi(): void {
    if (this.hotspotRegions.length === 0) {
      alert('Нет зон — нечего сохранять в пресет.');
      return;
    }
    this.openHotspotPresetSaveDialog();
  }

  /** Раскладка из сохранённого пресета по умолчанию при открытии формы «Новый юнит». */
  private applyDefaultHotspotLayoutPresetForNewUnit(): void {
    const o = getCatalogOverrides();
    const pid = o.defaultHotspotLayoutPresetId;
    const preset = pid ? o.hotspotLayoutPresets?.find((p) => p.id === pid) : undefined;
    this.refreshHotspotPresetSelect();
    if (!preset || preset.regions.length === 0) {
      return;
    }
    this.hotspotRegions = applyHotspotLayoutBoxesToRegions([], preset.regions);
    this.selectedRegionIndex = this.hotspotRegions.length > 0 ? 0 : null;
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
    this.hsPresetSelect.value = preset.id;
  }

  private async applyUnitPatch(): Promise<void> {
    if (!this.selectedUnitId) {
      this.applyError.textContent = 'Выберите юнита';
      return;
    }
    const def = getCatalogUnit(this.selectedUnitId);
    if (!def) return;
    const cardRaw = this.readCardFromForm(def.card);
    if (!cardRaw) return;
    const cardResolved = await resolveCardImageUrlsForStorage(cardRaw);
    const id = this.selectedUnitId;
    const storage = getCatalogOverrides().newUnits[id] ? 'newUnit' : 'patch';
    const card = finalizeCardForUnitSave(id, cardResolved, storage);
    card.catalogUnitId = def.card.catalogUnitId ?? this.selectedUnitId;
    if (getCatalogOverrides().newUnits[id]) {
      setNewUnit(id, { ...def, card });
    } else {
      setUnitPatch(id, { card });
    }
    this.applyError.textContent = '';
  }

  private saveHotspots(): void {
    void this.saveHotspotsAsync();
  }

  /** Для нового юнита id берётся из поля «Идентификатор», пока юнит ещё не в `selectedUnitId`. */
  private resolveHotspotUnitIdForSave(): string | null {
    if (this.selectedUnitId) return this.selectedUnitId;
    if (this.unitFormIsNew) {
      const id = this.unitIdInput.value.trim();
      return id ? id : null;
    }
    return null;
  }

  /**
   * @param softIfNoImage — при сохранении вместе с новым юнитом: без alert, только подсказка
   * (чтобы не блокировать создание юнита, если забыли картинку для хотспотов).
   */
  private async saveHotspotsAsync(opts?: { softIfNoImage?: boolean }): Promise<void> {
    const unitId = this.resolveHotspotUnitIdForSave();
    if (!unitId) {
      alert(
        'Укажите id юнита в поле «Идентификатор» в начале формы. Без id хотспоты не сохраняются в каталоге.',
      );
      return;
    }
    this.applyHotspotFieldsToSelected();
    const raw = this.hotspotImageInput.value.trim() || this.hotspotImageUrl;
    const image = (await resolveImageUrlForStorage(raw)) ?? '';
    if (!image) {
      if (this.hotspotRegions.length === 0) {
        if (opts?.softIfNoImage) return;
        this.hotspotHint.textContent =
          'Нечего сохранять в хотспотах: нет картинки и нет зон. Добавьте зоны и URL картинки.';
        return;
      }
      if (opts?.softIfNoImage) {
        this.hotspotHint.textContent =
          'Юнит сохранён. Хотспоты не записаны: укажите URL картинки в хотспотах и нажмите «Сохранить хотспоты».';
        return;
      }
      alert(
        'Укажите URL картинки (путь под public/) или выберите файл — старые blob: ссылки не работают после перезагрузки.',
      );
      return;
    }
    const file: HotspotFile = {
      image,
      title: getCatalogUnit(unitId)?.card.name,
      regions: this.hotspotRegions.map((r) => stripRegionForSave(structuredClone(r))),
    };
    setHotspotsForUnit(unitId, file);
    try {
      clearCardSpriteFromUnitOverrides(unitId);
      const defAfter = getCatalogUnit(unitId);
      const thumb = defAfter ? unitPanelThumbSrc(defAfter.card) : undefined;
      if (thumb) this.cardSprite.value = thumb;
    } catch (e) {
      console.warn('[catalogEditor] post-hotspot sprite dedupe failed', e);
    }
    this.hotspotImageInput.value = image;
    this.hotspotImageUrl = image;
    if (this.unitFormIsNew) this.selectedUnitId = unitId;
    this.hotspotHint.textContent = opts?.softIfNoImage
      ? 'Юнит и хотспоты сохранены в оверрайды.'
      : 'Сохранено в оверрайды.';
  }

  private copyHotspot(): void {
    if (this.selectedRegionIndex === null) return;
    const r = this.hotspotRegions[this.selectedRegionIndex];
    if (!r) return;
    this.hotspotClipboard = structuredClone(stripRegionForSave(r));
    this.hotspotHint.textContent = 'Зона скопирована.';
  }

  private pasteHotspot(): void {
    if (!this.hotspotClipboard) {
      this.hotspotHint.textContent = 'Нечего вставлять — сначала копирование.';
      return;
    }
    const base = structuredClone(this.hotspotClipboard);
    base.id = `zone_${Date.now()}`;
    base.x = clamp(base.x + 0.02, 0, 1 - base.w);
    base.y = clamp(base.y + 0.02, 0, 1 - base.h);
    this.hotspotRegions.push(base);
    this.selectedRegionIndex = this.hotspotRegions.length - 1;
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
    this.hotspotHint.textContent = 'Зона вставлена.';
  }

  private deleteSelectedHotspot(): void {
    if (this.selectedRegionIndex === null) return;
    this.hotspotRegions.splice(this.selectedRegionIndex, 1);
    this.selectedRegionIndex = null;
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
  }

  /** Класс выбранной зоны и кнопка «×» без полной пересборки DOM (пересборка на pointerdown ломает dblclick / click×2). */
  private updateHotspotRectSelectionUi(): void {
    const nodes = this.hotspotStage.querySelectorAll('.ce-hs-rect');
    if (nodes.length !== this.hotspotRegions.length) {
      this.renderHotspotRects();
      return;
    }
    nodes.forEach((node) => {
      const div = node as HTMLElement;
      const idx = Number(div.dataset.index);
      if (!Number.isFinite(idx)) return;
      const sel = this.selectedRegionIndex === idx;
      div.classList.toggle('ce-hs-rect--selected', sel);
      const existingClose = div.querySelector('.ce-hs-close');
      if (sel && !existingClose) {
        const close = el('button', 'ce-hs-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Удалить зону');
        close.innerHTML = '×';
        close.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          this.selectedRegionIndex = idx;
          this.deleteSelectedHotspot();
        });
        const handle = div.querySelector('.ce-hs-handle');
        if (handle) div.insertBefore(close, handle);
        else div.appendChild(close);
      } else if (!sel && existingClose) {
        existingClose.remove();
      }
    });
  }

  private renderHotspotRects(): void {
    this.hotspotStage.querySelectorAll('.ce-hs-rect').forEach((n) => n.remove());
    this.hotspotRegions.forEach((r, index) => {
      const div = el('div', 'ce-hs-rect');
      if (this.selectedRegionIndex === index) div.classList.add('ce-hs-rect--selected');
      div.style.left = `${r.x * 100}%`;
      div.style.top = `${r.y * 100}%`;
      div.style.width = `${r.w * 100}%`;
      div.style.height = `${r.h * 100}%`;
      div.dataset.index = String(index);
      div.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).classList.contains('ce-hs-handle')) return;
        if ((e.target as HTMLElement).classList.contains('ce-hs-close')) return;
        e.stopPropagation();
        this.selectedRegionIndex = index;
        this.updateHotspotRectSelectionUi();
        this.syncHotspotFieldsFromRegion();
        if (e.detail === 2) {
          this.hotspotStage.focus({ preventScroll: true });
          return;
        }
        this.startMove(index, e);
        this.hotspotStage.focus({ preventScroll: true });
      });
      div.addEventListener('click', (e) => {
        if (e.detail !== 2) return;
        const t = e.target as HTMLElement;
        if (t.closest('.ce-hs-handle') || t.closest('.ce-hs-close')) return;
        e.stopPropagation();
        e.preventDefault();
        this.selectedRegionIndex = index;
        this.updateHotspotRectSelectionUi();
        this.syncHotspotFieldsFromRegion();
        this.openHotspotQuickEdit(e.clientX, e.clientY);
      });
      if (this.selectedRegionIndex === index) {
        const close = el('button', 'ce-hs-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Удалить зону');
        close.innerHTML = '×';
        close.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.selectedRegionIndex = index;
          this.deleteSelectedHotspot();
        });
        div.appendChild(close);
      }
      const h = el('div', 'ce-hs-handle');
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startResize(index, e);
      });
      div.appendChild(h);
      this.hotspotStage.appendChild(div);
    });
  }

  private onStagePointerDown(e: PointerEvent): void {
    if (e.target !== this.hotspotStage && e.target !== this.hotspotImg) return;
    this.selectedRegionIndex = null;
    this.renderHotspotRects();
    this.syncHotspotFieldsFromRegion();
  }

  private startResize(index: number, e: PointerEvent): void {
    const r = this.hotspotRegions[index];
    this.drag = {
      kind: 'resize',
      index,
      startX: e.clientX,
      startY: e.clientY,
      ox: r.x,
      oy: r.y,
      ow: r.w,
      oh: r.h,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  private startMove(index: number, e: PointerEvent): void {
    const r = this.hotspotRegions[index];
    const rect = this.hotspotStage.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    this.drag = {
      kind: 'move',
      index,
      offX: nx - r.x,
      offY: ny - r.y,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  private boundMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const r = this.hotspotRegions[this.drag.index];
    const rect = this.hotspotStage.getBoundingClientRect();
    if (this.drag.kind === 'move') {
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      r.x = clamp(nx - this.drag.offX, 0, 1 - r.w);
      r.y = clamp(ny - this.drag.offY, 0, 1 - r.h);
    } else {
      const dx = (e.clientX - this.drag.startX) / rect.width;
      const dy = (e.clientY - this.drag.startY) / rect.height;
      r.w = clamp(this.drag.ow + dx, 0.02, 1 - r.x);
      r.h = clamp(this.drag.oh + dy, 0.02, 1 - r.y);
    }
    this.renderHotspotRects();
  };

  private boundUp = (): void => {
    this.drag = null;
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup', this.boundUp);
  };

  setOpen(v: boolean): void {
    this.open = v;
    if (!v) this.closeHotspotQuickEditDiscard();
    this.overlay.classList.toggle('catalog-editor-overlay-visible', v);
    this.panel.classList.toggle('catalog-editor-panel-open', v);
    if (v) {
      this.refreshUnitSelectors();
      this.refreshLeaderSelect();
      this.refreshUnitLibraryList();
      this.updateBreadcrumbs();
      this.refreshLeaderAttachedUnits();
      this.panel.focus();
    }
  }
}

function dicePoolEmpty(o: { red?: number; green?: number; black?: number; white?: number }): boolean {
  return !o.red && !o.green && !o.black && !o.white;
}
