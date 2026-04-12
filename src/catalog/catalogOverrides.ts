/**
 * Runtime catalog overrides: localStorage + import/export JSON.
 * Merged with static `CATALOG_UNITS` / `LEADERS` in `armyCatalog.ts`.
 */

import { CATALOG_INVENTORY, CATALOG_UNITS, LEADERS } from './index';
import { normalizeCatalogOverridesV1 } from './catalogIdResolve';
import { getStaticHotspotForUnit } from './staticHotspots';
import type { CatalogUnitDef, InventoryItemDef, LeaderDef, RosterSlotDef } from './types';
import type {
  HotspotFile,
  HotspotLayoutBox,
  HotspotLayoutPreset,
  HotspotRegion,
} from './hotspotTypes';
import {
  applyHotspotLayoutPresetBoxesToSemanticRegions,
  buildTornscapeHotspotSemanticRegions,
} from './tornscapeScrollHotspots';
import type { UnitCardData } from '../unitCard';
import { GOD_CARDS, getGodCardById, godCardBaseId, type GodCardDef } from '../godCards';

export const CATALOG_OVERRIDES_STORAGE_KEY = 'hexBoard_catalogOverrides_v1';

export const CATALOG_OVERRIDES_CHANGED = 'hexBoard:catalog-overrides-changed';

/** Options for `saveCatalogOverrides` and `CATALOG_OVERRIDES_CHANGED` listeners. */
export type CatalogOverridesSaveOptions = {
  /**
   * When true, the catalog editor skips rebuilding the unit library list (keeps focus
   * in inline HP/walk/run fields). Other editor refreshes still run.
   */
  catalogEditorSkipUnitLibraryList?: boolean;
};

export type LeaderPointsPatch = Partial<Pick<LeaderDef, 'points'>>;

export type RosterSlotFieldPatch = Partial<
  Pick<RosterSlotDef, 'points' | 'maxCopies' | 'requiresUnitId'>
>;

/**
 * Оверрайд статической карты: `onlyForLeaderIds`, `copiesByLeader` (в т.ч. 0 — убрать карту у лидера).
 */
export type GodCardPatch = Partial<Pick<GodCardDef, 'onlyForLeaderIds' | 'copiesByLeader'>>;

export type CatalogOverridesV1 = {
  version: 1;
  unitPatches: Record<string, Partial<CatalogUnitDef>>;
  newUnits: Record<string, CatalogUnitDef>;
  newLeaders: Record<string, LeaderDef>;
  hiddenLeaderIds: string[];
  /** Статические id из `CATALOG_UNITS`, скрытые через «удалить» в редакторе (как hiddenLeaderIds). */
  hiddenUnitIds: string[];
  rosterAdditions: Record<string, RosterSlotDef[]>;
  /** Static leaders only: override `points` for the leader miniature. */
  leaderPatches: Record<string, LeaderPointsPatch>;
  /** Static leaders only: per-slot overrides merged after base roster + additions. */
  rosterSlotPatches: Record<string, Record<string, RosterSlotFieldPatch>>;
  hotspots: Record<string, HotspotFile>;
  /** Именованные пресеты только раскладки зон (доли x,y,w,h). */
  hotspotLayoutPresets: HotspotLayoutPreset[];
  /** id из `hotspotLayoutPresets` — подставлять раскладку при создании нового юнита. */
  defaultHotspotLayoutPresetId: string | null;
  /** Пользовательский порядок id юнитов в редакторе библиотеки. */
  unitOrder: string[];
  /** Пользовательский порядок слотов ростера по лидеру (unitId[]). */
  leaderRosterOrder: Record<string, string[]>;
  newInventoryItems: Record<string, InventoryItemDef>;
  inventoryPatches: Record<string, Partial<InventoryItemDef>>;
  hiddenInventoryIds: string[];
  /** Порядок id предметов в редакторе (как unitOrder). */
  inventoryOrder: string[];
  /** Статические карты богов (`godCards.ts`): ограничение по лидерам. */
  godCardPatches: Record<string, GodCardPatch>;
  /** Максимальный размер колоды карт богов для лидера (справочно в редакторе; можно учитывать в правилах позже). */
  leaderGodDeckMax: Record<string, number>;
};

function emptyOverrides(): CatalogOverridesV1 {
  return {
    version: 1,
    unitPatches: {},
    newUnits: {},
    newLeaders: {},
    hiddenLeaderIds: [],
    hiddenUnitIds: [],
    rosterAdditions: {},
    leaderPatches: {},
    rosterSlotPatches: {},
    hotspots: {},
    hotspotLayoutPresets: [],
    defaultHotspotLayoutPresetId: null,
    unitOrder: [],
    leaderRosterOrder: {},
    newInventoryItems: {},
    inventoryPatches: {},
    hiddenInventoryIds: [],
    inventoryOrder: [],
    godCardPatches: {},
    leaderGodDeckMax: {},
  };
}

let cache: CatalogOverridesV1 | null = null;
/** После загрузки каталога один раз приводим ключи localStorage к каноническим id. */
let loadedStorageNormalized = false;
let persistTimer: number | null = null;
let notifyQueued = false;
/** Merged across coalesced `notifyChanged` calls in one animation frame (AND of skip flags). */
let mergedCatalogEditorSkipUnitLibraryList: boolean | null = null;
const PERSIST_DEBOUNCE_MS = 120;
const dispatchAsync = (fn: () => void): void => {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => fn());
    return;
  }
  window.setTimeout(fn, 0);
};

function schedulePersist(overrides: CatalogOverridesV1): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(CATALOG_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      console.error('[catalogOverrides] localStorage save failed', e);
    }
  }, PERSIST_DEBOUNCE_MS);
}

function notifyChanged(opts?: CatalogOverridesSaveOptions): void {
  const skip = opts?.catalogEditorSkipUnitLibraryList === true;
  if (mergedCatalogEditorSkipUnitLibraryList === null) {
    mergedCatalogEditorSkipUnitLibraryList = skip;
  } else {
    mergedCatalogEditorSkipUnitLibraryList =
      mergedCatalogEditorSkipUnitLibraryList && skip;
  }

  if (notifyQueued) return;
  notifyQueued = true;
  dispatchAsync(() => {
    notifyQueued = false;
    const detail: CatalogOverridesSaveOptions = {
      catalogEditorSkipUnitLibraryList: mergedCatalogEditorSkipUnitLibraryList === true,
    };
    mergedCatalogEditorSkipUnitLibraryList = null;
    window.dispatchEvent(new CustomEvent(CATALOG_OVERRIDES_CHANGED, { detail }));
  });
}

function catalogBundleReady(): boolean {
  return LEADERS.length > 0 && Object.keys(CATALOG_UNITS).length > 0;
}

