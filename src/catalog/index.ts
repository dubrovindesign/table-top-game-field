/**
 * Loads army catalog from JSON under `src/catalog/`.
 * Add new unit files to `mergeUnitRecords` below (or split imports as the roster grows).
 */

import type { CatalogUnitDef, FactionDef, LeaderDef } from './types';

import factionsJson from './factions.json';
import leadersJson from './leaders.json';
import unitsAshSylvan from './units/ash_sylvan.json';
import unitsIronBloodWild from './units/iron_blood_wild.json';
import unitsTernLine from './units/tern_line.json';
import unitsUmbralVeil from './units/umbral_veil.json';

function mergeUnitRecords(
  ...records: readonly Record<string, CatalogUnitDef>[]
): Record<string, CatalogUnitDef> {
  const out: Record<string, CatalogUnitDef> = {};
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (out[key] !== undefined) {
        throw new Error(`[catalog] duplicate unit id: ${key}`);
      }
      const entry = rec[key];
      if (entry.id !== key) {
        throw new Error(`[catalog] unit object key "${key}" must match entry.id "${entry.id}"`);
      }
      out[key] = entry;
    }
  }
  return out;
}

export const FACTIONS = factionsJson as FactionDef[];
export const LEADERS = leadersJson as LeaderDef[];

export const CATALOG_UNITS: Record<string, CatalogUnitDef> = mergeUnitRecords(
  unitsTernLine as Record<string, CatalogUnitDef>,
  unitsAshSylvan as Record<string, CatalogUnitDef>,
  unitsUmbralVeil as Record<string, CatalogUnitDef>,
  unitsIronBloodWild as Record<string, CatalogUnitDef>,
);
