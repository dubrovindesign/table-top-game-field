#!/usr/bin/env node
/**
 * Листы 7×2 (лицо / оборот): вырезает карту Хоакина де Эсперандо — 4-я ячейка верхнего ряда.
 * Источники: public/priory-pairs-png/hoaking-de-esperando-sheet-front.jpg, -sheet-back.jpg
 * Результат: hoaking-de-esperando-face.jpg, hoaking-de-esperando-back.jpg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const PNG_DIR = path.join(repoRoot, 'public', 'priory-pairs-png');

const COLS = 7;
const ROWS = 2;
/** 4-я карта сверху слева → индекс колонки 3, ряд 0 */
const COL = 3;
const ROW = 0;

const SHEET_FRONT = path.join(PNG_DIR, 'hoaking-de-esperando-sheet-front.jpg');
const SHEET_BACK = path.join(PNG_DIR, 'hoaking-de-esperando-sheet-back.jpg');
const OUT_FACE = path.join(PNG_DIR, 'hoaking-de-esperando-face.jpg');
const OUT_BACK = path.join(PNG_DIR, 'hoaking-de-esperando-back.jpg');

async function extractCell(inputPath, outPath) {
  const meta = await sharp(inputPath).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const cellW = Math.floor(W / COLS);
  const cellH = Math.floor(H / ROWS);
  const left = COL * cellW;
  const top = ROW * cellH;
  await sharp(inputPath)
    .extract({ left, top, width: cellW, height: cellH })
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

async function main() {
  let haveSheets = false;
  try {
    await fs.access(SHEET_FRONT);
    await fs.access(SHEET_BACK);
    haveSheets = true;
  } catch {
    /* optional sources */
  }

  if (haveSheets) {
    await extractCell(SHEET_FRONT, OUT_FACE);
    await extractCell(SHEET_BACK, OUT_BACK);
    console.log(
      `[extract-hoaking] Ячейка (${COL + 1},${ROW + 1}) → ${path.relative(repoRoot, OUT_FACE)}, ${path.relative(repoRoot, OUT_BACK)}`,
    );
    return;
  }

  try {
    await fs.access(OUT_FACE);
    await fs.access(OUT_BACK);
  } catch {
    throw new Error(
      '[extract-hoaking] Нет листов hoaking-de-esperando-sheet-front/back.jpg и нет готовых face/back — положите листы или face/back в public/priory-pairs-png/',
    );
  }
  console.log('[extract-hoaking] Листов нет, используются готовые hoaking-de-esperando-face/back.jpg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
