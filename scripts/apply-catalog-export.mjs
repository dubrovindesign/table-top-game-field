#!/usr/bin/env node
/**
 * Applies `hex-board-catalog-overrides.json` (from catalog editor export) into the repo:
 * - newUnits + unitPatches → src/catalog/units/<id>.json (same merge rules as catalogOverrides.getMergedCatalogUnit)
 * - newLeaders + rosterAdditions + rosterSlotPatches + leaderPatches + hiddenLeaderIds
 *   → src/catalog/leaders.json (same merge rules as catalogOverrides.getMergedLeader)
 * - hotspots → src/catalog/hotspots/<unitId>.json (loaded at build time; localStorage overrides still win)
 *
 * Usage:
 *   npm run catalog:apply -- <overrides.json>
 *   npm run catalog:apply -- --dry-run <overrides.json>
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
const leadersPath = path.join(repoRoot, 'src', 'catalog', 'leaders.json');

function printHelp() {
  console.log(`Apply catalog editor export into src/catalog (units, leaders, hotspots).

Usage:
  node scripts/apply-catalog-export.mjs <overrides.json>
  node scripts/apply-catalog-export.mjs --dry-run <overrides.json>

  npm run catalog:apply -- <overrides.json>
  npm run catalog:apply -- --dry-run <overrides.json>

Options:
  --dry-run   Print actions without writing files
  -h, --help  Show this message
`);
}

function parseArgs(argv) {
  let dryRun = false;
  let help = false;
  const positional = [];
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a === '-h' || a === '--help') help = true;
    else if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { dryRun, help, inputPath: positional[0] };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

/** Deep-merge objects; arrays and primitives from patch replace (matches src/catalog/catalogOverrides.ts). */
function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch)) {
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
      out[key] = deepMerge(bv, pv);
    } else {
      out[key] = pv;
    }
  }
  return out;
}

function cloneJson(x) {
  return JSON.parse(JSON.stringify(x));
}

function mergeRoster(baseRoster, additions) {
  const seen = new Set(baseRoster.map((s) => s.unitId));
  const out = [...baseRoster];
  for (const add of additions) {
    if (seen.has(add.unitId)) continue;
    seen.add(add.unitId);
    out.push(add);
  }
  return out;
}

function applySlotPatch(slot, patch) {
  if (!patch || Object.keys(patch).length === 0) return slot;
  const merged = { ...slot };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  return merged;
}

async function applyUnits(overrides, dryRun) {
  const newUnits = overrides.newUnits ?? {};
  const unitPatches = overrides.unitPatches ?? {};
  const ids = new Set([...Object.keys(newUnits), ...Object.keys(unitPatches)]);
  if (ids.size === 0) return;

  if (!dryRun) await fs.mkdir(unitsDir, { recursive: true });
  for (const unitId of Array.from(ids).sort()) {
    let base = newUnits[unitId];
    if (base === undefined) {
      const filePath = path.join(unitsDir, `${unitId}.json`);
      try {
        base = await readJson(filePath);
      } catch {
        throw new Error(
          `[catalog:apply] unitPatches["${unitId}"] needs src/catalog/units/${unitId}.json or newUnits["${unitId}"]`,
        );
      }
    }
    const patch = unitPatches[unitId] ?? {};
    const merged = Object.keys(patch).length === 0 ? base : deepMerge(base, patch);
    const filePath = path.join(unitsDir, `${unitId}.json`);
    const payload = JSON.stringify(sortKeys(merged), null, 2) + '\n';
    if (dryRun) {
      console.log(`[dry-run] would write src/catalog/units/${unitId}.json`);
    } else {
      await fs.writeFile(filePath, payload, 'utf8');
      console.log(`Wrote unit: src/catalog/units/${unitId}.json`);
    }
  }
}

