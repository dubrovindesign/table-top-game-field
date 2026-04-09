#!/usr/bin/env node
/**
 * Орда брумгаров: public/broomgar-front.jpg — сетка 3×7 (21 полная ячейка).
 * Высота листа делится на 3 ряда (не 4). Ширина: 7 колонок.
 *
 * Разоритель/Покоритель/Гррох в наборе есть, отдельных лиц на этом листе нет —
 * для них повторяются ячейки 2 (Зурбаг Мясник) и 17 (Шактан с ручницей) до появления отдельного арта.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const COLS = 7;
const ROWS = 3;

function cellRectFromCell(cell, W, H) {
  if (cell < 0 || cell > 20) {
    throw new Error(`[broomgar-split] ячейка должна быть 0..20, получено ${cell}`);
  }
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

/** Порядок обхода = порядок нарезки; `cell` — индекс в сетке 3×7 (0 слева сверху). */
const UNIT_SLICES = [
  { id: 'broomgar-bibar-batyr-topory', cell: 0 },
  { id: 'broomgar-bibar-batyr-bombarda', cell: 1 },
  { id: 'broomgar-zurbag-myasnik', cell: 2 },
  { id: 'broomgar-gakhay-prasha', cell: 3 },
  { id: 'broomgar-gakhay-bumerang', cell: 4 },
  { id: 'broomgar-gakhay-rogatina', cell: 5 },
  { id: 'broomgar-kotel-kolbasy-burtaga', cell: 6 },
  { id: 'broomgar-mutsereg-topory', cell: 7 },
  { id: 'broomgar-mutsereg-sekira', cell: 8 },
  { id: 'broomgar-tsereg-bulava', cell: 9 },
  { id: 'broomgar-tsereg-tesak', cell: 10 },
  { id: 'broomgar-yargachin-bulava', cell: 11 },
  { id: 'broomgar-yargachin-mech', cell: 12 },
  { id: 'broomgar-kotel-ryba-ognevik', cell: 13 },
  { id: 'broomgar-daychin-tesaki', cell: 14 },
  { id: 'broomgar-daychin-bulava', cell: 15 },
  { id: 'broomgar-daychin-znamenosets', cell: 16 },
  { id: 'broomgar-shaktan-ruchnitsa', cell: 17 },
  { id: 'broomgar-shaktan-trezubets', cell: 18 },
  { id: 'broomgar-kurosh-khan', cell: 19 },
  { id: 'broomgar-kotel-sup-bul-ragvy', cell: 20 },
  { id: 'broomgar-zurbag-razoritel', cell: 2 },
  { id: 'broomgar-zurbag-pokoritel', cell: 2 },
  { id: 'broomgar-grrokh-ten-shaktana', cell: 17 },
];

async function main() {
  const src = path.join(repoRoot, 'public', 'broomgar-front.jpg');
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;

  for (const { id, cell } of UNIT_SLICES) {
    const { left, top, width, height } = cellRectFromCell(cell, W, H);

    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });
    const facePath = path.join(dir, 'face.jpg');
    const outPath = path.join(dir, 'image.jpg');
    const buf = await sharp(src)
      .extract({ left, top, width, height })
      .jpeg({ quality: 92 })
      .toBuffer();
    await sharp(buf).toFile(facePath);
    await sharp(buf).toFile(outPath);
    console.log(outPath, width, height, `cell ${cell} (+ face.jpg)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