/** Нормализация id в оверрайдах (алиасы папок art / отображаемые имена → id из каталога). */
function maybeNormalizeCacheAfterCatalogLoad(): void {
  if (loadedStorageNormalized || !cache || !catalogBundleReady()) return;
  loadedStorageNormalized = true;
  const r = normalizeCatalogOverridesV1(cache, { leaders: LEADERS, units: CATALOG_UNITS });
  if (!r.changed) return;
  cache = r.normalized;
  const lines = [...r.renames.leaders, ...r.renames.units];
  if (lines.length) {
    console.warn('[catalogOverrides] Ключи оверрайдов приведены к каноническим id:', lines.join('; '));
  }
  schedulePersist(cache);
  notifyChanged({ catalogEditorSkipUnitLibraryList: true });
}

export function getCatalogOverrides(): CatalogOverridesV1 {
  if (!cache) cache = loadCatalogOverridesFromStorage();
  maybeNormalizeCacheAfterCatalogLoad();
  return cache;
}

export function loadCatalogOverridesFromStorage(): CatalogOverridesV1 {
  try {
    const raw = localStorage.getItem(CATALOG_OVERRIDES_STORAGE_KEY);
    if (!raw) return emptyOverrides();
    const o = JSON.parse(raw) as Partial<CatalogOverridesV1>;
    if (o.version !== 1 || typeof o !== 'object' || o === null) return emptyOverrides();
    const hotspotLayoutPresets = normalizeHotspotLayoutPresets(o.hotspotLayoutPresets);
    return {
      version: 1,
      unitPatches: (o.unitPatches && typeof o.unitPatches === 'object' ? o.unitPatches : {}) as Record<
        string,
        Partial<CatalogUnitDef>
      >,
      newUnits: (o.newUnits && typeof o.newUnits === 'object' ? o.newUnits : {}) as Record<
        string,
        CatalogUnitDef
      >,
      newLeaders: (o.newLeaders && typeof o.newLeaders === 'object' ? o.newLeaders : {}) as Record<
        string,
        LeaderDef
      >,
      hiddenLeaderIds: Array.isArray(o.hiddenLeaderIds)
        ? o.hiddenLeaderIds.filter((id): id is string => typeof id === 'string')
        : [],
      hiddenUnitIds: Array.isArray(o.hiddenUnitIds)
        ? o.hiddenUnitIds.filter((id): id is string => typeof id === 'string')
        : [],
      rosterAdditions: (o.rosterAdditions && typeof o.rosterAdditions === 'object'
        ? o.rosterAdditions
        : {}) as Record<string, RosterSlotDef[]>,
      leaderPatches: (o.leaderPatches && typeof o.leaderPatches === 'object' ? o.leaderPatches : {}) as Record<
        string,
        LeaderPointsPatch
      >,
      rosterSlotPatches: (o.rosterSlotPatches && typeof o.rosterSlotPatches === 'object'
        ? o.rosterSlotPatches
        : {}) as Record<string, Record<string, RosterSlotFieldPatch>>,
      hotspots: (o.hotspots && typeof o.hotspots === 'object' ? o.hotspots : {}) as Record<
        string,
        HotspotFile
      >,
      hotspotLayoutPresets,
      defaultHotspotLayoutPresetId: normalizeDefaultHotspotLayoutPresetId(
        o.defaultHotspotLayoutPresetId,
        hotspotLayoutPresets,
      ),
      unitOrder: Array.isArray(o.unitOrder) ? o.unitOrder.filter((id): id is string => typeof id === 'string') : [],
      leaderRosterOrder:
        o.leaderRosterOrder && typeof o.leaderRosterOrder === 'object'
          ? Object.fromEntries(
              Object.entries(o.leaderRosterOrder).map(([leaderId, order]) => [
                leaderId,
                Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string') : [],
              ]),
            )
          : {},
      newInventoryItems:
        o.newInventoryItems && typeof o.newInventoryItems === 'object'
          ? (o.newInventoryItems as Record<string, InventoryItemDef>)
          : {},
      inventoryPatches:
        o.inventoryPatches && typeof o.inventoryPatches === 'object'
          ? (o.inventoryPatches as Record<string, Partial<InventoryItemDef>>)
          : {},
      hiddenInventoryIds: Array.isArray(o.hiddenInventoryIds)
        ? o.hiddenInventoryIds.filter((id): id is string => typeof id === 'string')
        : [],
      inventoryOrder: Array.isArray(o.inventoryOrder)
        ? o.inventoryOrder.filter((id): id is string => typeof id === 'string')
        : [],
      godCardPatches:
        o.godCardPatches && typeof o.godCardPatches === 'object'
          ? (o.godCardPatches as Record<string, GodCardPatch>)
          : {},
      leaderGodDeckMax:
        o.leaderGodDeckMax && typeof o.leaderGodDeckMax === 'object'
          ? Object.fromEntries(
              Object.entries(o.leaderGodDeckMax).filter(
                ([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0,
              ),
            )
          : {},
    };
  } catch {
    return emptyOverrides();
  }
}

function normalizeDefaultHotspotLayoutPresetId(
  raw: unknown,
  presets: HotspotLayoutPreset[],
): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return presets.some((p) => p.id === raw) ? raw : null;
}

function normalizeHotspotLayoutPresets(raw: unknown): HotspotLayoutPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: HotspotLayoutPreset[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const id = (p as { id?: unknown }).id;
    const name = (p as { name?: unknown }).name;
    const regions = (p as { regions?: unknown }).regions;
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(regions)) continue;
    const boxes: HotspotLayoutBox[] = [];
    for (const r of regions) {
      if (!r || typeof r !== 'object') continue;
      const x = Number((r as { x?: unknown }).x);
      const y = Number((r as { y?: unknown }).y);
      const w = Number((r as { w?: unknown }).w);
      const h = Number((r as { h?: unknown }).h);
      if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
      boxes.push({ x, y, w, h });
    }
    if (boxes.length === 0) continue;
    out.push({ id, name, regions: boxes });
  }
  return out;
}

export function saveCatalogOverrides(
  overrides: CatalogOverridesV1,
  opts?: CatalogOverridesSaveOptions,
): void {
  let next = overrides;
  if (catalogBundleReady()) {
    const r = normalizeCatalogOverridesV1(overrides, { leaders: LEADERS, units: CATALOG_UNITS });
    next = r.normalized;
    if (r.changed) {
      const lines = [...r.renames.leaders, ...r.renames.units];
      if (lines.length) {
        console.warn('[catalogOverrides] При сохранении приведены id к канону:', lines.join('; '));
      }
    }
  }
  cache = next;
  schedulePersist(next);
  notifyChanged(opts);
}

