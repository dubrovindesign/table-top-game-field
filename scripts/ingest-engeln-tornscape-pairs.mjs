#!/usr/bin/env node
/**
 * Склейка одиночных лиц/оборотов Tornscape → public/catalog-units/<id>/image.jpg + miniature.jpg
 * (та же геометрия, что build-engeln-scroll-cards.mjs).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  ENGELN_TORNSCAPE_PAIRS,
  ENGELN_TORNSCAPE_SINGLE,
  ENGELN_TORNSCAPE_SRC_DEFAULT,
} from './engeln-tornscape-pairs-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const BACK_TOP_CROP_RATIO = 0.255;
const BACK_TOP_CROP_LESS_PX = 30;
const FACE_BOTTOM_CROP_PX = 30;

const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

async function readImageBuffer(srcPath) {
  const buf = await fs.readFile(srcPath);
  return sharp(buf);
}

async function writeMiniatureFromFace(faceBuf, outMiniPath) {
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

async function compositeScroll(faceSharpInput, backSharpInput) {
  const faceBuf = await faceSharpInput.jpeg({ quality: 92 }).toBuffer();
  const fm = await sharp(faceBuf).metadata();
  const faceFullH = fm.height ?? 0;
  const faceW = fm.width ?? 0;
  if (faceFullH <= FACE_BOTTOM_CROP_PX) {
    throw new Error(`face слишком низкий: ${faceFullH}px`);
  }

  let backBuf = await backSharpInput.jpeg({ quality: 92 }).toBuffer();
  let bm = await sharp(backBuf).metadata();
  let backW = bm.width ?? 0;
  let backH = bm.height ?? 0;
  if (backW !== faceW) {
    backBuf = await sharp(backBuf).resize(faceW, null, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer();
    bm = await sharp(backBuf).metadata();
    backW = bm.width ?? 0;
    backH = bm.height ?? 0;
  }

  const cropTop = Math.max(0, Math.round(backH * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
  const backStripHeight = backH - cropTop;
  backBuf = await sharp(backBuf)
    .extract({ left: 0, top: cropTop, width: backW, height: backStripHeight })
    .jpeg({ quality: 92 })
    .toBuffer();

  const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
  const faceCroppedBuf = await sharp(faceBuf)
    .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
    .toBuffer();

  bm = await sharp(backBuf).metadata();
  const backStripH = bm.height ?? 0;
  const totalH = faceCropH + backStripH;

  const outBuf = await sharp({
    create: {
      width: faceW,
      height: totalH,
      channels: 3,
      background: { r: 24, g: 22, b: 20 },
    },
  })
    .composite([
      { input: faceCroppedBuf, top: 0, left: 0 },
      { input: backBuf, top: faceCropH, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return { imageBuf: outBuf, faceBuf, faceW, faceFullH, totalH, scaleY: faceFullH / totalH };
}

async function main() {
  const srcRoot = process.argv[2] || ENGELN_TORNSCAPE_SRC_DEFAULT;

  for (const row of ENGELN_TORNSCAPE_PAIRS) {
    const facePath = path.join(srcRoot, row.face);
    const backPath = path.join(srcRoot, row.back);
    await fs.access(facePath).catch(() => {
      throw new Error(`Нет файла: ${facePath}`);
    });
    await fs.access(backPath).catch(() => {
      throw new Error(`Нет файла: ${backPath}`);
    });

    const dir = path.join(repoRoot, 'public', 'catalog-units', row.id);
    await fs.mkdir(dir, { recursive: true });

    const { imageBuf, faceBuf, scaleY } = await compositeScroll(await readImageBuffer(facePath), await readImageBuffer(backPath));
    const imagePath = path.join(dir, 'image.jpg');
    await fs.writeFile(imagePath, imageBuf);
    await writeMiniatureFromFace(faceBuf, path.join(dir, 'miniature.jpg'));

    await fs.writeFile(
      path.join(dir, 'scroll-meta.json'),
      JSON.stringify({ scaleY, id: row.id }, null, 2),
      'utf8',
    );

    console.log(`[engeln-tornscape] ${row.id} scaleY=${scaleY.toFixed(4)}`);
  }

  {
    const row = ENGELN_TORNSCAPE_SINGLE;
    const p = path.join(srcRoot, row.file);
    await fs.access(p).catch(() => {
      throw new Error(`Нет файла: ${p}`);
    });
    const dir = path.join(repoRoot, 'public', 'catalog-units', row.id);
    await fs.mkdir(dir, { recursive: true });
    const faceBuf = await sharp(await fs.readFile(p)).jpeg({ quality: 92 }).toBuffer();
    await fs.writeFile(path.join(dir, 'image.jpg'), faceBuf);
    await writeMiniatureFromFace(faceBuf, path.join(dir, 'miniature.jpg'));
    await fs.writeFile(path.join(dir, 'scroll-meta.json'), JSON.stringify({ scaleY: 1, id: row.id, single: true }, null, 2), 'utf8');
    console.log(`[engeln-tornscape] ${row.id} (single)`);
  }

  console.log('[engeln-tornscape] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
