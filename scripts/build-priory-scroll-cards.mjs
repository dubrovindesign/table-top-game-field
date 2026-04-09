#!/usr/bin/env node
/**
 * Приорат Надежды: склейка лицевой колонки (ряд0+ряд1 лица) с обрезанным оборотом той же колонки.
 * Листы: public/priory_of_hope-front.jpg (уже в face.jpg), public/priory_of_hope-back.jpg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { extractPrioryColumnStitched } from './priory-column-stitch.mjs';
import { PRIORY_UNIT_SLICES } from './priory-unit-slices.mjs';

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

const BACK_CANON = path.join(repoRoot, 'public', 'priory_of_hope-back.jpg');

async function ensureBackSheet() {
  try {
    await fs.access(BACK_CANON);
    return BACK_CANON;
  } catch {
    throw new Error(`Нет файла оборота: положите лист в public/priory_of_hope-back.jpg`);
  }
}

function scaleHotspotRegions(regions, scaleY) {
  return regions.map((r) => ({
    ...r,
    y: r.y * scaleY,
    h: r.h * scaleY,
  }));
}

function unscaleHotspotRegions(regions, oldScaleY) {
  if (oldScaleY <= 0 || oldScaleY === 1) return regions;
  return regions.map((r) => ({
    ...r,
    y: r.y / oldScaleY,
    h: r.h / oldScaleY,
  }));
}

async function writeMiniatureFromFace(faceBuf, faceW, faceFullH, outPath) {
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
    .toFile(outPath);
}

async function main() {
  const backPath = await ensureBackSheet();
  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (const { id, col, rowPair } of PRIORY_UNIT_SLICES) {
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');

    const backStitchedBuf = await extractPrioryColumnStitched(backPath, col, rowPair);
    let bm0 = await sharp(backStitchedBuf).metadata();
    const backFullW = bm0.width ?? 0;
    const backFullH = bm0.height ?? 0;

    const faceBuf = await sharp(facePath).toBuffer();
    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) {
      throw new Error(`[priory-scroll] ${id}: face.jpg слишком низкий`);
    }

    const miniaturePath = path.join(dir, 'miniature.jpg');
    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniaturePath);

    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const faceCroppedBuf = await sharp(faceBuf)
      .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
      .toBuffer();

    const cropTop = Math.max(0, Math.round(backFullH * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    const backStripHeight = backFullH - cropTop;
    let backBuf = await sharp(backStitchedBuf)
      .extract({ left: 0, top: cropTop, width: backFullW, height: backStripHeight })
      .jpeg({ quality: 92 })
      .toBuffer();

    let bm = await sharp(backBuf).metadata();
    if ((bm.width ?? 0) !== faceW) {
      backBuf = await sharp(backBuf)
        .resize(faceW, null, { fit: 'fill' })
        .jpeg({ quality: 92 })
        .toBuffer();
      bm = await sharp(backBuf).metadata();
    }

    const backH = bm.height ?? 0;
    const totalH = faceCropH + backH;

    await sharp({
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
      .toFile(imagePath);

    const scaleY = faceFullH / totalH;
    const hfPath = path.join(hotspotsDir, `${id}.json`);
    const raw = await fs.readFile(hfPath, 'utf8');
    const data = JSON.parse(raw);
    let regions = data.regions;
    if (data.scrollLayout?.faceH && data.scrollLayout?.totalH) {
      const oldS = data.scrollLayout.faceH / data.scrollLayout.totalH;
      regions = unscaleHotspotRegions(regions, oldS);
    }
    data.image = `/catalog-units/${id}/image.jpg`;
    data.regions = scaleHotspotRegions(regions, scaleY);
    data.scrollLayout = { faceH: faceFullH, totalH: totalH };
    await fs.writeFile(hfPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(
      `[priory-scroll] ${id}: face ${faceW}x${faceCropH} + back -> ${faceW}x${totalH}, y×${scaleY.toFixed(4)}`,
    );
  }
  console.log('[priory-scroll] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
