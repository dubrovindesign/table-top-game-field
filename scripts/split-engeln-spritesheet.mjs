#!/usr/bin/env node
/**
 * Ангельн: public/engeln-front.jpg — сетка 7×3, 20 карт (ряд 3: только 6 ячеек слева).
 * Нарезка в public/catalog-units/<id>/face.jpg + image.jpg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ENGELN_UNITS } from './engeln-units-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const COLS = 7;

const UNITS = ENGELN_UNITS.map((u) => u.id);

function cellRect(index, W, H) {
  const cellW = W / COLS;
  const cellH = H / 3;
  let row;
  let col;
  if (index < 14) {
    row = Math.floor(index / COLS);
    col = index % COLS;
  } else {
    row = 2;
    col = index - 14;
  }
  const left = Math.round(col * cellW);
  const top = Math.round(row * cellH);
  const right = Math.round((col + 1) * cellW);
  const bottom = Math.round((row + 1) * cellH);
  return { left, top, width: right - left, height: bottom - top };
}

async function main() {
  const src = path.join(repoRoot, 'public', 'engeln-front.jpg');
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;

  for (let i = 0; i < UNITS.length; i++) {
    const id = UNITS[i];
    const { left, top, width, height } = cellRect(i, W, H);

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
    console.log(outPath, width, height, '(+ face.jpg)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
