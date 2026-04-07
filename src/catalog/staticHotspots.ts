/**
 * Hotspot data from `catalog-data.json` (built from `src/catalog/hotspots/*.json`).
 * Runtime overrides in localStorage still win (see `getHotspotsForUnit`).
 */

import type { HotspotFile } from './hotspotTypes';

let staticHotspots: Record<string, HotspotFile> = {};

export function setStaticHotspots(map: Record<string, HotspotFile>): void {
  staticHotspots = map;
}

export function getStaticHotspotForUnit(unitId: string): HotspotFile | undefined {
  return staticHotspots[unitId];
}
