#!/usr/bin/env node
/**
 * Ассеты одиночных карт: WebP → public/catalog-units/<id>/image.jpg + miniature.jpg.
 * JSON пишет generate-engeln-singles-catalog.mjs (хотспоты с regions по скиллу).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ENGELN_SINGLE_IMPORT } from './engeln-singles-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const SRC_DIR = path.join(repoRoot, 'public', 'catalog-units', '_engeln-singles-src');

const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

async function writeMiniatureFromJpeg(jpegPath, outMiniPath) {
  const faceBuf = await fs.readFile(jpegPath);
  const fm = await sharp(faceBuf).metadata();
  const faceW = fm.width ?? 0;
  const faceFullH = fm.height ?? 0;
  const { x: nx, y: ny, w: nw, h: nh } = MINIATURE_ON_FACE;
  const left = Math.min(faceW - 1, Math.max(0, Math.round(nx * faceW)));
  const top = Math.min(faceFullH - 1, Math.max(0, Math.round(ny * faceFullH)));
  let width = Math.round(nw * faceW);
  let height = Math.round(nh * faceFullH);
  width = Math.max(1, Math.min(width, faceW - left));
  height = Math.max(1, Math.min(height, faceFullH - top));
  await sharp(faceBuf)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toFile(outMiniPath);
}

async function main() {
  for (const row of ENGELN_SINGLE_IMPORT) {
    const src = path.join(SRC_DIR, row.src);
    await fs.access(src).catch(() => {
      throw new Error(`[engeln-singles] нет файла: ${src}`);
    });

    const id = row.id;
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });

    const jpgPath = path.join(dir, 'image.jpg');
    await sharp(src).jpeg({ quality: 92 }).toFile(jpgPath);
    await writeMiniatureFromJpeg(jpgPath, path.join(dir, 'miniature.jpg'));

    await fs.unlink(path.join(dir, 'image.webp')).catch(() => {});

    console.log(`[engeln-singles] ${id} → image.jpg`);
  }
  console.log('[engeln-singles] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
