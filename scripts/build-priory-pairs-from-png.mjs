#!/usr/bin/env node
/**
 * Приорат: отдельные пары PNG (лицевая + вторая сторона одной карты), та же склейка, что у build-priory-scroll-cards.
 * Исходники: public/priory-pairs-png/<slug>-face/-back — .png, .jpg или .jpeg
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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

/** id → basename в public/priory-pairs-png/ (без суффикса -face/-back) */
const PAIRS = [
  { id: 'priory_of_hope-brigadir-strazhey-poberezhya', basename: 'brigadir' },
  { id: 'priory_of_hope-sanador-strazhey-poberezhya', basename: 'sanador' },
  { id: 'priory_of_hope-iskatel-strazhey-poberezhya', basename: 'iskatel' },
  { id: 'priory_of_hope-khoakin-de-esperando', basename: 'hoaking-de-esperando' },
];

const PNG_DIR = path.join(repoRoot, 'public', 'priory-pairs-png');

async function resolveFaceBackPaths(basename) {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const facePathFs = path.join(PNG_DIR, `${basename}-face.${ext}`);
    const backPathFs = path.join(PNG_DIR, `${basename}-back.${ext}`);
    try {
      await fs.access(facePathFs);
      await fs.access(backPathFs);
      return { facePathFs, backPathFs };
    } catch {
      /* next ext */
    }
  }
  throw new Error(
    `[priory-png-pairs] Нет пары ${basename}-face/-back (.png/.jpg/.jpeg) в ${PNG_DIR}`,
  );
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
  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (const { id, basename } of PAIRS) {
    const { facePathFs, backPathFs } = await resolveFaceBackPaths(basename);

    const faceBuf = await sharp(facePathFs).jpeg({ quality: 92 }).toBuffer();
    const backFullBuf = await sharp(backPathFs).jpeg({ quality: 92 }).toBuffer();

    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) {
      throw new Error(`[priory-png-pairs] ${id}: face слишком низкий`);
    }

    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });
    const faceOut = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');
    await fs.writeFile(faceOut, faceBuf);

    const miniaturePath = path.join(dir, 'miniature.jpg');
    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniaturePath);

    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const faceCroppedBuf = await sharp(faceBuf)
      .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
      .toBuffer();

    const bmBack = await sharp(backFullBuf).metadata();
    const backFullW = bmBack.width ?? 0;
    const backFullH = bmBack.height ?? 0;
    const cropTop = Math.max(0, Math.round(backFullH * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    let backBuf = await sharp(backFullBuf)
      .extract({ left: 0, top: cropTop, width: backFullW, height: backFullH - cropTop })
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

    console.log(`[priory-png-pairs] ${id}: ${faceW}x${faceCropH} + back -> ${faceW}x${totalH}`);
  }
  console.log('[priory-png-pairs] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
