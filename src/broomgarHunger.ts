/**
 * Орда брумгаров: индикатор «голод / нейтраль / разгул» на миниатюре (циклическое переключение).
 */

import { getLeader } from './armyCatalog';

export const BROOMGAR_HORDE_FACTION_ID = 'broomgar_horde';

/** 0 = голод, 1 = нейтраль, 2 = разгул */
export type BroomgarHungerPhase = 0 | 1 | 2;

const PHASE_COLORS: [string, string, string] = ['#2563eb', '#94a3b8', '#dc2626'];

export function broomgarHungerPhaseFillColor(phase: BroomgarHungerPhase): string {
  return PHASE_COLORS[phase];
}

export function isBroomgarRosterLeader(rosterLeaderId: string | undefined): boolean {
  if (!rosterLeaderId) return false;
  return getLeader(rosterLeaderId)?.factionId === BROOMGAR_HORDE_FACTION_ID;
}

export function parseBroomgarHungerPhase(raw: unknown): BroomgarHungerPhase | undefined {
  if (raw === 0 || raw === 1 || raw === 2) return raw;
  return undefined;
}

export function nextBroomgarHungerPhase(phase: BroomgarHungerPhase): BroomgarHungerPhase {
  return (((phase + 1) % 3) as 0 | 1 | 2) as BroomgarHungerPhase;
}
