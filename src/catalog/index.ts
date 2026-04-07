/**
 * Army catalog loaded at runtime from `public/generated/catalog-data.json`
 * (see `scripts/build-catalog-bundle.mjs`, run from Vite `buildStart` / dev server).
 */

import type { CatalogUnitDef, FactionDef, LeaderDef } from './types';
import type { HotspotFile } from './hotspotTypes';
import { setStaticHotspots } from './staticHotspots';

export let FACTIONS: FactionDef[] = [];
export let LEADERS: LeaderDef[] = [];
export let CATALOG_UNITS: Record<string, CatalogUnitDef> = {};

let loadPromise: Promise<void> | null = null;

type CatalogBundleV1 = {
  schemaVersion: 1;
  factions: FactionDef[];
  leaders: LeaderDef[];
  units: Record<string, CatalogUnitDef>;
  hotspots: Record<string, HotspotFile>;
};

export function loadCatalogBundle(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const base = import.meta.env.BASE_URL;
    const url = `${base}generated/catalog-data.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[catalog] failed to load bundle (${res.status}): ${url}`);
    }
    const data = (await res.json()) as CatalogBundleV1;
    if (data.schemaVersion !== 1) {
      throw new Error(`[catalog] unsupported bundle schema: ${String((data as { schemaVersion?: unknown }).schemaVersion)}`);
    }
    FACTIONS = data.factions;
    LEADERS = data.leaders;
    CATALOG_UNITS = data.units;
    setStaticHotspots(data.hotspots ?? {});
  })();
  return loadPromise;
}
