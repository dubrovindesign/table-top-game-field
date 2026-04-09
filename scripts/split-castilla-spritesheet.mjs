#!/usr/bin/env node
/**
 * Кастилия: public/kastilia-front.jpg — сетка 7×4, 25 карт (ряд 4: только 4 ячейки слева).
 * Нарезка в public/catalog-units/<unitId>/face.jpg + image.jpg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const COLS = 7;
const ROWS = 4;

const UNITS = [
  'castilla-gvardeets-alebardist',
  'castilla-dyavol-nalyotchik',
  'castilla-gonchaya-bezdny',
  'castilla-okhotnik-na-svyatykh',
  'castilla-sukkub-porokov',
  'castilla-ognemetchik-drakoniego-plameni',
  'castilla-oderzhimyy-naezdnik-i',
  'castilla-gvardeets-mushketer',
  'castilla-torkemad-prelat-chistoty',
  'castilla-bezlikiy-vladyka-nenavisti',
  'castilla-ofitser-gvardii',
  'castilla-flammalero-sekira',
  'castilla-flammalero-mortira',
  'castilla-flammalero-topory',
  'castilla-torkemad-revnitel-chistoty',
  'castilla-oderzhimyy-dvuruchnaya-sekira',
  'castilla-oderzhimyy-naezdnik-mortira',
  'castilla-monakh-gabrielit',
  'castilla-ochistitel',
  'castilla-khoakin-de-esperando',
  'castilla-osadnaya-mortira',
  'castilla-razrushitel-tyazhelyy-ognemetchik',
  'castilla-razrushitel-molot',
  'castilla-kattimp-s-pistoletom',
  'castilla-kattimp',
];

function cellRect(index, W, H) {
  const cellW = W / COLS;
  const cellH = H / ROWS;
  let row;
  let col;
  if (index < 21) {
    row = Math.floor(index / COLS);
    col = index % COLS;
  } else {
    row = 3;
    col = index - 21;
  }
  const left = Math.round(col * cellW);
  const top = Math.round(row * cellH);
  const right = Math.round((col + 1) * cellW);
  const bottom = Math.round((row + 1) * cellH);
  return { left, top, width: right - left, height: bottom - top };
}

async function main() {
  const src = path.join(repoRoot, 'public', 'kastilia-front.jpg');
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
