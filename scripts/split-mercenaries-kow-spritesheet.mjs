#!/usr/bin/env node
/**
 * Наёмники KoW: public/mercenaries-kow-front.jpg
 * Сетка 7×4; на листе 22 карты (ячейки 18–20 пустые). Границы ячеек — из merc-kow-infer-grid.mjs
 * (по изображению, не W/7).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MERC_KOW_UNIT_COUNT, cellRectMercKowUnit } from './merc-kow-sheet-geometry.mjs';
import { verifyMercKowCanonicalSides } from './merc-kow-detect-sides.mjs';
import { inferMercKowGridFromFrontPath } from './merc-kow-infer-grid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const UNITS = Array.from({ length: MERC_KOW_UNIT_COUNT }, (_, i) => `merc-kow-mr${String(i + 1).padStart(2, '0')}`);

async function main() {
  const pathFront = path.join(repoRoot, 'public', 'mercenaries-kow-front.jpg');
  const pathBack = path.join(repoRoot, 'public', 'mercenaries-kow-back.jpg');
  await verifyMercKowCanonicalSides(pathFront, pathBack);

  const src = pathFront;
  const { vLines, hLines, width: W, height: H } = await inferMercKowGridFromFrontPath(pathFront);
  console.log(`[merc-kow-split] сетка 4×2: vLines=[${vLines.join(', ')}]; hLines=[${hLines.join(', ')}]`);

  for (let i = 0; i < UNITS.length; i++) {
    const id = UNITS[i];
    const { left, top, width, height } = cellRectMercKowUnit(i, vLines, hLines);

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
