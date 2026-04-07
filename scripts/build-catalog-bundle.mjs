#!/usr/bin/env node
/**
 * Merges `src/catalog` JSON into `public/generated/catalog-data.json` for runtime fetch
 * (keeps the main JS chunk free of eager unit/hotspot modules).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
const outDir = path.join(repoRoot, 'public', 'generated');
const outFile = path.join(outDir, 'catalog-data.json');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const [factions, leaders] = await Promise.all([
    readJson(path.join(repoRoot, 'src', 'catalog', 'factions.json')),
    readJson(path.join(repoRoot, 'src', 'catalog', 'leaders.json')),
  ]);

  const units = {};
  const unitFiles = await fs.readdir(unitsDir);
  for (const name of unitFiles) {
    if (!name.endsWith('.json')) continue;
    const entry = await readJson(path.join(unitsDir, name));
    if (!entry || typeof entry.id !== 'string') {
      throw new Error(`[build-catalog-bundle] invalid unit file: ${name}`);
    }
    if (units[entry.id] !== undefined) {
      throw new Error(`[build-catalog-bundle] duplicate unit id: ${entry.id}`);
    }
    units[entry.id] = entry;
  }

  const hotspots = {};
  const hotspotFiles = await fs.readdir(hotspotsDir);
  for (const name of hotspotFiles) {
    if (!name.endsWith('.json')) continue;
    const id = name.replace(/\.json$/i, '');
    const entry = await readJson(path.join(hotspotsDir, name));
    if (hotspots[id] !== undefined) {
      throw new Error(`[build-catalog-bundle] duplicate hotspot id: ${id}`);
    }
    hotspots[id] = entry;
  }

  const payload = {
    schemaVersion: 1,
    factions,
    leaders,
    units,
    hotspots,
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(payload), 'utf8');
  console.log(`[build-catalog-bundle] wrote ${path.relative(repoRoot, outFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
