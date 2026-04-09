#!/usr/bin/env node
/**
 * Орда брумгаров: склейка лицевой стороны с обрезанным оборотом (как Кастилия).
 * Листы: public/broomgar-front.jpg, public/broomgar-back.jpg
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

const COLS = 7;
const ROWS = 3;

/** Должен совпадать со split-broomgar-spritesheet.mjs (лицо и оборот — те же ячейки 3×7). */
const UNIT_SLICES = [
  { id: 'broomgar-bibar-batyr-topory', cell: 0 },
  { id: 'broomgar-bibar-batyr-bombarda', cell: 1 },
  { id: 'broomgar-zurbag-myasnik', cell: 2 },
  { id: 'broomgar-gakhay-prasha', cell: 3 },
  { id: 'broomgar-gakhay-bumerang', cell: 4 },
  { id: 'broomgar-gakhay-rogatina', cell: 5 },
  { id: 'broomgar-kotel-kolbasy-burtaga', cell: 6 },
  { id: 'broomgar-mutsereg-topory', cell: 7 },
  { id: 'broomgar-mutsereg-sekira', cell: 8 },
  { id: 'broomgar-tsereg-bulava', cell: 9 },
  { id: 'broomgar-tsereg-tesak', cell: 10 },
  { id: 'broomgar-yargachin-bulava', cell: 11 },
  { id: 'broomgar-yargachin-mech', cell: 12 },
  { id: 'broomgar-kotel-ryba-ognevik', cell: 13 },
  { id: 'broomgar-daychin-tesaki', cell: 14 },
  { id: 'broomgar-daychin-bulava', cell: 15 },
  { id: 'broomgar-daychin-znamenosets', cell: 16 },
  { id: 'broomgar-shaktan-ruchnitsa', cell: 17 },
  { id: 'broomgar-shaktan-trezubets', cell: 18 },
  { id: 'broomgar-kurosh-khan', cell: 19 },
  { id: 'broomgar-kotel-sup-bul-ragvy', cell: 20 },
  { id: 'broomgar-zurbag-razoritel', cell: 2 },
  { id: 'broomgar-zurbag-pokoritel', cell: 2 },
  { id: 'broomgar-grrokh-ten-shaktana', cell: 17 },
];

const BACK_CANON = 'public/broomgar-back.jpg';

function cellRectFromCell(cell, W, H) {
  const cellW = W / COLS;
  const cellH = H / ROWS;
  const row = Math.floor(cell / COLS);
  const col = cell % COLS;
  const left = Math.round(col * cellW);
  const top = Math.round(row * cellH);
  const right = Math.round((col + 1) * cellW);
  const bottom = Math.round((row + 1) * cellH);
  return { left, top, width: right - left, height: bottom - top };
}

async function ensureBackSheet() {
  const shortPath = path.join(repoRoot, BACK_CANON);
  try {
    await fs.access(shortPath);
    return shortPath;
  } catch {
    throw new Error(`Нет файла оборота: положите лист в ${BACK_CANON}`);
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
  const backMeta = await sharp(backPath).metadata();
  const W = backMeta.width ?? 0;
  const H = backMeta.height ?? 0;

  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (const { id, cell } of UNIT_SLICES) {
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');

    try {
      await fs.access(path.join(dir, 'face.jpg'));
    } catch {
      await fs.copyFile(imagePath, facePath);
      console.log(`[broomgar-scroll] ${id}: copied image.jpg -> face.jpg`);
    }

    const { left, top, width, height } = cellRectFromCell(cell, W, H);
    const cropTop = Math.max(0, Math.round(height * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    const backStripHeight = height - cropTop;

    const faceBuf = await sharp(facePath).toBuffer();
    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) {
      throw new Error(`[broomgar-scroll] ${id}: face.jpg слишком низкий для среза снизу`);
    }

    const miniaturePath = path.join(dir, 'miniature.jpg');
    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniaturePath);

    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const faceCroppedBuf = await sharp(faceBuf)
      .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
      .toBuffer();

    let backBuf = await sharp(backPath)
      .extract({ left, top: top + cropTop, width, height: backStripHeight })
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
      `[broomgar-scroll] ${id}: face ${faceW}x${faceCropH} + back ${faceW}x${backH} -> ${faceW}x${totalH}, hotspot y×${scaleY.toFixed(4)}`,
    );
  }
  console.log(
    '[broomgar-scroll] Готово. `vite preview` читает dist/: после смены JPG сделайте npm run build.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
