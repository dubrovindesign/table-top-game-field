#!/usr/bin/env npx tsx
/**
 * Applies `hex-board-catalog-overrides.json` (from catalog editor export) into the repo:
 * - newUnits + unitPatches → src/catalog/units/<id>.json
 * - newLeaders + rosterAdditions + rosterSlotPatches + leaderPatches + hiddenLeaderIds → src/catalog/leaders.json
 * - hotspots → src/catalog/hotspots/<unitId>.json
 *
 * Перед применением ключи нормализуются к каноническим id (см. src/catalog/catalogIdResolve.ts).
 *
 * Usage:
 *   npm run catalog:apply -- path/to/hex-board-catalog-overrides.json
 *   npm run catalog:apply -- --dry-run path/to/...
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CatalogOverridesV1 } from '../src/catalog/catalogOverrides.ts';
import { normalizeCatalogOverridesV1 } from '../src/catalog/catalogIdResolve.ts';
import type { CatalogUnitDef, LeaderDef } from '../src/catalog/types.ts';

const repoRoot = process.cwd();
const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
const leadersPath = path.join(repoRoot, 'src', 'catalog', 'leaders.json');

function printHelp() {
  console.log(`Apply catalog editor export into src/catalog (units, leaders, hotspots).

Usage:
  npm run catalog:apply -- <overrides.json>
  npm run catalog:apply -- --dry-run <overrides.json>

Options:
  --dry-run   Print actions without writing files
  -h, --help  Show this message
`);
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let help = false;
  const positional: string[] = [];
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

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
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
      out[key] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      out[key] = pv;
    }
  }
  return out;
}

function cloneJson<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function mergeRoster(
  baseRoster: { unitId: string; maxCopies: number; points?: number; requiresUnitId?: string }[],
  additions: typeof baseRoster,
) {
  const seen = new Set(baseRoster.map((s) => s.unitId));
  const out = [...baseRoster];
  for (const add of additions) {
    if (seen.has(add.unitId)) continue;
    seen.add(add.unitId);
    out.push(add);
  }
  return out;
}

function applySlotPatch(
  slot: { unitId: string; maxCopies: number; points?: number; requiresUnitId?: string },
  patch: Record<string, unknown>,
) {
  if (!patch || Object.keys(patch).length === 0) return slot;
  const merged = { ...slot } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  return merged as typeof slot;
}

async function loadAllUnits(): Promise<Record<string, CatalogUnitDef>> {
  const names = await fs.readdir(unitsDir);
  const out: Record<string, CatalogUnitDef> = {};
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.replace(/\.json$/, '');
    const data = (await readJson(path.join(unitsDir, name))) as CatalogUnitDef;
    out[id] = data;
  }
  return out;
}

async function applyUnits(overrides: CatalogOverridesV1, dryRun: boolean) {
  const newUnits = overrides.newUnits ?? {};
  const unitPatches = overrides.unitPatches ?? {};
  const ids = new Set([...Object.keys(newUnits), ...Object.keys(unitPatches)]);
  if (ids.size === 0) return;

  if (!dryRun) await fs.mkdir(unitsDir, { recursive: true });
  for (const unitId of Array.from(ids).sort()) {
    let base: unknown = newUnits[unitId];
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
    const merged =
      Object.keys(patch).length === 0
        ? (base as object)
        : deepMerge(base as Record<string, unknown>, patch as Record<string, unknown>);
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

async function applyLeaders(overrides: CatalogOverridesV1, dryRun: boolean) {
  const hiddenLeaderIds = new Set(
    Array.isArray(overrides.hiddenLeaderIds) ? overrides.hiddenLeaderIds.filter((id): id is string => typeof id === 'string') : [],
  );
  const newLeaders = overrides.newLeaders && typeof overrides.newLeaders === 'object' ? overrides.newLeaders : {};
  const rosterAdditions =
    overrides.rosterAdditions && typeof overrides.rosterAdditions === 'object' ? overrides.rosterAdditions : {};
  const rosterSlotPatches =
    overrides.rosterSlotPatches && typeof overrides.rosterSlotPatches === 'object' ? overrides.rosterSlotPatches : {};
  const leaderPatches =
    overrides.leaderPatches && typeof overrides.leaderPatches === 'object' ? overrides.leaderPatches : {};

  const fromDisk = (await readJson(leadersPath)) as Record<string, unknown>[];
  const byId = new Map<string, Record<string, unknown>>();
  for (const leader of fromDisk) {
    const id = typeof leader.id === 'string' ? leader.id : '';
    if (!id) continue;
    if (hiddenLeaderIds.has(id)) continue;
    byId.set(id, cloneJson(leader));
  }

  for (const [id, nl] of Object.entries(newLeaders)) {
    byId.set(id, cloneJson(nl as Record<string, unknown>));
  }

  const mergedLeaders: Record<string, unknown>[] = [];
  for (const leaderId of Array.from(byId.keys()).sort()) {
    const leader = byId.get(leaderId)!;
    const add = rosterAdditions[leaderId] ?? [];
    let roster = mergeRoster(
      (leader.roster as { unitId: string; maxCopies: number; points?: number; requiresUnitId?: string }[]) ?? [],
      add,
    );

    const slotPatchesForLeader = rosterSlotPatches[leaderId];
    if (slotPatchesForLeader && typeof slotPatchesForLeader === 'object') {
      roster = roster.map((slot) => {
        const p = slotPatchesForLeader[slot.unitId] as Record<string, unknown> | undefined;
        return applySlotPatch(slot, p ?? {});
      });
    }

    let out: Record<string, unknown> = { ...leader, roster };

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

function logExportSummary(overrides: { [k: string]: unknown }) {
  const nu = Object.keys((overrides.newUnits as object) ?? {}).length;
  const hi = Object.keys((overrides.hotspots as object) ?? {}).length;
  const nl = Object.keys((overrides.newLeaders as object) ?? {}).length;
  const rsp = Object.keys((overrides.rosterSlotPatches as object) ?? {}).length;
  const ra = Object.keys((overrides.rosterAdditions as object) ?? {}).length;
  const up = Object.keys((overrides.unitPatches as object) ?? {}).length;
  console.log(
    `[catalog:apply] Сводка экспорта: newUnits=${nu}, unitPatches=${up}, hotspots=${hi}, newLeaders=${nl}, rosterAdditions=${ra}, rosterSlotPatches(лидеров)=${rsp}`,
  );
  if (nu === 0 && up === 0 && hi === 0 && nl === 0 && ra === 0 && rsp === 0) {
    console.warn(
      '[catalog:apply] Экспорт почти пустой — возможно выбран старый файл. Сделайте новый экспорт в редакторе и проверьте дату/размер JSON.',
    );
  }
}

function warnNewUnitsPoints(overrides: CatalogOverridesV1) {
  const newUnits = overrides.newUnits && typeof overrides.newUnits === 'object' ? overrides.newUnits : {};
  for (const [unitId, def] of Object.entries(newUnits)) {
    if (def == null || typeof def !== 'object') continue;
    if (typeof def.points !== 'number' || Number.isNaN(def.points)) {
      console.warn(
        `[catalog:apply] newUnits["${unitId}"]: нет числового поля points — укажите цену юнита в форме и снова «Экспорт» (или проверьте, что это свежий JSON).`,
      );
    }
  }
}

function warnRosterMaxCopies(overrides: CatalogOverridesV1) {
  const newLeaders = overrides.newLeaders && typeof overrides.newLeaders === 'object' ? overrides.newLeaders : {};
  for (const [leaderId, L] of Object.entries(newLeaders)) {
    const roster = Array.isArray(L.roster) ? L.roster : [];
    for (const slot of roster) {
      if (!slot || typeof slot.unitId !== 'string') continue;
      if (typeof slot.maxCopies !== 'number' || slot.maxCopies < 1) {
        console.warn(
          `[catalog:apply] newLeaders["${leaderId}"].roster: слот "${slot.unitId}" без maxCopies ≥ 1 — задайте «макс. копий» у слота и экспортируйте снова.`,
        );
      }
    }
  }
  const additions = overrides.rosterAdditions && typeof overrides.rosterAdditions === 'object' ? overrides.rosterAdditions : {};
  for (const [leaderId, slots] of Object.entries(additions)) {
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      if (!slot || typeof slot.unitId !== 'string') continue;
      if (typeof slot.maxCopies !== 'number' || slot.maxCopies < 1) {
        console.warn(
          `[catalog:apply] rosterAdditions["${leaderId}"] слот "${slot.unitId}": нет maxCopies ≥ 1 — сохраните лимит в ростере и экспортируйте снова.`,
        );
      }
    }
  }
}

function warnNewUnitsWithoutHotspots(overrides: CatalogOverridesV1) {
  const newUnits = overrides.newUnits && typeof overrides.newUnits === 'object' ? overrides.newUnits : {};
  const hotspots = overrides.hotspots && typeof overrides.hotspots === 'object' ? overrides.hotspots : {};
  for (const unitId of Object.keys(newUnits)) {
    const hf = hotspots[unitId];
    const hasRegions =
      hf &&
      typeof hf === 'object' &&
      Array.isArray((hf as { regions?: unknown }).regions) &&
      ((hf as { regions: unknown[] }).regions?.length ?? 0) > 0 &&
      typeof (hf as { image?: unknown }).image === 'string' &&
      String((hf as { image: string }).image).trim().length > 0;
    if (!hasRegions) {
      console.warn(
        `[catalog:apply] Юнит "${unitId}" в newUnits, но в экспорте нет сохранённых хотспотов (в редакторе: зоны → «Сохранить хотспоты» → экспорт JSON).`,
      );
    }
  }
}

async function applyHotspots(overrides: CatalogOverridesV1, dryRun: boolean) {
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
  const raw = await readJson(absoluteInput);
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) {
    throw new Error('Expected overrides JSON with "version": 1');
  }

  const leadersFromDisk = (await readJson(leadersPath)) as LeaderDef[];
  const unitsMap = await loadAllUnits();
  const norm = normalizeCatalogOverridesV1(raw as CatalogOverridesV1, {
    leaders: leadersFromDisk,
    units: unitsMap,
  });
  const overrides = norm.normalized;
  if (norm.changed) {
    const lines = [...norm.renames.leaders, ...norm.renames.units];
    if (lines.length) console.log(`[catalog:apply] Нормализованы id: ${lines.join('; ')}`);
  }

  if (dryRun) {
    console.log('[dry-run] no files will be written.\n');
  }

  logExportSummary(overrides as Record<string, unknown>);
  warnNewUnitsPoints(overrides);
  warnRosterMaxCopies(overrides);
  warnNewUnitsWithoutHotspots(overrides);

  await applyUnits(overrides, dryRun);
  await applyLeaders(overrides, dryRun);
  await applyHotspots(overrides, dryRun);

  console.log(dryRun ? 'Dry run finished. Remove --dry-run to apply.' : 'Catalog export applied. Run npm run build before deploy.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
