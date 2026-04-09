#!/usr/bin/env node
/**
 * Наёмники Kingdoms of Westorn (лист KoW-Mr): статы и хотспоты в стиле Кастилии.
 * Лист **4×2** слота: 6 карт (первый ряд — 4, второй — 2 слева).
 * Имена — как на лице карты (основное имя + подзаголовок через запятую, у Таоргаса — «…с Молотом/Клинками»).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const A1 = { x: 0.045, y: 0.402, w: 0.91, h: 0.068 };
const SPLIT_L = { x: 0.045, y: 0.465, w: 0.44, h: 0.055 };
const SPLIT_R = { x: 0.515, y: 0.465, w: 0.44, h: 0.055 };

function region(base, extra) {
  return { ...base, ...extra };
}

/** @param {{ red: number, green: number, black: number, range: number, damage: number, label: string }} atk */
function stdRegions(atk) {
  return [
    region(A1, {
      id: 'attack_0',
      label: atk.label,
      red: atk.red,
      green: atk.green,
      black: atk.black,
      white: 0,
      range: atk.range,
      rangeUnit: 'hex',
      damage: atk.damage,
    }),
    region(SPLIT_L, {
      id: 'concentration',
      label: 'Концентрация',
      red: 1,
      green: 0,
      black: 0,
      white: 0,
      range: 0,
      rangeUnit: 'hex',
      damage: 0,
    }),
    region(SPLIT_R, {
      id: 'defense_bonus',
      label: 'Защита +1',
      red: 0,
      green: 0,
      black: 0,
      white: 1,
      range: 0,
      rangeUnit: 'hex',
      damage: 0,
    }),
  ];
}

function unitJson(u) {
  const c = u.card;
  return {
    id: u.id,
    mercenary: true,
    points: u.points ?? 0,
    card: {
      attacks: [],
      catalogUnitId: u.id,
      concentration: { black: 0, green: 0, red: 0, white: 0 },
      defense: c.defense,
      defenseReaction: { green: 0, white: 1 },
      domains: ['life'],
      exploration: { black: 0, green: 0, red: 0, white: 0 },
      explorationRange: 0,
      grabRange: 1,
      health: c.health,
      keywords: ['Наёмник'],
      maxHealth: c.maxHealth,
      miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
      name: c.name,
      run: c.run,
      size: c.size,
      sprite: `/catalog-units/${u.id}/image.jpg`,
      walk: c.walk,
      flagSprite: '/mercenaries.webp',
      ...(c.faithMarkers &&
      (c.faithMarkers.red || c.faithMarkers.green || c.faithMarkers.black || c.faithMarkers.white)
        ? { faithMarkers: c.faithMarkers }
        : {}),
    },
  };
}

function hotspotJson(u) {
  return {
    image: `/catalog-units/${u.id}/image.jpg`,
    title: u.title,
    regions: u.regions.map((r) => {
      const out = { ...r };
      if (out.white === undefined) out.white = 0;
      return out;
    }),
  };
}

/** Шесть карт на листе: слоты 0–3 верхний ряд, 4–5 нижний ряд слева (соответствует KoW-Mr01…Mr06 на карте). */
const NAMES = [
  'Гатархин, Бесшумный Дуэлянт',
  'Гатархин, Бесшумный Убийца',
  'Таоргас Свирепый с Молотом',
  'Таоргас Свирепый с Клинками',
  'Алдвин Мортенсон, Искатель Истины',
  'Алдвин Мортенсон, Летописец',
];

const ATTACKS = [
  { label: 'Удар глефой', red: 2, green: 1, black: 1, range: 2, damage: 2 },
  { label: 'Вихрь клинков', red: 2, green: 1, black: 1, range: 1, damage: 2 },
  { label: 'Удар молотом', red: 3, green: 1, black: 1, range: 1, damage: 2 },
  { label: 'Удар клинками', red: 3, green: 1, black: 1, range: 1, damage: 2 },
  { label: 'Удар мечом', red: 2, green: 0, black: 1, range: 1, damage: 2 },
  { label: 'Удар мечом', red: 2, green: 0, black: 1, range: 1, damage: 2 },
];

/** @type {{ health: number, walk: number, run: number, defense: { white?: number, green?: number }, size: 'small' | 'big' | 'large' | 'huge' }[]} */
const STAT_ROW = [
  { health: 5, walk: 4, run: 7, defense: { white: 1, green: 1 }, size: 'small' },
  { health: 5, walk: 4, run: 7, defense: { white: 1, green: 1 }, size: 'small' },
  { health: 14, walk: 1, run: 2, defense: { white: 1, green: 1 }, size: 'big' },
  { health: 14, walk: 1, run: 2, defense: { white: 1, green: 1 }, size: 'big' },
  { health: 5, walk: 3, run: 6, defense: { white: 1, green: 1 }, size: 'small' },
  { health: 5, walk: 3, run: 6, defense: { white: 1, green: 1 }, size: 'small' },
];

const UNITS = NAMES.map((name, i) => {
  const n = i + 1;
  const id = `merc-kow-mr${String(n).padStart(2, '0')}`;
  const st = STAT_ROW[i];
  return {
    id,
    title: name,
    points: 0,
    card: {
      name,
      health: st.health,
      maxHealth: st.health,
      walk: st.walk,
      run: st.run,
      size: st.size,
      defense: st.defense,
    },
    regions: stdRegions(ATTACKS[i]),
  };
});

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  for (const u of UNITS) {
    await fs.writeFile(path.join(unitsDir, `${u.id}.json`), JSON.stringify(unitJson(u), null, 2), 'utf8');
    await fs.writeFile(path.join(hotDir, `${u.id}.json`), JSON.stringify(hotspotJson(u), null, 2), 'utf8');
  }
  console.log(`Wrote ${UNITS.length} mercenary KoW unit + hotspot files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
