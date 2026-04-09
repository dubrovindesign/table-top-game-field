#!/usr/bin/env node
/**
 * Приорат Надежды: public/priory_of_hope-front.jpg — сетка 4×4.
 * Карточка = столбец + пара рядов (0–1 или 2–3), склейка по вертикали.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractPrioryColumnStitched } from './priory-column-stitch.mjs';
import { PRIORY_UNIT_SLICES } from './priory-unit-slices.mjs';
import { makePennantIcon } from './make-pennant-faction-icon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const FRONT = path.join(repoRoot, 'public', 'priory_of_hope-front.jpg');

/** Левый баннер в ячейке (0,0) сетки 4×4 на public/priory_of_hope-front.jpg */
const PRIORY_BANNER_EXTRACT = { left: 0, top: 36, width: 150, height: 620 };

async function writeFactionIcon() {
  await makePennantIcon({
    templatePath: path.join(repoRoot, 'public', 'castilla.webp'),
    sourcePath: path.join(repoRoot, 'public', 'priory_of_hope-front.jpg'),
    extract: PRIORY_BANNER_EXTRACT,
    outPath: path.join(repoRoot, 'public', 'priory_of_hope.webp'),
  });
  console.log('[priory-split] public/priory_of_hope.webp');
}

async function main() {
  for (const { id, col, rowPair } of PRIORY_UNIT_SLICES) {
    const buf = await extractPrioryColumnStitched(FRONT, col, rowPair);
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');
    await fs.writeFile(facePath, buf);
    await fs.writeFile(imagePath, buf);
    const m = await sharp(buf).metadata();
    console.log(`[priory-split] ${id} col ${col} rows ${rowPair}: ${m.width}x${m.height}`);
  }
  await writeFactionIcon();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
