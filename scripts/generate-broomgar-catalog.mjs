#!/usr/bin/env node
/**
 * Орда брумгаров: лицевой лист — сетка 3×7 (21 ячейка), не 4 ряда.
 * Очки и maxCopies — со скриншотов набора у Курош хана. Статы — черновик по картам.
 * Лидер: ячейка 19 (ряд 3, кол. 6) — Курош хан.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const A1 = { x: 0.045, y: 0.402, w: 0.91, h: 0.068 };
const A2 = { x: 0.045, y: 0.474, w: 0.91, h: 0.068 };

const COLS = 7;
const ROWS = 3;

function cellRectFromCell(cell, W, H) {
  const cellW = W / COLS;
  const cellH = H / ROWS;
  const row = Math.floor(cell / COLS);
  const col = cell % COLS;
  const left = Math.round(col * cellW);
  const top = Math.round(row * cellH);
  const right = Math.round((col + 1) * cellW);
  const bottom = Math.round((row + 1) * cellH);
  return { left, top, width: right - left, height: bottom - top };
}

function region(base, extra) {
  return { ...base, ...extra };
}

function unitJson(u) {
  const c = u.card;
  return {
    id: u.id,
    points: u.points ?? 0,
    card: {
      attacks: [],
      catalogUnitId: u.id,
      concentration: { black: 0, green: 0, red: 0, white: 0 },
      defense: c.defense,
      defenseReaction: { green: 0, white: 1 },
      domains: ['destruction'],
      exploration: { black: 0, green: 0, red: 0, white: 0 },
      explorationRange: 0,
      grabRange: 1,
      health: c.health,
      keywords: ['Орда брумгаров'],
      maxHealth: c.maxHealth,
      miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
      name: c.name,
      run: c.run,
      size: c.size,
      sprite: `/catalog-units/${u.id}/image.jpg`,
      walk: c.walk,
      ...(c.movementDistanceUnit ? { movementDistanceUnit: c.movementDistanceUnit } : {}),
      ...(c.faithMarkers &&
      (c.faithMarkers.red || c.faithMarkers.green || c.faithMarkers.black || c.faithMarkers.white)
        ? { faithMarkers: c.faithMarkers }
        : {}),
      flagSprite: '/broomgar_horde.webp',
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

function stdMeleeRegions() {
  return [
    region(A1, {
      id: 'attack_0',
      label: 'Ближний бой',
      red: 2,
      green: 1,
      black: 1,
      white: 0,
      range: 1,
      rangeUnit: 'hex',
      damage: 2,
    }),
    region(A2, {
      id: 'attack_1',
      label: 'Дополнительная атака',
      red: 1,
      green: 1,
      black: 0,
      white: 0,
      range: 1,
      rangeUnit: 'hex',
      damage: 1,
    }),
  ];
}

const MINIATURE_ON_FACE = { x: 0.172, y: 0, w: 0.698, h: 0.448 };

/** Индексы 0–22 по сетке листа broomgar-front.jpg. Яч. 21–22 — оборотные фрагменты зурбагов; при смене листа проверить. */
const UNITS = [
  {
    id: 'broomgar-bibar-batyr-topory',
    title: 'Бибар-Батыр (топоры)',
    points: 36,
    card: {
      name: 'Бибар-Батыр с Топорами',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-bibar-batyr-bombarda',
    title: 'Бибар-Батыр (бомбарда)',
    points: 46,
    card: {
      name: 'Бибар-Батыр с Бомбардой',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-zurbag-myasnik',
    title: 'Зурбаг Мясник',
    points: 12,
    card: {
      name: 'Зурбаг Мясник',
      health: 4,
      maxHealth: 4,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 0, green: 2 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-gakhay-prasha',
    title: 'Гахай (праща)',
    points: 22,
    card: {
      name: 'Гахай с Пращей',
      health: 7,
      maxHealth: 7,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 0, green: 2 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-gakhay-bumerang',
    title: 'Гахай (бумеранг)',
    points: 23,
    card: {
      name: 'Гахай с Бумерангом',
      health: 7,
      maxHealth: 7,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 0, green: 2 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-gakhay-rogatina',
    title: 'Гахай (рогатина)',
    points: 20,
    card: {
      name: 'Гахай с Рогатиной',
      health: 7,
      maxHealth: 7,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 0, green: 2 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-kotel-kolbasy-burtaga',
    title: 'Котел (колбасы)',
    points: 4,
    card: {
      name: 'Котел с Колбасами из мяса Буртага, Чеснока и Трав',
      health: 2,
      maxHealth: 2,
      walk: 2,
      run: 4,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-mutsereg-topory',
    title: 'Муцерег (топоры)',
    points: 30,
    card: {
      name: 'Муцерег с Топорами',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 0, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-mutsereg-sekira',
    title: 'Муцерег (секира)',
    points: 31,
    card: {
      name: 'Муцерег с Секирой',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-tsereg-bulava',
    title: 'Церег (булавой)',
    points: 26,
    card: {
      name: 'Церег с Булавой',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-tsereg-tesak',
    title: 'Церег (тесак)',
    points: 25,
    card: {
      name: 'Церег с Тесаком',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-yargachin-bulava',
    title: 'Яргачин (булавой)',
    points: 40,
    card: {
      name: 'Яргачин с Булавой',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-yargachin-mech',
    title: 'Яргачин (меч)',
    points: 39,
    card: {
      name: 'Яргачин с Мечом',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-kotel-ryba-ognevik',
    title: 'Котел (рыба)',
    points: 3,
    card: {
      name: 'Котел с Рыбой, Лосось-Огневик и Пряности',
      health: 2,
      maxHealth: 2,
      walk: 2,
      run: 4,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-daychin-tesaki',
    title: 'Дайчин (тесаки)',
    points: 30,
    card: {
      name: 'Дайчин с Тесаками',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-daychin-bulava',
    title: 'Дайчин (булавой)',
    points: 35,
    card: {
      name: 'Дайчин с Булавой',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-daychin-znamenosets',
    title: 'Дайчин Знаменосец',
    points: 27,
    card: {
      name: 'Дайчин Знаменосец',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-shaktan-ruchnitsa',
    title: 'Шактан (ручница)',
    points: 50,
    card: {
      name: 'Шактан с Ручницей',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 3, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-shaktan-trezubets',
    title: 'Шактан (трезубец)',
    points: 55,
    card: {
      name: 'Шактан с Трезубцем',
      health: 12,
      maxHealth: 12,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 2, green: 2 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-grrokh-ten-shaktana',
    title: 'Гррох',
    points: 25,
    card: {
      name: 'Гррох, Тень Шактана',
      health: 10,
      maxHealth: 10,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-kotel-sup-bul-ragvy',
    title: 'Котел (суп)',
    points: 3,
    card: {
      name: 'Котел с Супом из Бул-Рагвы, Травы и Корней',
      health: 2,
      maxHealth: 2,
      walk: 2,
      run: 4,
      size: 'small',
      defense: { white: 1, green: 0 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-zurbag-razoritel',
    title: 'Зурбаг Разоритель',
    points: 15,
    card: {
      name: 'Зурбаг Разоритель',
      health: 6,
      maxHealth: 6,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
  {
    id: 'broomgar-zurbag-pokoritel',
    title: 'Зурбаг Покоритель',
    points: 20,
    card: {
      name: 'Зурбаг Покоритель',
      health: 7,
      maxHealth: 7,
      walk: 3,
      run: 6,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
    },
    regions: stdMeleeRegions(),
  },
];

const LEADER = {
  id: 'broomgar-kurosh-khan',
  title: 'Курош хан',
  points: 50,
  card: {
    name: 'Курош хан',
    health: 14,
    maxHealth: 14,
    walk: 3,
    run: 6,
    size: 'large',
    defense: { white: 1, green: 1 },
    faithMarkers: { red: 2 },
  },
  regions: stdMeleeRegions(),
};

async function writeLeaderArtFromSheet() {
  const src = path.join(repoRoot, 'public', 'broomgar-front.jpg');
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const { left, top, width, height } = cellRectFromCell(19, W, H);
  const dir = path.join(repoRoot, 'public', 'catalog-units', LEADER.id);
  await fs.mkdir(dir, { recursive: true });
  const faceBuf = await sharp(src)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer();
  const imgPath = path.join(dir, 'image.jpg');
  await sharp(faceBuf).toFile(imgPath);
  const faceW = width;
  const faceFullH = height;
  const { x: nx, y: ny, w: nw, h: nh } = MINIATURE_ON_FACE;
  const ml = Math.min(faceW - 1, Math.max(0, Math.round(nx * faceW)));
  const mt = Math.min(faceFullH - 1, Math.max(0, Math.round(ny * faceFullH)));
  let mw = Math.round(nw * faceW);
  let mh = Math.round(nh * faceFullH);
  mw = Math.max(1, Math.min(mw, faceW - ml));
  mh = Math.max(1, Math.min(mh, faceFullH - mt));
  const miniPath = path.join(dir, 'miniature.jpg');
  await sharp(faceBuf)
    .extract({ left: ml, top: mt, width: mw, height: mh })
    .jpeg({ quality: 90 })
    .toFile(miniPath);
  console.log(`[broomgar-catalog] ${LEADER.id}: портрет из ячейки 19 листа`);
}

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  for (const u of UNITS) {
    await fs.writeFile(path.join(unitsDir, `${u.id}.json`), JSON.stringify(unitJson(u), null, 2), 'utf8');
    await fs.writeFile(path.join(hotDir, `${u.id}.json`), JSON.stringify(hotspotJson(u), null, 2), 'utf8');
  }
  await fs.writeFile(
    path.join(unitsDir, `${LEADER.id}.json`),
    JSON.stringify(unitJson(LEADER), null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(hotDir, `${LEADER.id}.json`),
    JSON.stringify(hotspotJson(LEADER), null, 2),
    'utf8',
  );
  await writeLeaderArtFromSheet();
  console.log(`Wrote ${UNITS.length} Brumgar units + ${LEADER.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
