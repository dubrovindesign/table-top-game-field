/**
 * Army catalog types (shared by JSON-backed data and `armyCatalog` helpers).
 */

import type { Domain, UnitCardData } from '../unitCard';

export type FactionDef = {
  id: string;
  name: string;
  domain: Domain;
  /** Faction emblem in the army panel filter row (`public/` path). */
  panelIconSrc: string;
};

export type RosterSlotDef = {
  unitId: string;
  maxCopies: number;
  /**
   * If set, this roster slot is available only while at least one model of `requiresUnitId`
   * is already in the army for the same leader (spawned from the army panel).
   */
  requiresUnitId?: string;
};

export type LeaderDef = {
  id: string;
  name: string;
  factionId: string;
  /** Placeable leader miniature in `CATALOG_UNITS` (same stats row as troops in the panel). */
  catalogUnitId: string;
  /**
   * Points charged for the leader miniature toward the army cap.
   * If omitted, `CATALOG_UNITS[catalogUnitId].points` is used.
   */
  points?: number;
  roster: RosterSlotDef[];
};

export type CatalogUnitDef = {
  id: string;
  points: number;
  card: UnitCardData;
};
