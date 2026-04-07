/**
 * Runtime catalog overrides: localStorage + import/export JSON.
 * Merged with static `CATALOG_UNITS` / `LEADERS` in `armyCatalog.ts`.
 */

import { CATALOG_UNITS, LEADERS } from './index';
import type { CatalogUnitDef, LeaderDef, RosterSlotDef } from './types';
import type { HotspotFile } from './hotspotTypes';
import type { UnitCardData } from '../unitCard';

export const CATALOG_OVERRIDES_STORAGE_KEY = 'hexBoard_catalogOverrides_v1';

export const CATALOG_OVERRIDES_CHANGED = 'hexBoard:catalog-overrides-changed';

export type LeaderPointsPatch = Partial<Pick<LeaderDef, 'points'>>;

export type RosterSlotFieldPatch = Partial<
  Pick<RosterSlotDef, 'points' | 'maxCopies' | 'requiresUnitId'>
>;

export type CatalogOverridesV1 = {
  version: 1;
  unitPatches: Record<string, Partial<CatalogUnitDef>>;
  newUnits: Record<string, CatalogUnitDef>;
  newLeaders: Record<string, LeaderDef>;
  hiddenLeaderIds: string[];
  rosterAdditions: Record<string, RosterSlotDef[]>;
  /** Static leaders only: override `points` for the leader miniature. */
  leaderPatches: Record<string, LeaderPointsPatch>;
  /** Static leaders only: per-slot overrides merged after base roster + additions. */
  rosterSlotPatches: Record<string, Record<string, RosterSlotFieldPatch>>;
  hotspots: Record<string, HotspotFile>;
};

function emptyOverrides(): CatalogOverridesV1 {
  return {
    version: 1,
    unitPatches: {},
    newUnits: {},
    newLeaders: {},
    hiddenLeaderIds: [],
    rosterAdditions: {},
    leaderPatches: {},
    rosterSlotPatches: {},
    hotspots: {},
  };
}

let cache: CatalogOverridesV1 | null = null;

function notifyChanged(): void {
  window.dispatchEvent(new CustomEvent(CATALOG_OVERRIDES_CHANGED));
}

export function getCatalogOverrides(): CatalogOverridesV1 {
  if (cache) return cache;
  cache = loadCatalogOverridesFromStorage();
  return cache;
}

export function loadCatalogOverridesFromStorage(): CatalogOverridesV1 {
  try {
    const raw = localStorage.getItem(CATALOG_OVERRIDES_STORAGE_KEY);
    if (!raw) return emptyOverrides();
    const o = JSON.parse(raw) as Partial<CatalogOverridesV1>;
    if (o.version !== 1 || typeof o !== 'object' || o === null) return emptyOverrides();
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
    };
  } catch {
    return emptyOverrides();
  }
}

export function saveCatalogOverrides(overrides: CatalogOverridesV1): void {
  cache = overrides;
  try {
    localStorage.setItem(CATALOG_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('[catalogOverrides] localStorage save failed', e);
  }
  notifyChanged();
}

export function resetCatalogOverrides(): void {
  cache = emptyOverrides();
  try {
    localStorage.removeItem(CATALOG_OVERRIDES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifyChanged();
}

export function exportCatalogOverridesJson(): string {
  return JSON.stringify(getCatalogOverrides(), null, 2);
}

export function importCatalogOverridesJson(text: string): { ok: true } | { ok: false; error: string } {
  try {
    const o = JSON.parse(text) as Partial<CatalogOverridesV1>;
    if (o.version !== 1) return { ok: false, error: 'Ожидается version: 1' };
    const merged: CatalogOverridesV1 = {
      version: 1,
      unitPatches: (o.unitPatches ?? {}) as Record<string, Partial<CatalogUnitDef>>,
      newUnits: (o.newUnits ?? {}) as Record<string, CatalogUnitDef>,
      newLeaders: (o.newLeaders ?? {}) as Record<string, LeaderDef>,
      hiddenLeaderIds: Array.isArray(o.hiddenLeaderIds)
        ? o.hiddenLeaderIds.filter((id): id is string => typeof id === 'string')
        : [],
      rosterAdditions: (o.rosterAdditions ?? {}) as Record<string, RosterSlotDef[]>,
      leaderPatches: (o.leaderPatches ?? {}) as Record<string, LeaderPointsPatch>,
      rosterSlotPatches: (o.rosterSlotPatches ?? {}) as Record<string, Record<string, RosterSlotFieldPatch>>,
      hotspots: (o.hotspots ?? {}) as Record<string, HotspotFile>,
    };
    saveCatalogOverrides(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

function mergeCatalogUnitDef(base: CatalogUnitDef, patch: Partial<CatalogUnitDef>): CatalogUnitDef {
  return deepMerge(base, patch);
}

/**
 * Effective unit: static catalog, optional full override in `newUnits`, then `unitPatches`.
 */
export function getMergedCatalogUnit(unitId: string): CatalogUnitDef | undefined {
  const o = getCatalogOverrides();
  const staticU = CATALOG_UNITS[unitId];
  const nu = o.newUnits[unitId];
  let def: CatalogUnitDef | undefined;
  if (nu) {
    def = structuredClone(nu);
  } else if (staticU) {
    def = structuredClone(staticU);
  } else {
    return undefined;
  }
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
  return getCatalogOverrides().hotspots[unitId];
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

export function setUnitPatch(unitId: string, patch: Partial<CatalogUnitDef> | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (patch === undefined || Object.keys(patch).length === 0) {
    delete o.unitPatches[unitId];
  } else {
    o.unitPatches[unitId] = patch;
  }
  saveCatalogOverrides(o);
}

export function setNewUnit(unitId: string, def: CatalogUnitDef | undefined): void {
  const o = structuredClone(getCatalogOverrides());
  if (def === undefined) {
    delete o.newUnits[unitId];
  } else {
    o.newUnits[unitId] = def;
  }
  saveCatalogOverrides(o);
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
  return Array.from(new Set([...Object.keys(CATALOG_UNITS), ...Object.keys(o.newUnits)])).sort();
}

export function listNewLeaderIds(): string[] {
  return Object.keys(getCatalogOverrides().newLeaders);
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
