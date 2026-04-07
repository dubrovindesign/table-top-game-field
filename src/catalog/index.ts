/**
 * Loads army catalog from JSON under `src/catalog/units/` (one unit per file).
 * Add a new `units/<unitId>.json` — registration is automatic via `import.meta.glob`.
 */

import type { CatalogUnitDef, FactionDef, LeaderDef } from './types';

import factionsJson from './factions.json';
import leadersJson from './leaders.json';

function mergeUnitRecordsFromGlob(
  modules: Record<string, unknown>,
): Record<string, CatalogUnitDef> {
  const out: Record<string, CatalogUnitDef> = {};
  for (const path of Object.keys(modules)) {
    const mod = modules[path] as { default?: CatalogUnitDef } | CatalogUnitDef;
    const entry: CatalogUnitDef =
      mod !== null && typeof mod === 'object' && 'default' in mod && mod.default !== undefined
        ? (mod as { default: CatalogUnitDef }).default
        : (mod as CatalogUnitDef);
    if (!entry || typeof entry.id !== 'string') {
      throw new Error(`[catalog] invalid unit module (missing id): ${path}`);
    }
    const key = entry.id;
    if (out[key] !== undefined) {
      throw new Error(`[catalog] duplicate unit id: ${key} (${path})`);
    }
    out[key] = entry;
  }
  return out;
}

const unitModules = import.meta.glob('./units/*.json', { eager: true }) as Record<string, unknown>;

export const FACTIONS = factionsJson as FactionDef[];
export const LEADERS = leadersJson as LeaderDef[];

export const CATALOG_UNITS: Record<string, CatalogUnitDef> = mergeUnitRecordsFromGlob(unitModules);