async function applyLeaders(overrides, dryRun) {
  const hiddenLeaderIds = new Set(
    Array.isArray(overrides.hiddenLeaderIds) ? overrides.hiddenLeaderIds.filter((id) => typeof id === 'string') : [],
  );
  const newLeaders = overrides.newLeaders && typeof overrides.newLeaders === 'object' ? overrides.newLeaders : {};
  const rosterAdditions =
    overrides.rosterAdditions && typeof overrides.rosterAdditions === 'object' ? overrides.rosterAdditions : {};
  const rosterSlotPatches =
    overrides.rosterSlotPatches && typeof overrides.rosterSlotPatches === 'object' ? overrides.rosterSlotPatches : {};
  const leaderPatches =
    overrides.leaderPatches && typeof overrides.leaderPatches === 'object' ? overrides.leaderPatches : {};

  /** @type {Array<Record<string, unknown>>} */
  const fromDisk = await readJson(leadersPath);
  const byId = new Map();
  for (const leader of fromDisk) {
    const id = typeof leader.id === 'string' ? leader.id : '';
    if (!id) continue;
    if (hiddenLeaderIds.has(id)) continue;
    byId.set(id, cloneJson(leader));
  }

  for (const [id, nl] of Object.entries(newLeaders)) {
    byId.set(id, cloneJson(nl));
  }

  const mergedLeaders = [];
  for (const leaderId of Array.from(byId.keys()).sort()) {
    const leader = byId.get(leaderId);
    const add = rosterAdditions[leaderId] ?? [];
    let roster = mergeRoster(leader.roster ?? [], add);

    const slotPatchesForLeader = rosterSlotPatches[leaderId];
    if (slotPatchesForLeader && typeof slotPatchesForLeader === 'object') {
      roster = roster.map((slot) => {
        const p = slotPatchesForLeader[slot.unitId];
        return applySlotPatch(slot, p);
      });
    }

    let out = { ...leader, roster };

    if (!newLeaders[leaderId]) {
      const lp = leaderPatches[leaderId];
      if (lp && typeof lp === 'object' && Object.keys(lp).length > 0) {
        out = { ...out, ...lp };
      }
    }

    mergedLeaders.push(out);
  }

  const payload = JSON.stringify(mergedLeaders, null, 2) + '\n';
  if (dryRun) {
    console.log(`[dry-run] would write ${mergedLeaders.length} leaders to src/catalog/leaders.json`);
  } else {
    await fs.writeFile(leadersPath, payload, 'utf8');
    console.log(`Wrote ${mergedLeaders.length} leaders to src/catalog/leaders.json`);
  }
}

async function applyHotspots(overrides, dryRun) {
  const hotspots = overrides.hotspots && typeof overrides.hotspots === 'object' ? overrides.hotspots : {};
  const ids = Object.keys(hotspots);
  if (ids.length === 0) return;

  if (!dryRun) await fs.mkdir(hotspotsDir, { recursive: true });
  for (const unitId of ids.sort()) {
    const file = hotspots[unitId];
    if (!file || typeof file !== 'object') {
      console.warn(`[catalog:apply] skip invalid hotspot for "${unitId}"`);
      continue;
    }
    const rel = `src/catalog/hotspots/${unitId}.json`;
    const payload = JSON.stringify(sortKeys(file), null, 2) + '\n';
    const filePath = path.join(hotspotsDir, `${unitId}.json`);
    if (dryRun) {
      console.log(`[dry-run] would write ${rel}`);
    } else {
      await fs.writeFile(filePath, payload, 'utf8');
      console.log(`Wrote hotspot: ${rel}`);
    }
  }
}

async function main() {
  const { dryRun, help, inputPath } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }
  if (!inputPath) {
    printHelp();
    process.exit(1);
  }

  const absoluteInput = path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
  const overrides = await readJson(absoluteInput);
  if (!overrides || overrides.version !== 1) {
    throw new Error('Expected overrides JSON with "version": 1');
  }

  if (dryRun) {
    console.log('[dry-run] no files will be written.\n');
  }

  await applyUnits(overrides, dryRun);
  await applyLeaders(overrides, dryRun);
  await applyHotspots(overrides, dryRun);

  console.log(dryRun ? 'Dry run finished. Remove --dry-run to apply.' : 'Catalog export applied. Run npm run build before deploy.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
