#!/usr/bin/env node
/**
 * Ангельн: каталог юнитов и заглушки хотспотов (хотспоты дополняет build-engeln-scroll-cards).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGELN_UNITS, ENGELN_LEADER_ONLY_UNITS } from './engeln-units-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function zeroConc() {
  return { black: 0, green: 0, red: 0, white: 0 };
}

function unitJson(u) {
  const card = {
    attacks: u.attacks ?? [],
    catalogUnitId: u.id,
    concentration: u.concentration ?? zeroConc(),
    defense: u.defense,
    defenseReaction: { green: 0, white: 1 },
    domains: ['creation'],
    exploration: { black: 0, green: 0, red: 0, white: 0 },
    explorationRange: 0,
    grabRange: 1,
    health: u.health,
    keywords: ['Ангельн'],
    maxHealth: u.health,
    miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
    name: u.name,
    run: u.run,
    size: u.size,
    sprite: `/catalog-units/${u.id}/image.jpg`,
    walk: u.walk,
    flagSprite: '/engeln.webp',
  };
  if (u.faithMarkers) card.faithMarkers = u.faithMarkers;
  if (u.traits && u.traits.length > 0) card.traits = u.traits;
  return {
    id: u.id,
    points: u.points,
    card,
  };
}

function hotspotStub(u) {
  return {
    image: `/catalog-units/${u.id}/image.jpg`,
    title: u.name,
    regions: [],
  };
}

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  const all = [...ENGELN_UNITS, ...ENGELN_LEADER_ONLY_UNITS];
  for (const u of all) {
    const j = unitJson(u);
    await fs.writeFile(path.join(unitsDir, `${u.id}.json`), JSON.stringify(j, null, 2), 'utf8');
    await fs.writeFile(
      path.join(hotspotsDir, `${u.id}.json`),
      JSON.stringify(hotspotStub(u), null, 2),
      'utf8',
    );
    console.log(`[engeln-catalog] ${u.id}`);
  }
  console.log('[engeln-catalog] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
