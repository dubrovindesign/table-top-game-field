#!/usr/bin/env node
/**
 * Splits public/krigmark-units.jpg (6×4 grid, 21 cards) into
 * public/catalog-units/<unitId>/image.jpg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const UNITS = [
  'krigmark-returned-mod-i',
  'krigmark-line-mace',
  'krigmark-field-medic',
  'krigmark-doomed-grenadier',
  'krigmark-necro-alchemist',
  'krigmark-homunculus',
  'krigmark-immortal',
  'krigmark-death-bringer',
  'krigmark-heavy-crossbow',
  'krigmark-war-abomination',
  'krigmark-gottfried-goed-kriglingen',
  'krigmark-gottfried-goed-iron-hand',
  'krigmark-shock-mace',
  'krigmark-shock-launcher',
  'krigmark-shock-crossbow',
  'krigmark-dalmar-schulz',
  'krigmark-kofer-mod-a',
  'krigmark-kofer-mod-b',
  'krigmark-kofer-mod-c',
  'krigmark-yagdzombie',
  'krigmark-kristof-koller',
];

async function main() {
  const src = path.join(repoRoot, 'public', 'krigmark-units.jpg');
  const img = sharp(src);
  const meta = await img.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const cellW = W / 6;
  const cellH = H / 4;

  for (let i = 0; i < UNITS.length; i++) {
    const id = UNITS[i];
    let row;
    let col;
    if (i < 18) {
      row = Math.floor(i / 6);
      col = i % 6;
    } else {
      row = 3;
      col = i - 18;
    }
    const left = Math.round(col * cellW);
    const top = Math.round(row * cellH);
    const right = Math.round((col + 1) * cellW);
    const bottom = Math.round((row + 1) * cellH);
    const width = right - left;
    const height = bottom - top;

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
