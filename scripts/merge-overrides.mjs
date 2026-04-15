#!/usr/bin/env node
/**
 * Merge 3 catalog overrides exports into one.
 * Precedence on conflicts: last file wins for scalars/arrays,
 * objects are deep-merged (later fields override earlier ones field-by-field).
 *
 * Usage:
 *   node scripts/merge-overrides.mjs <base.json> <mid.json> <top.json> <out.json>
 *
 * For unitPatches: deep-merge per key (so each author's field-level edits are preserved).
 * For hotspots: atomic replace (last wins) — images/regions go together.
 * For other maps: union, last-wins on key collision.
 */
import fs from 'node:fs';

const [,, ...args] = process.argv;
if (args.length !== 4) {
  console.error('Usage: node scripts/merge-overrides.mjs <base> <mid> <top> <out>');
  process.exit(1);
}
const [basePath, midPath, topPath, outPath] = args;

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const files = [load(basePath), load(midPath), load(topPath)];

function isPlainObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge: objects recurse, scalars/arrays replace. Later wins. */
function deepMerge(...values) {
  const defined = values.filter((v) => v !== undefined);
  if (defined.length === 0) return undefined;
  const last = defined[defined.length - 1];
  // If last is not an object, last wins entirely.
  if (!isPlainObj(last)) return last;
  // Merge all object values in order.
  const out = {};
  for (const v of defined) {
    if (!isPlainObj(v)) {
      // Non-object in chain replaces — restart as empty and keep later only.
      for (const k of Object.keys(out)) delete out[k];
      continue;
    }
    for (const k of Object.keys(v)) {
      out[k] = deepMerge(out[k], v[k]);
    }
  }
  return out;
}

/** Union of keys, last-wins atomic replace per key. */
function mergeMapAtomic(a = {}, b = {}, c = {}) {
  return { ...a, ...b, ...c };
}

/** Union of keys, deep-merge per key. */
function mergeMapDeep(a = {}, b = {}, c = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)]);
  const out = {};
  for (const k of keys) out[k] = deepMerge(a[k], b[k], c[k]);
  return out;
}

/** Union of arrays, preserves order from first file, then appends new items from later. */
function mergeArrayUnion(...arrs) {
  const seen = new Set();
  const out = [];
  for (const a of arrs) {
    if (!Array.isArray(a)) continue;
    for (const x of a) {
      const key = typeof x === 'string' ? x : JSON.stringify(x);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
    }
  }
  return out;
}

const [f1, f2, f3] = files;

const merged = {
  version: f3.version ?? f2.version ?? f1.version ?? '1',
  // unit patches: deep merge per key to preserve each author's field edits
  unitPatches: mergeMapDeep(f1.unitPatches, f2.unitPatches, f3.unitPatches),
  // new units: last wins (full def is atomic)
  newUnits: mergeMapAtomic(f1.newUnits, f2.newUnits, f3.newUnits),
  newLeaders: mergeMapAtomic(f1.newLeaders, f2.newLeaders, f3.newLeaders),
  hiddenLeaderIds: mergeArrayUnion(f1.hiddenLeaderIds, f2.hiddenLeaderIds, f3.hiddenLeaderIds),
  hiddenUnitIds: mergeArrayUnion(f1.hiddenUnitIds, f2.hiddenUnitIds, f3.hiddenUnitIds),
  rosterAdditions: mergeMapDeep(f1.rosterAdditions, f2.rosterAdditions, f3.rosterAdditions),
  leaderPatches: mergeMapDeep(f1.leaderPatches, f2.leaderPatches, f3.leaderPatches),
  rosterSlotPatches: mergeMapDeep(f1.rosterSlotPatches, f2.rosterSlotPatches, f3.rosterSlotPatches),
  // hotspots: atomic — image+regions go together
  hotspots: mergeMapAtomic(f1.hotspots, f2.hotspots, f3.hotspots),
  hotspotLayoutPresets: mergeArrayUnion(f1.hotspotLayoutPresets, f2.hotspotLayoutPresets, f3.hotspotLayoutPresets),
  defaultHotspotLayoutPresetId:
    f3.defaultHotspotLayoutPresetId ?? f2.defaultHotspotLayoutPresetId ?? f1.defaultHotspotLayoutPresetId ?? null,
  unitOrder: mergeArrayUnion(f1.unitOrder, f2.unitOrder, f3.unitOrder),
  leaderRosterOrder: mergeMapAtomic(f1.leaderRosterOrder, f2.leaderRosterOrder, f3.leaderRosterOrder),
  newInventoryItems: mergeMapAtomic(f1.newInventoryItems, f2.newInventoryItems, f3.newInventoryItems),
  inventoryPatches: mergeMapDeep(f1.inventoryPatches, f2.inventoryPatches, f3.inventoryPatches),
  hiddenInventoryIds: mergeArrayUnion(f1.hiddenInventoryIds, f2.hiddenInventoryIds, f3.hiddenInventoryIds),
  inventoryOrder: mergeArrayUnion(f1.inventoryOrder, f2.inventoryOrder, f3.inventoryOrder),
  godCardPatches: mergeMapDeep(f1.godCardPatches, f2.godCardPatches, f3.godCardPatches),
  leaderGodDeckMax: mergeMapAtomic(f1.leaderGodDeckMax, f2.leaderGodDeckMax, f3.leaderGodDeckMax),
};

fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log('Merged ->', outPath);
console.log('unitPatches:', Object.keys(merged.unitPatches).length);
console.log('hotspots:', Object.keys(merged.hotspots).length);
console.log('newUnits:', Object.keys(merged.newUnits).length);
console.log('leaderPatches:', Object.keys(merged.leaderPatches).length);
console.log('rosterAdditions:', Object.keys(merged.rosterAdditions).length);
console.log('rosterSlotPatches:', Object.keys(merged.rosterSlotPatches).length);
