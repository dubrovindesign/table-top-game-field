#!/usr/bin/env node
/**
 * Каталог + хотспоты для одиночных карт Ангельна (канон hex-board-faction-sheet §4):
 * регионы в долях 0–1, как у generate-krigmark / castilla на лице карты.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGELN_SINGLE_IMPORT } from './engeln-singles-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Полосы атак на вертикальной карте (~827×1418), зона плашек снизу. */
const ATTACK_ROW = { x: 0.042, w: 0.916, h: 0.058, gap: 0.016 };
const ATTACK_Y0 = 0.528;

function diceToRegionFields(dice) {
  return {
    red: dice.red ?? 0,
    green: dice.green ?? 0,
    black: dice.black ?? 0,
    white: dice.white ?? 0,
  };
}

function hotspotRegionsFromAttacks(attacks) {
  return attacks.map((atk, i) => {
    const ru = atk.attackRangeUnit ?? 'hex';
    const y = ATTACK_Y0 + i * (ATTACK_ROW.h + ATTACK_ROW.gap);
    return {
      id: `attack_${i}`,
      label: atk.name,
      x: ATTACK_ROW.x,
      y: Math.round(y * 10000) / 10000,
      w: ATTACK_ROW.w,
      h: ATTACK_ROW.h,
      range: atk.range,
      rangeUnit: ru,
      damage: atk.damage,
      ...diceToRegionFields(atk.dice),
    };
  });
}

function unitToJson(u) {
  const card = {
    attacks: u.attacks,
    catalogUnitId: u.id,
    concentration: u.concentration,
    defense: u.defense,
    defenseReaction: { green: 0, white: 1 },
    domains: ['creation'],
    exploration: u.exploration ?? { black: 0, green: 0, red: 0, white: 0 },
    explorationRange: u.explorationRange ?? 0,
    grabRange: 1,
    health: u.health,
    keywords: u.keywords,
    maxHealth: u.health,
    miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
    name: u.name,
    run: u.run,
    size: u.size,
    sprite: `/catalog-units/${u.id}/image.jpg`,
    walk: u.walk,
    flagSprite: '/engeln.webp',
  };
  if (u.movementDistanceUnit) card.movementDistanceUnit = u.movementDistanceUnit;
  if (u.faithMarkers) card.faithMarkers = u.faithMarkers;
  if (u.traits && u.traits.length > 0) card.traits = u.traits;
  return {
    id: u.id,
    points: u.points,
    card,
  };
}

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (const row of ENGELN_SINGLE_IMPORT) {
    const j = unitToJson(row);
    await fs.writeFile(path.join(unitsDir, `${row.id}.json`), JSON.stringify(j, null, 2), 'utf8');

    const hf = {
      image: `/catalog-units/${row.id}/image.jpg`,
      title: row.name,
      regions: hotspotRegionsFromAttacks(row.attacks),
    };
    await fs.writeFile(path.join(hotspotsDir, `${row.id}.json`), JSON.stringify(hf, null, 2), 'utf8');
    console.log(`[engeln-singles-catalog] ${row.id}`);
  }
  console.log('[engeln-singles-catalog] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
