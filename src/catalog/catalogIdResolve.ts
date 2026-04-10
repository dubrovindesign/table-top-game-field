/**
 * Приводит ключи оверрайдов к каноническим id лидеров и юнитов (как в leaders.json и src/catalog/units).
 * Учитывает: catalogUnitId лидера, имя карточки, папку в URL sprite (/catalog-units/<id>/), id-aliases.json.
 */

import type { CatalogUnitDef, LeaderDef, RosterSlotDef } from './types';
import type { CatalogOverridesV1 } from './catalogOverrides';
import idAliases from './data/id-aliases.json';

type IdAliasesFile = {
  leaderAliases?: Record<string, string>;
  unitAliases?: Record<string, string>;
};

const EXTRA_LEADER = (idAliases as IdAliasesFile).leaderAliases ?? {};
const EXTRA_UNIT = (idAliases as IdAliasesFile).unitAliases ?? {};

export type IdResolveContext = {
  leaders: LeaderDef[];
  units: Record<string, CatalogUnitDef>;
};

function buildLeaderResolver(ctx: IdResolveContext): (key: string) => string {
  const byId = new Set<string>();
  const byCatalogUnitId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const l of ctx.leaders) {
    byId.add(l.id);
    if (!byCatalogUnitId.has(l.catalogUnitId)) byCatalogUnitId.set(l.catalogUnitId, l.id);
    if (!byName.has(l.name)) byName.set(l.name, l.id);
  }
  return (key: string) => {
    if (byId.has(key)) return key;
    const ex = EXTRA_LEADER[key];
    if (ex) return ex;
    const fromC = byCatalogUnitId.get(key);
    if (fromC) return fromC;
    const fromN = byName.get(key);
    if (fromN) return fromN;
    return key;
  };
}

