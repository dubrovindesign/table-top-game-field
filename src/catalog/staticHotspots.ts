/**
 * Hotspot JSON files shipped with the catalog (`src/catalog/hotspots/<unitId>.json`).
 * Runtime overrides in localStorage still win (see `getHotspotsForUnit`).
 */

import type { HotspotFile } from './hotspotTypes';

const hotspotModules = import.meta.glob('./hotspots/*.json', { eager: true }) as Record<string, unknown>;

function mergeHotspotRecords(modules: Record<string, unknown>): Record<string, HotspotFile> {
  const out: Record<string, HotspotFile> = {};
  for (const filePath of Object.keys(modules)) {
    const mod = modules[filePath] as { default?: HotspotFile } | HotspotFile;
    const entry: HotspotFile =
      mod !== null && typeof mod === 'object' && 'default' in mod && mod.default !== undefined
        ? (mod as { default: HotspotFile }).default
        : (mod as HotspotFile);
    const m = filePath.match(/\.\/hotspots\/([^/]+)\.json$/);
    const id = m?.[1];
    if (!id || !entry || typeof entry !== 'object') continue;
    if (out[id] !== undefined) {
      throw new Error(`[catalog] duplicate hotspot unit id: ${id} (${filePath})`);
    }
    out[id] = entry;
  }
  return out;
}

const STATIC_HOTSPOTS = mergeHotspotRecords(hotspotModules);

export function getStaticHotspotForUnit(unitId: string): HotspotFile | undefined {
  return STATIC_HOTSPOTS[unitId];
}