export function resetCatalogOverrides(): void {
  cache = emptyOverrides();
  loadedStorageNormalized = false;
  try {
    localStorage.removeItem(CATALOG_OVERRIDES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifyChanged(undefined);
}

export function exportCatalogOverridesJson(): string {
  return JSON.stringify(getCatalogOverrides(), null, 2);
}

export function importCatalogOverridesJson(text: string): { ok: true } | { ok: false; error: string } {
  try {
    const o = JSON.parse(text) as Partial<CatalogOverridesV1>;
    if (o.version !== 1) return { ok: false, error: 'Ожидается version: 1' };
    const hotspotLayoutPresets = normalizeHotspotLayoutPresets(o.hotspotLayoutPresets);
    const merged: CatalogOverridesV1 = {
      version: 1,
      unitPatches: (o.unitPatches ?? {}) as Record<string, Partial<CatalogUnitDef>>,
      newUnits: (o.newUnits ?? {}) as Record<string, CatalogUnitDef>,
      newLeaders: (o.newLeaders ?? {}) as Record<string, LeaderDef>,
      hiddenLeaderIds: Array.isArray(o.hiddenLeaderIds)
        ? o.hiddenLeaderIds.filter((id): id is string => typeof id === 'string')
        : [],
      hiddenUnitIds: Array.isArray(o.hiddenUnitIds)
        ? o.hiddenUnitIds.filter((id): id is string => typeof id === 'string')
        : [],
      rosterAdditions: (o.rosterAdditions ?? {}) as Record<string, RosterSlotDef[]>,
      leaderPatches: (o.leaderPatches ?? {}) as Record<string, LeaderPointsPatch>,
      rosterSlotPatches: (o.rosterSlotPatches ?? {}) as Record<string, Record<string, RosterSlotFieldPatch>>,
      hotspots: (o.hotspots ?? {}) as Record<string, HotspotFile>,
      hotspotLayoutPresets,
      defaultHotspotLayoutPresetId: normalizeDefaultHotspotLayoutPresetId(
        o.defaultHotspotLayoutPresetId,
        hotspotLayoutPresets,
      ),
      unitOrder: Array.isArray(o.unitOrder) ? o.unitOrder.filter((id): id is string => typeof id === 'string') : [],
      leaderRosterOrder:
        o.leaderRosterOrder && typeof o.leaderRosterOrder === 'object'
          ? Object.fromEntries(
              Object.entries(o.leaderRosterOrder).map(([leaderId, order]) => [
                leaderId,
                Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string') : [],
              ]),
            )
          : {},
      newInventoryItems:
        o.newInventoryItems && typeof o.newInventoryItems === 'object'
          ? (o.newInventoryItems as Record<string, InventoryItemDef>)
          : {},
      inventoryPatches:
        o.inventoryPatches && typeof o.inventoryPatches === 'object'
          ? (o.inventoryPatches as Record<string, Partial<InventoryItemDef>>)
          : {},
      hiddenInventoryIds: Array.isArray(o.hiddenInventoryIds)
        ? o.hiddenInventoryIds.filter((id): id is string => typeof id === 'string')
        : [],
      inventoryOrder: Array.isArray(o.inventoryOrder)
        ? o.inventoryOrder.filter((id): id is string => typeof id === 'string')
        : [],
      godCardPatches:
        o.godCardPatches && typeof o.godCardPatches === 'object'
          ? (o.godCardPatches as Record<string, GodCardPatch>)
          : {},
      leaderGodDeckMax:
        o.leaderGodDeckMax && typeof o.leaderGodDeckMax === 'object'
          ? Object.fromEntries(
              Object.entries(o.leaderGodDeckMax).filter(
                ([k, v]) => typeof k === 'string' && typeof v === 'number' && Number.isFinite(v) && v >= 0,
              ),
            )
          : {},
    };
    saveCatalogOverrides(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function cloneOverrides(): CatalogOverridesV1 {
  return JSON.parse(JSON.stringify(getCatalogOverrides())) as CatalogOverridesV1;
}

/** Сохранить или перезаписать пресет раскладки по имени (только x,y,w,h). */
export function upsertHotspotLayoutPreset(name: string, regions: HotspotLayoutBox[]): HotspotLayoutPreset {
  const trimmed = name.trim();
  const o = cloneOverrides();
  o.hotspotLayoutPresets = o.hotspotLayoutPresets ?? [];
  const list = [...o.hotspotLayoutPresets];
  const idx = list.findIndex((p) => p.name === trimmed);
  const id = idx >= 0 ? list[idx]!.id : `hlp_${Date.now()}`;
  const preset: HotspotLayoutPreset = { id, name: trimmed, regions };
  if (idx >= 0) list[idx] = preset;
  else list.push(preset);
  o.hotspotLayoutPresets = list;
  saveCatalogOverrides(o);
  return preset;
}

/** Пресет по умолчанию для вкладки хот-спотов при создании нового юнита (`null` — нет). */
export function setDefaultHotspotLayoutPresetId(id: string | null): void {
  const o = cloneOverrides();
  o.hotspotLayoutPresets = o.hotspotLayoutPresets ?? [];
  o.defaultHotspotLayoutPresetId = normalizeDefaultHotspotLayoutPresetId(id, o.hotspotLayoutPresets);
  saveCatalogOverrides(o);
}

/** Deep-merge plain objects; arrays and primitives from patch replace. */
function deepMerge<T extends object>(base: T, patch: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[key];
    if (pv === undefined) continue;
    const bv = base[key];
    if (
      pv !== null &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      bv !== null &&
      typeof bv === 'object' &&
      !Array.isArray(bv)
    ) {
      out[key as string] = deepMerge(bv as object, pv as object);
    } else {
      out[key as string] = pv;
    }
  }
  return out as T;
}

/**
 * Если в патче `card.sprite`/`card.miniatureSprite` ссылается на «чужую» папку
 * `/catalog-units/<X>/...`, не совпадающую ни с id юнита, ни с папкой базового sprite, —
 * убираем это поле из патча, чтобы значение из базы (бандла) победило. Защита от
 * залежавшихся переименованных папок, которые ещё не попали в `id-aliases.json`.
 */
const CATALOG_UNITS_FOLDER_RE = /^\/catalog-units\/([^/]+)\//;
const guardWarnedKeys = new Set<string>();

function guardPatchCardSpritePaths(
  base: CatalogUnitDef,
  patch: Partial<CatalogUnitDef>,
): Partial<CatalogUnitDef> {
  if (!patch.card) return patch;
  const baseId = base.id;
  const baseSpriteFolder =
    typeof base.card?.sprite === 'string'
      ? base.card.sprite.match(CATALOG_UNITS_FOLDER_RE)?.[1]
      : undefined;
  const baseMiniFolder =
    typeof base.card?.miniatureSprite === 'string'
      ? base.card.miniatureSprite.match(CATALOG_UNITS_FOLDER_RE)?.[1]
      : undefined;
  const isAcceptable = (folder: string): boolean =>
    folder === baseId || folder === baseSpriteFolder || folder === baseMiniFolder;

  const sp = patch.card.sprite;
  const mi = patch.card.miniatureSprite;
  let dropSprite = false;
  let dropMini = false;
  if (typeof sp === 'string') {
    const m = sp.match(CATALOG_UNITS_FOLDER_RE);
    if (m && !isAcceptable(m[1])) dropSprite = true;
  }
  if (typeof mi === 'string') {
    const m = mi.match(CATALOG_UNITS_FOLDER_RE);
    if (m && !isAcceptable(m[1])) dropMini = true;
  }
  if (!dropSprite && !dropMini) return patch;

  const warnKey = `${baseId}|${dropSprite ? 's' : ''}|${dropMini ? 'm' : ''}`;
  if (!guardWarnedKeys.has(warnKey)) {
    guardWarnedKeys.add(warnKey);
    const drops: string[] = [];
    if (dropSprite) drops.push(`card.sprite=${sp}`);
    if (dropMini) drops.push(`card.miniatureSprite=${mi}`);
    console.warn(
      `[catalogOverrides] игнорирую поля патча юнита "${baseId}" со ссылкой на чужую папку /catalog-units/<X>/: ${drops.join('; ')}`,
    );
  }
  const nextCard = { ...patch.card } as Partial<CatalogUnitDef['card']>;
  if (dropSprite) delete nextCard.sprite;
  if (dropMini) delete nextCard.miniatureSprite;
  return { ...patch, card: nextCard as CatalogUnitDef['card'] };
}

function mergeCatalogUnitDef(base: CatalogUnitDef, patch: Partial<CatalogUnitDef>): CatalogUnitDef {
  let effectivePatch = patch;
  if (patch.card && patch.card.miniatureSprite === '') {
    const { miniatureSprite: _omit, ...restCard } = patch.card;
    effectivePatch = { ...patch, card: restCard };
  }
  effectivePatch = guardPatchCardSpritePaths(base, effectivePatch);
  const out = deepMerge(base, effectivePatch) as CatalogUnitDef;
  if (Object.prototype.hasOwnProperty.call(patch, 'requiresCommanderUnitId')) {
    const v = patch.requiresCommanderUnitId;
    if (v === null || v === '') {
      delete (out as { requiresCommanderUnitId?: string }).requiresCommanderUnitId;
    }
  }
  return out;
}

function mergeInventoryItemDef(base: InventoryItemDef, patch: Partial<InventoryItemDef>): InventoryItemDef {
  return deepMerge(base, patch);
}

function mergeGodCardDef(base: GodCardDef, patch: GodCardPatch): GodCardDef {
  const out: GodCardDef = { ...base };
  if (patch.onlyForLeaderIds !== undefined) {
    out.onlyForLeaderIds =
      patch.onlyForLeaderIds.length > 0 ? [...patch.onlyForLeaderIds] : undefined;
  }
  if (patch.copiesByLeader !== undefined) {
    out.copiesByLeader = { ...base.copiesByLeader, ...patch.copiesByLeader };
  }
  return out;
}

/** Статическая карта бога + `godCardPatches` из оверрайдов. */
export function getMergedGodCard(cardId: string): GodCardDef | undefined {
  const base = getGodCardById(cardId);
  if (!base) return undefined;
  const o = getCatalogOverrides();
  const patch = o.godCardPatches[cardId];
  if (!patch || Object.keys(patch).length === 0) return structuredClone(base);
  return mergeGodCardDef(structuredClone(base), patch);
}

/** Сколько экземпляров карты `cardId` (базовый id) в колоде для лидера. */
export function effectiveGodCardCopiesForLeader(cardId: string, leaderId: string): number {
  const baseId = godCardBaseId(cardId);
  const fromPatch = getCatalogOverrides().godCardPatches[baseId]?.copiesByLeader?.[leaderId];
  if (fromPatch !== undefined) {
    return Math.max(0, Math.floor(fromPatch));
  }
  const base = getGodCardById(baseId);
  const fromCatalog = base?.copiesByLeader?.[leaderId];
  if (fromCatalog !== undefined) {
    return Math.max(0, Math.floor(fromCatalog));
  }
  return 1;
}

/**
 * Сумма экземпляров карт богов в колоде лидера (по данным оверрайдов и `onlyForLeaderIds`).
 */
export function godDeckCopyTotalForLeader(leaderId: string): number {
  let sum = 0;
  for (const c of GOD_CARDS) {
    const m = getMergedGodCard(c.id);
    if (!m) continue;
    const only = m.onlyForLeaderIds;
    if (!only || only.length === 0 || !only.includes(leaderId)) continue;
    sum += effectiveGodCardCopiesForLeader(c.id, leaderId);
  }
  return sum;
}

export function getLeaderGodDeckMax(leaderId: string): number | undefined {
  const v = getCatalogOverrides().leaderGodDeckMax[leaderId];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
}

export function setLeaderGodDeckMax(leaderId: string, maxCards: number | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (maxCards === undefined || !Number.isFinite(maxCards) || maxCards < 0) {
    delete o.leaderGodDeckMax[leaderId];
  } else {
    o.leaderGodDeckMax[leaderId] = Math.floor(maxCards);
  }
  saveCatalogOverrides(o);
}

/**
 * Карты богов для панели армии: `onlyForLeaderIds` + `copiesByLeader`.
 * Нет поля или пустой массив — карта никому не показывается.
 * Несколько копий одной карты — id `base__gc0`, `base__gc1`, …
 */
export function godCardsForLeader(leaderId: string): GodCardDef[] {
  const out: GodCardDef[] = [];
  for (const c of GOD_CARDS) {
    const m = getMergedGodCard(c.id);
    if (!m) continue;
    const only = m.onlyForLeaderIds;
    if (!only || only.length === 0) continue;
    if (!only.includes(leaderId)) continue;
    const copies = effectiveGodCardCopiesForLeader(c.id, leaderId);
    if (copies === 0) continue;
    for (let i = 0; i < copies; i++) {
      const instanceId = copies === 1 ? c.id : `${c.id}__gc${i}`;
      out.push(instanceId === c.id ? { ...m } : { ...m, id: instanceId });
    }
  }
  return out;
}

function sortedIdsKey(ids: readonly string[]): string {
  return [...ids].sort().join('\0');
}

function normalizeGodCardCopiesRecord(cb: Record<string, number>): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(cb)) {
    const n = Math.max(0, Math.floor(v));
    if (n === 0) out[k] = 0;
    else if (n !== 1) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Применить набор карт богов для одного лидера (редактор каталога).
 * Обновляет `onlyForLeaderIds` и `copiesByLeader` у всех карт за один проход.
 */
export function applyLeaderGodCardLoadout(
  leaderId: string,
  assignedCardIds: ReadonlySet<string>,
  copies: Readonly<Record<string, number>>,
): void {
  const o = structuredClone(getCatalogOverrides());
  for (const c of GOD_CARDS) {
    const cardId = c.id;
    const base = getGodCardById(cardId)!;
    const p = o.godCardPatches[cardId];
    let only: string[];
    if (p?.onlyForLeaderIds !== undefined) {
      only = [...p.onlyForLeaderIds];
    } else {
      only = base.onlyForLeaderIds ? [...base.onlyForLeaderIds] : [];
    }
    const leaders = new Set(only);
    if (assignedCardIds.has(cardId)) leaders.add(leaderId);
    else leaders.delete(leaderId);
    const nextOnly = [...leaders];

    let cb: Record<string, number> = p?.copiesByLeader ? { ...p.copiesByLeader } : {};
    if (assignedCardIds.has(cardId)) {
      const n = Math.max(0, Math.floor(copies[cardId] ?? 1));
      if (n <= 1) delete cb[leaderId];
      else cb[leaderId] = n;
    } else {
      delete cb[leaderId];
    }
    const normCb = normalizeGodCardCopiesRecord(cb);

    const baseOnly = base.onlyForLeaderIds ?? [];
    const onlyMatchesBase = sortedIdsKey(nextOnly) === sortedIdsKey([...baseOnly]);

    const finalPatch: GodCardPatch = {};
    if (!onlyMatchesBase) {
      finalPatch.onlyForLeaderIds = nextOnly.length > 0 ? nextOnly : [];
    }
    if (normCb) {
      finalPatch.copiesByLeader = normCb;
    }

    if (Object.keys(finalPatch).length === 0) {
      delete o.godCardPatches[cardId];
    } else {
      o.godCardPatches[cardId] = finalPatch;
    }
  }
  saveCatalogOverrides(o);
}

/**
 * Effective inventory item: static `CATALOG_INVENTORY`, `newInventoryItems`, then `inventoryPatches`.
 */
export function getMergedInventoryItem(itemId: string): InventoryItemDef | undefined {
  const o = getCatalogOverrides();
  const nu = o.newInventoryItems[itemId];
  if (nu) {
    let def = structuredClone(nu);
    const patch = o.inventoryPatches[itemId];
    if (patch && Object.keys(patch).length > 0) {
      def = mergeInventoryItemDef(def, patch);
    }
    def.id = itemId;
    return def;
  }
  if (o.hiddenInventoryIds.includes(itemId)) {
    return undefined;
  }
  const staticI = CATALOG_INVENTORY[itemId];
  if (!staticI) return undefined;
  let def = structuredClone(staticI);
  const patch = o.inventoryPatches[itemId];
  if (patch && Object.keys(patch).length > 0) {
    def = mergeInventoryItemDef(def, patch);
  }
  def.id = itemId;
  return def;
}

/**
 * Effective unit: static catalog, optional full override in `newUnits`, then `unitPatches`.
 */
export function getMergedCatalogUnit(unitId: string): CatalogUnitDef | undefined {
  const o = getCatalogOverrides();
  const nu = o.newUnits[unitId];
  if (nu) {
    let def = structuredClone(nu);
    // If a unit with the same id also exists in static catalog, keep huge-art defaults
    // from static card when local override/newUnit was created before these fields existed.
    const staticU = CATALOG_UNITS[unitId];
    if (
      staticU &&
      (def.card?.size === 'huge' || def.card?.size === 'huge2') &&
      (def.card.hugeSpriteOffsetLocal === undefined || def.card.hugeSpriteRotationDeg === undefined)
    ) {
      def = mergeCatalogUnitDef(staticU, def);
    }
    const patch = o.unitPatches[unitId];
    if (patch && Object.keys(patch).length > 0) {
      def = mergeCatalogUnitDef(def, patch);
    }
    def.card = { ...def.card, catalogUnitId: unitId };
    return def;
  }
  if (o.hiddenUnitIds.includes(unitId)) {
    return undefined;
  }
  const staticU = CATALOG_UNITS[unitId];
  if (!staticU) return undefined;
  let def = structuredClone(staticU);
  const patch = o.unitPatches[unitId];
  if (patch && Object.keys(patch).length > 0) {
    def = mergeCatalogUnitDef(def, patch);
  }
  def.card = { ...def.card, catalogUnitId: unitId };
  return def;
}

function mergeRoster(base: RosterSlotDef[], additions: RosterSlotDef[]): RosterSlotDef[] {
  const seen = new Set(base.map((s) => s.unitId));
  const out = [...base];
  for (const add of additions) {
    if (seen.has(add.unitId)) continue;
    seen.add(add.unitId);
    out.push(add);
  }
  return out;
}

function applyIdOrder<T extends { unitId: string }>(items: T[], order: string[]): T[] {
  if (!order.length || items.length < 2) return items;
  const rank = new Map<string, number>();
  for (let i = 0; i < order.length; i += 1) rank.set(order[i], i);
  return [...items].sort((a, b) => {
    const ra = rank.get(a.unitId);
    const rb = rank.get(b.unitId);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

export function getMergedLeader(leaderId: string): LeaderDef | undefined {
  const o = getCatalogOverrides();
  const base = o.newLeaders[leaderId] ?? LEADERS.find((l) => l.id === leaderId);
  if (!base) return undefined;
  if (!o.newLeaders[leaderId] && o.hiddenLeaderIds.includes(leaderId)) return undefined;
  const add = o.rosterAdditions[leaderId] ?? [];
  let roster = mergeRoster(base.roster, add);
  const slotPatches = o.rosterSlotPatches[leaderId];
  if (slotPatches && Object.keys(slotPatches).length > 0) {
    roster = roster.map((s) => {
      const p = slotPatches[s.unitId];
      if (!p) return s;
      const merged = { ...s } as Record<string, unknown>;
      for (const [k, v] of Object.entries(p)) {
        if (v === undefined) delete merged[k];
        else merged[k] = v;
      }
      return merged as RosterSlotDef;
    });
  }
  roster = roster.filter((s) => getMergedCatalogUnit(s.unitId) != null);
  roster = applyIdOrder(roster, o.leaderRosterOrder[leaderId] ?? []);
  let out: LeaderDef = { ...base, roster };
  if (!o.newLeaders[leaderId]) {
    const lp = o.leaderPatches[leaderId];
    if (lp && Object.keys(lp).length > 0) {
      out = { ...out, ...lp };
    }
  }
  return out;
}

export function getMergedLeadersForFaction(factionId: string): LeaderDef[] {
  const o = getCatalogOverrides();
  const staticLeaders = LEADERS.filter(
    (l) => l.factionId === factionId && !o.hiddenLeaderIds.includes(l.id),
  );
  const dynamicLeaders = Object.values(o.newLeaders).filter((l) => l.factionId === factionId);
  const seen = new Set<string>();
  const out: LeaderDef[] = [];
  for (const l of [...staticLeaders, ...dynamicLeaders]) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(getMergedLeader(l.id) ?? l);
  }
  return out;
}

export function getHotspotsForUnit(unitId: string): HotspotFile | undefined {
  if (!getMergedCatalogUnit(unitId)) return undefined;
  const o = getCatalogOverrides();
  const ov = o.hotspots[unitId];
  const st = getStaticHotspotForUnit(unitId);
  if (!ov) return st;
  const hasOvImg = !!(ov.image && String(ov.image).trim());
  if (hasOvImg) return ov;
  if (st?.image?.trim()) {
    return {
      ...st,
      ...ov,
      image: st.image,
      regions: ov.regions && ov.regions.length > 0 ? ov.regions : st.regions,
    };
  }
  return ov;
}

/** Только оверрайд из редактора (не статика из репозитория). */
export function getHotspotOverrideImage(unitId: string): string | undefined {
  const img = getCatalogOverrides().hotspots[unitId]?.image?.trim();
  return img || undefined;
}

/**
 * Когда для юнита в оверрайдах задана картинка хотспотов, не дублируем её в `card.sprite`
 * (иначе extract base64 создаёт два файла: card_sprite и image).
 * Не трогаем sprite, если редактор только что залил файл (data URL) или указал другой URL, чем у хотспотов.
 * Для `newUnit` ключ `sprite` убираем; для патча к статике нужен `sprite: ''`, иначе deepMerge оставит sprite из базы.
 */
export function finalizeCardForUnitSave(
  unitId: string,
  card: UnitCardData,
  storage: 'newUnit' | 'patch',
): UnitCardData {
  if (!card || typeof card !== 'object') return card;
  const hotImg = getHotspotOverrideImage(unitId);
  if (!hotImg?.trim()) return card;
  const spr = card.sprite?.trim() ?? '';
  if (spr.startsWith('data:image/')) return card;
  if (spr && spr !== hotImg.trim()) return card;
  if (storage === 'newUnit') {
    const { sprite: _omit, ...rest } = card;
    return rest as UnitCardData;
  }
  return { ...card, sprite: '' };
}

/** После сохранения хотспотов с картинкой — убрать дубликат art из карточки в оверрайдах. */
export function clearCardSpriteFromUnitOverrides(unitId: string): void {
  let o: CatalogOverridesV1;
  try {
    o = structuredClone(getCatalogOverrides());
  } catch (e) {
    console.warn('[catalogOverrides] structuredClone(overrides) failed; skip clearCardSprite', e);
    return;
  }
  if (!o.hotspots[unitId]?.image?.trim()) return;
  let changed = false;

  const nu = o.newUnits[unitId];
  if (nu?.card?.sprite) {
    delete nu.card.sprite;
    o.newUnits[unitId] = nu;
    changed = true;
  }

  if (!nu) {
    const p = o.unitPatches[unitId];
    if (p?.card) {
      if (p.card.sprite !== '') {
        p.card.sprite = '';
        o.unitPatches[unitId] = p;
        changed = true;
      }
    } else if (CATALOG_UNITS[unitId]?.card?.sprite) {
      o.unitPatches[unitId] = { card: { sprite: '' } } as Partial<CatalogUnitDef>;
      changed = true;
    }
  }

  if (changed) saveCatalogOverrides(o);
}

export function setHotspotsForUnit(unitId: string, file: HotspotFile | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (file === undefined) {
    delete o.hotspots[unitId];
  } else {
    o.hotspots[unitId] = file;
  }
  saveCatalogOverrides(o);
}

/**
 * Подставить сохранённый пресет раскладки (x,y,w,h) всем юнитам:
 * кубики, дальность, подписи — из данных карточки; координаты — из пресета.
 * Совпадение по числу зон **или** пресет из двух прямоугольников (защита + полоса атаки).
 */
export function applyHotspotLayoutPresetToAllUnits(
  presetId: string,
  options?: { attackStripeGap?: number },
): { applied: number; skipped: { unitId: string; reason: string }[] } {
  const snapshot = getCatalogOverrides();
  const preset = snapshot.hotspotLayoutPresets?.find((p) => p.id === presetId);
  if (!preset?.regions?.length) {
    throw new Error('Пресет не найден или не содержит прямоугольников');
  }
  const boxes = preset.regions;
  const unitIds = listAllUnitIds();
  const o = structuredClone(snapshot);
  const skipped: { unitId: string; reason: string }[] = [];
  let applied = 0;

  for (const unitId of unitIds) {
    const def = getMergedCatalogUnit(unitId);
    if (!def?.card) {
      skipped.push({ unitId, reason: 'нет карточки' });
      continue;
    }
    const semantic = buildTornscapeHotspotSemanticRegions(def.card);
    let regions: HotspotRegion[];
    try {
      regions = applyHotspotLayoutPresetBoxesToSemanticRegions(semantic, boxes, options);
    } catch (e) {
      skipped.push({
        unitId,
        reason: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const overrideH = snapshot.hotspots[unitId];
    const staticH = getStaticHotspotForUnit(unitId);
    const image =
      overrideH?.image?.trim() ||
      staticH?.image?.trim() ||
      def.card.sprite?.trim() ||
      '';
    if (!image) {
      skipped.push({ unitId, reason: 'нет URL картинки (sprite / хотспот)' });
      continue;
    }

    o.hotspots[unitId] = {
      ...(staticH ?? {}),
      ...(overrideH ?? {}),
      image,
      title: def.card.name,
      regions,
    };
    applied++;
  }

  saveCatalogOverrides(o);
  return { applied, skipped };
}

export function setUnitPatch(
  unitId: string,
  patch: (Partial<CatalogUnitDef> & { requiresCommanderUnitId?: string | null }) | undefined,
  saveOpts?: CatalogOverridesSaveOptions,
): void {
  const o = structuredClone(getCatalogOverrides());
  if (patch === undefined || Object.keys(patch).length === 0) {
    delete o.unitPatches[unitId];
  } else {
    o.unitPatches[unitId] = patch;
  }
  saveCatalogOverrides(o, saveOpts);
}

export function setNewUnit(
  unitId: string,
  def: CatalogUnitDef | undefined,
  saveOpts?: CatalogOverridesSaveOptions,
): void {
  const o = structuredClone(getCatalogOverrides());
  if (def === undefined) {
    delete o.newUnits[unitId];
  } else {
    o.newUnits[unitId] = def;
    o.hiddenUnitIds = o.hiddenUnitIds.filter((id) => id !== unitId);
  }
  saveCatalogOverrides(o, saveOpts);
}

export function setNewLeader(leaderId: string, def: LeaderDef | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (def === undefined) {
    delete o.newLeaders[leaderId];
  } else {
    o.newLeaders[leaderId] = def;
    o.hiddenLeaderIds = o.hiddenLeaderIds.filter((id) => id !== leaderId);
  }
  saveCatalogOverrides(o);
}

export function setLeaderHidden(leaderId: string, hidden: boolean): void {
  const o = structuredClone(getCatalogOverrides());
  if (hidden) {
    if (!o.hiddenLeaderIds.includes(leaderId)) o.hiddenLeaderIds.push(leaderId);
  } else {
    o.hiddenLeaderIds = o.hiddenLeaderIds.filter((id) => id !== leaderId);
  }
  saveCatalogOverrides(o);
}

export function addRosterSlot(leaderId: string, slot: RosterSlotDef): void {
  const o = structuredClone(getCatalogOverrides());
  const newLeader = o.newLeaders[leaderId];
  if (newLeader) {
    if (newLeader.roster.some((s) => s.unitId === slot.unitId)) return;
    newLeader.roster.push(slot);
    o.newLeaders[leaderId] = newLeader;
    saveCatalogOverrides(o);
    return;
  }
  const list = o.rosterAdditions[leaderId] ?? [];
  if (list.some((s) => s.unitId === slot.unitId)) return;
  list.push(slot);
  o.rosterAdditions[leaderId] = list;
  saveCatalogOverrides(o);
}

export function removeRosterAddition(leaderId: string, unitId: string): void {
  const o = structuredClone(getCatalogOverrides());
  const newLeader = o.newLeaders[leaderId];
  if (newLeader) {
    newLeader.roster = newLeader.roster.filter((s) => s.unitId !== unitId);
    o.newLeaders[leaderId] = newLeader;
  }
  const list = o.rosterAdditions[leaderId];
  if (list) {
    o.rosterAdditions[leaderId] = list.filter((s) => s.unitId !== unitId);
    if (o.rosterAdditions[leaderId]?.length === 0) delete o.rosterAdditions[leaderId];
  }
  if (o.rosterSlotPatches[leaderId]?.[unitId]) {
    delete o.rosterSlotPatches[leaderId][unitId];
    if (Object.keys(o.rosterSlotPatches[leaderId]).length === 0) delete o.rosterSlotPatches[leaderId];
  }
  saveCatalogOverrides(o);
}

/** Leader miniature points: `newLeaders` stores on def; static leaders use `leaderPatches`. */
export function setLeaderPointsOverride(leaderId: string, points: number | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (o.newLeaders[leaderId]) {
    const nl = o.newLeaders[leaderId];
    if (points === undefined) delete nl.points;
    else nl.points = points;
    o.newLeaders[leaderId] = nl;
  } else {
    if (points === undefined) {
      if (o.leaderPatches[leaderId]) {
        delete o.leaderPatches[leaderId].points;
        if (Object.keys(o.leaderPatches[leaderId]).length === 0) delete o.leaderPatches[leaderId];
      }
    } else {
      o.leaderPatches[leaderId] = { ...o.leaderPatches[leaderId], points };
    }
  }
  saveCatalogOverrides(o);
}

/**
 * Roster slot overrides: `newLeaders` edits roster entry; static leaders use `rosterSlotPatches`.
 * Pass `undefined` to remove the stored static patch for this unit. For custom leaders use `{ points: undefined }` etc. to clear fields.
 */
export function setRosterSlotPatch(
  leaderId: string,
  unitId: string,
  patch: RosterSlotFieldPatch | undefined,
): void {
  const o = structuredClone(getCatalogOverrides());
  if (patch === undefined) {
    if (o.rosterSlotPatches[leaderId]?.[unitId]) {
      delete o.rosterSlotPatches[leaderId][unitId];
      if (Object.keys(o.rosterSlotPatches[leaderId]).length === 0) delete o.rosterSlotPatches[leaderId];
    }
    saveCatalogOverrides(o);
    return;
  }
  if (o.newLeaders[leaderId]) {
    const nl = o.newLeaders[leaderId];
    const idx = nl.roster.findIndex((s) => s.unitId === unitId);
    if (idx < 0) return;
    const slot = { ...nl.roster[idx] } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete slot[k];
      else slot[k] = v;
    }
    nl.roster[idx] = slot as RosterSlotDef;
    o.newLeaders[leaderId] = nl;
  } else {
    const prev = o.rosterSlotPatches[leaderId]?.[unitId] ?? {};
    const next: RosterSlotFieldPatch = { ...prev };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k as keyof RosterSlotFieldPatch];
      else (next as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(next).length === 0) {
      if (o.rosterSlotPatches[leaderId]) {
        delete o.rosterSlotPatches[leaderId][unitId];
        if (Object.keys(o.rosterSlotPatches[leaderId]).length === 0) delete o.rosterSlotPatches[leaderId];
      }
    } else {
      o.rosterSlotPatches[leaderId] = o.rosterSlotPatches[leaderId] ?? {};
      o.rosterSlotPatches[leaderId][unitId] = next;
    }
  }
  saveCatalogOverrides(o);
}

/** All unit ids that appear only in overrides (not in static JSON files). */
export function listNewUnitIds(): string[] {
  return Object.keys(getCatalogOverrides().newUnits);
}

export function listAllUnitIds(): string[] {
  const o = getCatalogOverrides();
  const staticIds = Object.keys(CATALOG_UNITS).filter((id) => !o.hiddenUnitIds.includes(id));
  const ids = Array.from(new Set([...staticIds, ...Object.keys(o.newUnits)])).sort();
  if (!o.unitOrder.length) return ids;
  const rank = new Map<string, number>();
  for (let i = 0; i < o.unitOrder.length; i += 1) rank.set(o.unitOrder[i], i);
  return [...ids].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra == null && rb == null) return a.localeCompare(b);
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

export function setUnitLibraryOrder(unitIds: string[]): void {
  const o = structuredClone(getCatalogOverrides());
  const visible = new Set(listAllUnitIds());
  o.unitOrder = Array.from(new Set(unitIds.filter((id) => visible.has(id))));
  saveCatalogOverrides(o);
}

export function setLeaderRosterOrder(leaderId: string, unitIds: string[]): void {
  const o = structuredClone(getCatalogOverrides());
  const leader = getMergedLeader(leaderId);
  const allowed = new Set((leader?.roster ?? []).map((s) => s.unitId));
  const clean = Array.from(new Set(unitIds.filter((id) => allowed.has(id))));
  if (clean.length === 0) {
    delete o.leaderRosterOrder[leaderId];
  } else {
    o.leaderRosterOrder[leaderId] = clean;
  }
  saveCatalogOverrides(o);
}

export function listNewLeaderIds(): string[] {
  return Object.keys(getCatalogOverrides().newLeaders);
}

/** Default cap per leader when `maxCopies` omitted in data. */
export const DEFAULT_INVENTORY_MAX_COPIES = 99;

export function listNewInventoryItemIds(): string[] {
  return Object.keys(getCatalogOverrides().newInventoryItems);
}

export function listAllInventoryItemIds(): string[] {
  const o = getCatalogOverrides();
  const staticIds = Object.keys(CATALOG_INVENTORY).filter((id) => !o.hiddenInventoryIds.includes(id));
  const ids = Array.from(new Set([...staticIds, ...Object.keys(o.newInventoryItems)])).sort();
  if (!o.inventoryOrder.length) return ids;
  const rank = new Map<string, number>();
  for (let i = 0; i < o.inventoryOrder.length; i += 1) rank.set(o.inventoryOrder[i], i);
  return [...ids].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra == null && rb == null) return a.localeCompare(b);
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

export function setInventoryLibraryOrder(itemIds: string[]): void {
  const o = structuredClone(getCatalogOverrides());
  const visible = new Set(listAllInventoryItemIds());
  o.inventoryOrder = Array.from(new Set(itemIds.filter((id) => visible.has(id))));
  saveCatalogOverrides(o);
}

export function setNewInventoryItem(itemId: string, def: InventoryItemDef | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (def === undefined) {
    delete o.newInventoryItems[itemId];
  } else {
    o.newInventoryItems[itemId] = def;
    o.hiddenInventoryIds = o.hiddenInventoryIds.filter((id) => id !== itemId);
  }
  saveCatalogOverrides(o);
}

export function setInventoryPatch(itemId: string, patch: Partial<InventoryItemDef> | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (patch === undefined || Object.keys(patch).length === 0) {
    delete o.inventoryPatches[itemId];
  } else {
    o.inventoryPatches[itemId] = patch;
  }
  saveCatalogOverrides(o);
}

export function setGodCardPatch(cardId: string, patch: GodCardPatch | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (patch === undefined || Object.keys(patch).length === 0) {
    delete o.godCardPatches[cardId];
  } else {
    o.godCardPatches[cardId] = patch;
  }
  saveCatalogOverrides(o);
}

export function setInventoryHidden(itemId: string, hidden: boolean): void {
  const o = structuredClone(getCatalogOverrides());
  if (hidden) {
    if (!o.hiddenInventoryIds.includes(itemId)) o.hiddenInventoryIds.push(itemId);
  } else {
    o.hiddenInventoryIds = o.hiddenInventoryIds.filter((id) => id !== itemId);
  }
  saveCatalogOverrides(o);
}

export function removeInventoryItemEverywhere(itemId: string): void {
  const o = structuredClone(getCatalogOverrides());
  delete o.newInventoryItems[itemId];
  delete o.inventoryPatches[itemId];
  o.inventoryOrder = (o.inventoryOrder ?? []).filter((id) => id !== itemId);
  if (CATALOG_INVENTORY[itemId]) {
    if (!o.hiddenInventoryIds.includes(itemId)) o.hiddenInventoryIds.push(itemId);
  } else {
    o.hiddenInventoryIds = o.hiddenInventoryIds.filter((id) => id !== itemId);
  }
  saveCatalogOverrides(o);
}

export function createStubInventoryItem(
  id: string,
  name: string,
  points: number,
  sprite: string,
): InventoryItemDef {
  return {
    id,
    name,
    points,
    sprite: sprite || '/',
  };
}

export function removeUnitEverywhere(unitId: string): void {
  const o = structuredClone(getCatalogOverrides());
  delete o.newUnits[unitId];
  delete o.unitPatches[unitId];
  delete o.hotspots[unitId];
  for (const leaderId of Object.keys(o.rosterAdditions)) {
    const next = o.rosterAdditions[leaderId].filter((s) => s.unitId !== unitId);
    if (next.length === 0) delete o.rosterAdditions[leaderId];
    else o.rosterAdditions[leaderId] = next;
  }
  for (const leader of Object.values(o.newLeaders)) {
    leader.roster = leader.roster.filter((s) => s.unitId !== unitId);
  }
  for (const lid of Object.keys(o.rosterSlotPatches)) {
    if (o.rosterSlotPatches[lid][unitId]) {
      delete o.rosterSlotPatches[lid][unitId];
      if (Object.keys(o.rosterSlotPatches[lid]).length === 0) delete o.rosterSlotPatches[lid];
    }
  }
  if (CATALOG_UNITS[unitId]) {
    if (!o.hiddenUnitIds.includes(unitId)) o.hiddenUnitIds.push(unitId);
  } else {
    o.hiddenUnitIds = o.hiddenUnitIds.filter((id) => id !== unitId);
  }
  o.unitOrder = (o.unitOrder ?? []).filter((id) => id !== unitId);
  for (const leaderId of Object.keys(o.leaderRosterOrder ?? {})) {
    const next = (o.leaderRosterOrder[leaderId] ?? []).filter((id) => id !== unitId);
    if (next.length === 0) delete o.leaderRosterOrder[leaderId];
    else o.leaderRosterOrder[leaderId] = next;
  }
  saveCatalogOverrides(o);
}

export function removeLeaderEverywhere(leaderId: string): void {
  const o = structuredClone(getCatalogOverrides());
  const isStatic = LEADERS.some((l) => l.id === leaderId);
  delete o.newLeaders[leaderId];
  delete o.rosterAdditions[leaderId];
  delete o.leaderPatches[leaderId];
  delete o.rosterSlotPatches[leaderId];
  if (isStatic) {
    if (!o.hiddenLeaderIds.includes(leaderId)) o.hiddenLeaderIds.push(leaderId);
  } else {
    o.hiddenLeaderIds = o.hiddenLeaderIds.filter((id) => id !== leaderId);
  }
  delete o.leaderRosterOrder[leaderId];
  saveCatalogOverrides(o);
}

/** Minimal stub for creating a new catalog unit in the editor. */
export function createStubCatalogUnit(id: string, name: string, points: number, cloneFrom?: CatalogUnitDef): CatalogUnitDef {
  if (cloneFrom) {
    const c = structuredClone(cloneFrom);
    c.id = id;
    c.points = points;
    c.card = { ...c.card, name };
    return c;
  }
  const card: UnitCardData = {
    name,
    size: 'small',
    health: 1,
    maxHealth: 1,
    defense: {},
    walk: 1,
    run: 2,
    domains: ['life'],
    concentration: {},
    defenseReaction: {},
    attacks: [],
    keywords: [],
  };
  return { id, points, card };
}
