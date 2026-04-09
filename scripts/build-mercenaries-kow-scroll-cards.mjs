#!/usr/bin/env node
/**
 * Наёмники KoW: склейка лица + обрезанного оборота.
 * Та же геометрия ячеек, что split-mercenaries-kow-spritesheet.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MERC_KOW_UNIT_COUNT, cellRectMercKowUnit } from './merc-kow-sheet-geometry.mjs';
import { inferMercKowGridFromFrontPath } from './merc-kow-infer-grid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Оборот: срез шапки (портрет/имя/иконки) — для листа 3306×2838 подобрано после анализа яркости по рядам. */
const BACK_TOP_CROP_RATIO = 0.262;
const BACK_TOP_CROP_LESS_PX = 27;
/**
 * Низ лица в склейке: фиксированные 30 px оставляли полосу с именем (дубль с верхом оборота).
 * Доля высоты ~5.3% (~37 px при h≈709) согласуется с границей «арт → баннер имени» на типичной ячейке.
 */
const FACE_BOTTOM_CROP_RATIO = 0.053;
const FACE_BOTTOM_CROP_PX_MIN = 28;
const FACE_BOTTOM_CROP_PX_MAX = 54;

const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

const UNITS = Array.from({ length: MERC_KOW_UNIT_COUNT }, (_, i) => `merc-kow-mr${String(i + 1).padStart(2, '0')}`);

const BACK_CANON = 'public/mercenaries-kow-back.jpg';

function computeFaceBottomCropPx(faceFullH) {
  const r = Math.round(faceFullH * FACE_BOTTOM_CROP_RATIO);
  return Math.min(FACE_BOTTOM_CROP_PX_MAX, Math.max(FACE_BOTTOM_CROP_PX_MIN, r));
}

async function ensureBackSheet() {
  const pathFront = path.join(repoRoot, 'public', 'mercenaries-kow-front.jpg');
  const pathBack = path.join(repoRoot, BACK_CANON);
  try {
    await fs.access(pathFront);
    await fs.access(pathBack);
  } catch {
    throw new Error(`Нужны оба листа: public/mercenaries-kow-front.jpg и ${BACK_CANON}`);
  }
  return pathBack;
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
  const pathFront = path.join(repoRoot, 'public', 'mercenaries-kow-front.jpg');
  const backPath = await ensureBackSheet();
  const { vLines, hLines, width: W, height: H } = await inferMercKowGridFromFrontPath(pathFront);
  const backMeta = await sharp(backPath).metadata();
  const bW = backMeta.width ?? 0;
  const bH = backMeta.height ?? 0;
  if (bW !== W || bH !== H) {
    throw new Error(`[merc-kow-scroll] размер оборота ${bW}×${bH} ≠ лица ${W}×${H}`);
  }
  console.log(`[merc-kow-scroll] сетка 4×2: vLines=[${vLines.join(', ')}]; hLines=[${hLines.join(', ')}]`);

  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (let i = 0; i < UNITS.length; i++) {
    const id = UNITS[i];
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');

    try {
      await fs.access(facePath);
    } catch {
      await fs.copyFile(imagePath, facePath);
      console.log(`[merc-kow-scroll] ${id}: copied image.jpg -> face.jpg`);
    }

    const { left, top, width, height } = cellRectMercKowUnit(i, vLines, hLines);
    const cropTop = Math.max(0, Math.round(height * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    const backStripHeight = height - cropTop;

    const faceBuf = await sharp(facePath).toBuffer();
    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    const bottomCropPx = computeFaceBottomCropPx(faceFullH);
    if (faceFullH <= bottomCropPx) {
      throw new Error(`[merc-kow-scroll] ${id}: face.jpg слишком низкий для среза снизу`);
    }

    const miniaturePath = path.join(dir, 'miniature.jpg');
    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniaturePath);

    const faceCropH = faceFullH - bottomCropPx;
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
      `[merc-kow-scroll] ${id}: face ${faceW}x${faceCropH} (−${bottomCropPx}px) + back ${faceW}x${backH} -> ${faceW}x${totalH}, hotspot y×${scaleY.toFixed(4)}`,
    );
  }
  console.log('[merc-kow-scroll] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
