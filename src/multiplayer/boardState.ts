/**
 * JSON-serializable board snapshot v1 (units, terrain, god cards, etc.).
 */

import type { GodTablePiece } from '../godCards.ts';
import type { UnitCardData } from '../unitCard.ts';

export type SerializedHex = { q: number; r: number };
export type SerializedPoint = { x: number; y: number };

export type SerializedUnit = {
  position: SerializedHex;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

export type SerializedBigMini = {
  center: SerializedHex;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

export type SerializedLargeMini = {
  anchor: SerializedHex;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

export type SerializedHugeMini = {
  anchor: SerializedHex;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

export type SerializedEtherVortex = {
  center: SerializedHex;
  etherCrystals: number;
  domain: 'life' | 'creation' | 'death' | 'destruction' | null;
  offBoardWorld?: SerializedPoint;
};

export type SerializedBoardStateV1 = {
  v: 1;
  units: SerializedUnit[];
  unitCardData: UnitCardData[];
  bigMiniatures: SerializedBigMini[];
  bigMiniCardData: UnitCardData[];
  largeMiniatures: SerializedLargeMini[];
  largeMiniCardData: UnitCardData[];
  hugeMiniatures: SerializedHugeMini[];
  hugeMiniCardData: UnitCardData[];
  terrains: SerializedHex[];
  terrainOffBoardWorlds: Array<SerializedPoint | undefined>;
  terrainRotationDeg: number;
  etherVortexes: SerializedEtherVortex[];
  godTablePieces: GodTablePiece[];
};

function isHex(o: unknown): o is SerializedHex {
  if (!o || typeof o !== 'object') return false;
  const x = o as SerializedHex;
  return typeof x.q === 'number' && typeof x.r === 'number';
}

export function isSerializedBoardStateV1(raw: unknown): raw is SerializedBoardStateV1 {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as SerializedBoardStateV1;
  if (o.v !== 1) return false;
  if (!Array.isArray(o.units) || !Array.isArray(o.unitCardData)) return false;
  if (!Array.isArray(o.bigMiniatures) || !Array.isArray(o.bigMiniCardData)) return false;
  if (!Array.isArray(o.largeMiniatures) || !Array.isArray(o.largeMiniCardData)) return false;
  if (!Array.isArray(o.hugeMiniatures) || !Array.isArray(o.hugeMiniCardData)) return false;
  if (!Array.isArray(o.terrains) || !Array.isArray(o.terrainOffBoardWorlds)) return false;
  if (typeof o.terrainRotationDeg !== 'number') return false;
  if (!Array.isArray(o.etherVortexes) || !Array.isArray(o.godTablePieces)) return false;
  for (const u of o.units) {
    if (!u || typeof u !== 'object') return false;
    if (!isHex(u.position)) return false;
    const em = (u as { effectMarkers?: unknown }).effectMarkers;
    if (em != null && !Array.isArray(em)) return false;
  }
  for (const t of o.terrains) {
    if (!isHex(t)) return false;
  }
  return true;
}
