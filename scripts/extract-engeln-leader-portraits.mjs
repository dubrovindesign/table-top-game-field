#!/usr/bin/env node
/**
 * Вырезает портрет Брэйлона из полосы лидеров (4 колонки).
 * Айрис — полная карта из `ingest-engeln-singles.mjs` (single-02), не перезаписывать отсюда.
 * Путь к PNG: аргумент или engeln-leaders-strip.png в public/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const SLICES = [{ id: 'engeln-braylon-osveshchayuschiy-put', col: 2 }];

async function main() {
  const arg = process.argv[2];
  const src = arg
    ? path.isAbsolute(arg)
      ? arg
      : path.join(repoRoot, arg)
    : path.join(repoRoot, 'public', 'engeln-leaders-strip.png');

  await fs.access(src);

  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const sliceW = Math.floor(W / 4);

  for (const { id, col } of SLICES) {
    const left = col * sliceW;
    const width = col === 3 ? W - left : sliceW;
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });
    const buf = await sharp(src)
      .extract({ left, top: 0, width, height: H })
      .jpeg({ quality: 92 })
      .toBuffer();
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');
    const miniPath = path.join(dir, 'miniature.jpg');
    await sharp(buf).toFile(facePath);
    await sharp(buf).toFile(imagePath);
    await sharp(buf).toFile(miniPath);
    console.log(`[engeln-leaders] ${id} <- col ${col}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
