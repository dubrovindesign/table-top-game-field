/**
 * Army Builder catalog: factions (with domain), leaders, roster slots (maxCopies), unit definitions.
 * Data lives in `src/catalog/*.json`; see `src/catalog/index.ts`.
 */

import { CATALOG_UNITS, FACTIONS, LEADERS } from './catalog';
import { getMergedCatalogUnit, getMergedLeader, getMergedLeadersForFaction } from './catalog/catalogOverrides';
import type {
  CatalogUnitDef,
  FactionDef,
  LeaderDef,
  RosterSlotDef,
} from './catalog/types';
import type { UnitCardData } from './unitCard';

export type { CatalogUnitDef, FactionDef, LeaderDef, RosterSlotDef };

/** Default army points limit (panel lets user pick 200 / 300 / 400). */
export const ARMY_POINTS_CAP = 300;

/** Max models of a given leader mini on the board (per leader id + catalog id). */
export const LEADER_MINI_MAX_COPIES = 1;

export { CATALOG_UNITS, FACTIONS, LEADERS };

export function getCatalogUnit(unitId: string): CatalogUnitDef | undefined {
  return getMergedCatalogUnit(unitId);
}

export function leadersForFaction(factionId: string): LeaderDef[] {
  return getMergedLeadersForFaction(factionId);
}

export function getLeader(leaderId: string): LeaderDef | undefined {
  return getMergedLeader(leaderId);
}

export function getFaction(factionId: string): FactionDef | undefined {
  return FACTIONS.find((f) => f.id === factionId);
}

/** Points counted toward the army cap when this catalog unit is placed for the given leader. */
export function rosterSpawnPoints(leaderId: string, catalogUnitId: string): number {
  const def = getCatalogUnit(catalogUnitId);
  if (!def) return 0;
  const leader = getLeader(leaderId);
  if (leader && leader.catalogUnitId === catalogUnitId && leader.points !== undefined) {
    return leader.points;
  }
  if (leader) {
    const slot = leader.roster.find((s) => s.unitId === catalogUnitId);
    if (slot && slot.points !== undefined) {
      return slot.points;
    }
  }
  return def.points;
}

export type RosterRowView = {
  unitId: string;
  name: string;
  points: number;
  maxCopies: number;
  used: number;
  card: UnitCardData;
  /** When true, the slot is listed but cannot be dragged (missing `requiresUnitId` model). */
  rosterBlocked?: boolean;
  rosterBlockedReason?: string;
};

export function listRosterRows(
  leaderId: string,
  searchQuery: string,
  usedCount: (leaderId: string, unitId: string) => number,
): RosterRowView[] {
  const leader = getLeader(leaderId);
  if (!leader) return [];
  const q = searchQuery.trim().toLowerCase();
  const rows: RosterRowView[] = [];
  for (const slot of leader.roster) {
    const def = getCatalogUnit(slot.unitId);
    if (!def) continue;
    const kw = def.card.keywords?.join(' ') ?? '';
    const hay = `${def.card.name} ${kw}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    let rosterBlocked = false;
    let rosterBlockedReason: string | undefined;
    if (slot.requiresUnitId) {
      if (usedCount(leaderId, slot.requiresUnitId) < 1) {
        rosterBlocked = true;
        rosterBlockedReason = 'Сначала добавьте в армию миниатюру, от которой зависит этот слот';
      }
    }
    rows.push({
      unitId: slot.unitId,
      name: def.card.name,
      points: rosterSpawnPoints(leaderId, slot.unitId),
      maxCopies: slot.maxCopies,
      used: usedCount(leaderId, slot.unitId),
      card: def.card,
      rosterBlocked,
      rosterBlockedReason,
    });
  }
  return rows;
}

export function maxCopiesForSlot(leaderId: string, unitId: string): number | null {
  const leader = getLeader(leaderId);
  if (!leader) return null;
  const slot = leader.roster.find((s) => s.unitId === unitId);
  return slot ? slot.maxCopies : null;
}

export function isLeaderCatalogUnitForLeader(leaderId: string, unitId: string): boolean {
  const leader = getLeader(leaderId);
  return leader !== undefined && leader.catalogUnitId === unitId;
}