function buildUnitResolver(ctx: IdResolveContext): (key: string) => string {
  const byId = new Set(Object.keys(ctx.units));
  const byName = new Map<string, string>();
  const bySpriteFolder = new Map<string, string>();
  for (const [id, u] of Object.entries(ctx.units)) {
    const nm = u.card?.name;
    if (typeof nm === 'string' && nm.length > 0 && !byName.has(nm)) byName.set(nm, id);
    const sp = u.card?.sprite;
    if (typeof sp === 'string') {
      const m = sp.match(/\/catalog-units\/([^/]+)\//);
      if (m && !bySpriteFolder.has(m[1])) bySpriteFolder.set(m[1], id);
    }
  }
  return (key: string) => {
    if (byId.has(key)) return key;
    const ex = EXTRA_UNIT[key];
    if (ex) return ex;
    const fromF = bySpriteFolder.get(key);
    if (fromF) return fromF;
    const fromN = byName.get(key);
    if (fromN) return fromN;
    return key;
  };
}

/** Deep-merge plain objects; arrays / primitives from patch replace (как в catalogOverrides). */
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

export type NormalizeIdsResult = {
  normalized: CatalogOverridesV1;
  changed: boolean;
  renames: { leaders: string[]; units: string[] };
};

/**
 * Нормализует ключи и вложенные unitId там, где они могли уехать в «имя папки» или отображаемое имя.
 */
export function normalizeCatalogOverridesV1(
  o: CatalogOverridesV1,
  ctx: IdResolveContext,
): NormalizeIdsResult {
  const resolveLeader = buildLeaderResolver(ctx);
  const resolveUnit = buildUnitResolver(ctx);

  const renames = { leaders: [] as string[], units: [] as string[] };
  const trackL = (from: string, to: string) => {
    if (from !== to) renames.leaders.push(`${from} → ${to}`);
  };
  const trackU = (from: string, to: string) => {
    if (from !== to) renames.units.push(`${from} → ${to}`);
  };

  const wrapL = (k: string) => {
    const to = resolveLeader(k);
    trackL(k, to);
    return to;
  };
  const wrapU = (k: string) => {
    const to = resolveUnit(k);
    trackU(k, to);
    return to;
  };

  const next: CatalogOverridesV1 = JSON.parse(JSON.stringify(o)) as CatalogOverridesV1;

  // unitPatches: ключ = unit id
  {
    const acc: CatalogOverridesV1['unitPatches'] = {};
    for (const [k, patch] of Object.entries(next.unitPatches ?? {})) {
      const nk = wrapU(k);
      const p = patch as CatalogOverridesV1['unitPatches'][string];
      if (acc[nk] != null) {
        acc[nk] =
          p != null && Object.keys(p).length > 0
            ? (deepMerge(acc[nk] as object, p as object) as CatalogOverridesV1['unitPatches'][string])
            : acc[nk];
      } else {
        acc[nk] = p;
      }
    }
    next.unitPatches = acc;
  }

  // newUnits
  {
    const acc: CatalogOverridesV1['newUnits'] = {};
    for (const [k, def] of Object.entries(next.newUnits ?? {})) {
      const nk = wrapU(k);
      const merged = acc[nk];
      acc[nk] =
        merged != null && def != null
          ? (deepMerge(merged as object, def as object) as CatalogOverridesV1['newUnits'][string])
          : def;
      if (acc[nk]?.card) {
        acc[nk] = {
          ...acc[nk],
          card: { ...acc[nk]!.card, catalogUnitId: nk },
        } as CatalogOverridesV1['newUnits'][string];
      }
    }
    next.newUnits = acc;
  }

  // hotspots
  {
    const acc: CatalogOverridesV1['hotspots'] = {};
    for (const [k, hf] of Object.entries(next.hotspots ?? {})) {
      acc[wrapU(k)] = hf;
    }
    next.hotspots = acc;
  }

  next.unitOrder = next.unitOrder?.length ? [...new Set(next.unitOrder.map(wrapU))] : next.unitOrder;

  // rosterSlotPatches
  {
    const acc: CatalogOverridesV1['rosterSlotPatches'] = {};
    for (const [lk, inner] of Object.entries(next.rosterSlotPatches ?? {})) {
      const lid = wrapL(lk);
      acc[lid] = acc[lid] ?? {};
      for (const [uk, patch] of Object.entries(inner)) {
        const uid = wrapU(uk);
        const prev = acc[lid][uid];
        acc[lid][uid] =
          prev != null && patch != null && Object.keys(patch).length > 0
            ? { ...prev, ...patch }
            : patch ?? prev;
      }
    }
    next.rosterSlotPatches = acc;
  }

  // leaderPatches
  {
    const acc: CatalogOverridesV1['leaderPatches'] = {};
    for (const [k, p] of Object.entries(next.leaderPatches ?? {})) {
      const lid = wrapL(k);
      acc[lid] = acc[lid] != null && p != null ? { ...acc[lid], ...p } : (p ?? acc[lid]);
    }
    next.leaderPatches = acc;
  }

  // rosterAdditions
  {
    const acc: CatalogOverridesV1['rosterAdditions'] = {};
    for (const [lk, slots] of Object.entries(next.rosterAdditions ?? {})) {
      const lid = wrapL(lk);
      const merged = [...(acc[lid] ?? []), ...(slots ?? [])];
      const seen = new Set<string>();
      const out: RosterSlotDef[] = [];
      for (const s of merged) {
        const uid = wrapU(s.unitId);
        if (seen.has(uid)) continue;
        seen.add(uid);
        out.push({ ...s, unitId: uid });
      }
      acc[lid] = out;
    }
    next.rosterAdditions = acc;
  }

  // leaderRosterOrder
  {
    const acc: CatalogOverridesV1['leaderRosterOrder'] = {};
    for (const [lk, order] of Object.entries(next.leaderRosterOrder ?? {})) {
      acc[wrapL(lk)] = order.map(wrapU);
    }
    next.leaderRosterOrder = acc;
  }

  next.hiddenLeaderIds = next.hiddenLeaderIds?.length ? [...new Set(next.hiddenLeaderIds.map(wrapL))] : next.hiddenLeaderIds;
  next.hiddenUnitIds = next.hiddenUnitIds?.length ? [...new Set(next.hiddenUnitIds.map(wrapU))] : next.hiddenUnitIds;

  // newLeaders
  {
    const acc: CatalogOverridesV1['newLeaders'] = {};
    for (const [k, L] of Object.entries(next.newLeaders ?? {})) {
      const lid = wrapL(k);
      const rosterMapped = (L.roster ?? []).map((s) => ({ ...s, unitId: wrapU(s.unitId) }));
      const prev = acc[lid];
      if (!prev) {
        acc[lid] = { ...L, id: lid, roster: rosterMapped } as CatalogOverridesV1['newLeaders'][string];
        continue;
      }
      const seen = new Set(prev.roster.map((s) => s.unitId));
      const extra = rosterMapped.filter((s) => !seen.has(s.unitId));
      acc[lid] = {
        ...prev,
        ...L,
        id: lid,
        roster: [...prev.roster, ...extra],
      } as CatalogOverridesV1['newLeaders'][string];
    }
    next.newLeaders = acc;
  }

  // leaderGodDeckMax (при коллизии ключей — последнее значение)
  {
    const acc: CatalogOverridesV1['leaderGodDeckMax'] = {};
    for (const [k, v] of Object.entries(next.leaderGodDeckMax ?? {})) {
      acc[wrapL(k)] = v;
    }
    next.leaderGodDeckMax = acc;
  }

  const changed = JSON.stringify(o) !== JSON.stringify(next);
  return { normalized: next, changed, renames };
}
