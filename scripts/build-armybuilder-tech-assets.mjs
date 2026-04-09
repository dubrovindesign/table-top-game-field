#!/usr/bin/env node
/**
 * Army Builder: тех «Бойд Великолепный» и «Автоматон М.У.Л.» (ab-ns-*-boyd / ab-ns-*-mul).
 *
 * Как build-mercenaries-kow-scroll-cards.mjs:
 * - лицо: image.webp (или image.jpg) — лицевая карта целиком;
 * - оборот: back.webp / back.jpg рядом с лицом (те же пиксели W×H, что и лицо, или будет подогнан под лицо);
 * - image.jpg — склейка: лицо без нижней полосы (дубль с оборотом) + оборот без верхней шапки;
 * - miniature.jpg — кроп портрета (MINIATURE_ON_FACE, как у merc-kow);
 * - face.jpg — сохранённое лицо (как у merc после split), для отладки/повторного прогона.
 *
 * Если оборота нет — предупреждение и только лицо в image.jpg (без среза низа).
 *
 * Вход: public/catalog-units/armybuilder-boyd/ и armybuilder-mul/
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Синхронно с build-mercenaries-kow-scroll-cards.mjs */
const BACK_TOP_CROP_RATIO = 0.262;
const BACK_TOP_CROP_LESS_PX = 27;
const FACE_BOTTOM_CROP_RATIO = 0.053;
const FACE_BOTTOM_CROP_PX_MIN = 28;
const FACE_BOTTOM_CROP_PX_MAX = 54;

const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

const BOYD_IDS = [
  'ab-ns-blackthorn-boyd',
  'ab-ns-broomgarhorde-boyd',
  'ab-ns-castilla-boyd',
  'ab-ns-chasm-boyd',
  'ab-ns-engeln-boyd',
  'ab-ns-keld-boyd',
  'ab-ns-krigmark-boyd',
  'ab-ns-prioryofhope-boyd',
];

const MUL_IDS = [
  'ab-ns-blackthorn-mul',
  'ab-ns-broomgarhorde-mul',
  'ab-ns-castilla-mul',
  'ab-ns-chasm-mul',
  'ab-ns-engeln-mul',
  'ab-ns-keld-mul',
  'ab-ns-krigmark-mul',
  'ab-ns-prioryofhope-mul',
];

function computeFaceBottomCropPx(faceFullH) {
  const r = Math.round(faceFullH * FACE_BOTTOM_CROP_RATIO);
  return Math.min(FACE_BOTTOM_CROP_PX_MAX, Math.max(FACE_BOTTOM_CROP_PX_MIN, r));
}

async function resolveFrontFile(dir) {
  for (const name of ['image.webp', 'image.png', 'image.jpg', 'image.jpeg']) {
    const p = path.join(dir, name);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* next */
    }
  }
  throw new Error(`[armybuilder-tech] нет лица (image.webp / image.jpg) в ${path.relative(repoRoot, dir)}`);
}

/** Оборот: полный лист той же карты, что и лицо. */
async function resolveBackFile(dir) {
  for (const name of ['back.webp', 'back.png', 'back.jpg', 'back.jpeg', 'image-back.webp', 'image-back.jpg']) {
    const p = path.join(dir, name);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
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

/**
 * Только лицо (нет оборота): полный фронт в image.jpg.
 * @returns {{ imageUrl: string, miniatureUrl: string, scrollLayout?: { faceH: number, totalH: number } }}
 */
async function buildFaceOnly(frontPath, outDir, folderBase) {
  const buf = await fs.readFile(frontPath);
  const meta = await sharp(buf).metadata();
  const faceW = meta.width ?? 0;
  const faceFullH = meta.height ?? 0;
  if (faceW < 2 || faceFullH < 2) throw new Error(`[armybuilder-tech] слишком мало ${frontPath}`);

  await fs.mkdir(outDir, { recursive: true });
  const imageJpg = path.join(outDir, 'image.jpg');
  const miniJpg = path.join(outDir, 'miniature.jpg');
  await sharp(buf).jpeg({ quality: 92 }).toFile(imageJpg);
  await writeMiniatureFromFace(buf, faceW, faceFullH, miniJpg);

  return {
    imageUrl: `/catalog-units/${folderBase}/image.jpg`,
    miniatureUrl: `/catalog-units/${folderBase}/miniature.jpg`,
    scrollLayout: { faceH: faceFullH, totalH: faceFullH },
  };
}

/**
 * Лицо + оборот: как merc-kow scroll.
 */
async function buildStitched(frontPath, backPath, outDir, folderBase) {
  const frontBuf = await fs.readFile(frontPath);
  let backRaw = await fs.readFile(backPath);

  const fm = await sharp(frontBuf).metadata();
  const faceW = fm.width ?? 0;
  const faceFullH = fm.height ?? 0;
  if (faceW < 2 || faceFullH < 2) throw new Error(`[armybuilder-tech] лицо слишком мало ${frontPath}`);

  let bm = await sharp(backRaw).metadata();
  let bw = bm.width ?? 0;
  let bh = bm.height ?? 0;
  if (bw !== faceW || bh !== faceFullH) {
    backRaw = await sharp(backRaw).resize(faceW, faceFullH, { fit: 'fill' }).toBuffer();
    bm = await sharp(backRaw).metadata();
    bw = bm.width ?? 0;
    bh = bm.height ?? 0;
  }
  if (bw !== faceW || bh !== faceFullH) {
    throw new Error(`[armybuilder-tech] не удалось подогнать оборот к лицу ${faceW}×${faceFullH}`);
  }

  const height = faceFullH;
  const cropTop = Math.max(0, Math.round(height * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
  const backStripHeight = height - cropTop;
  if (backStripHeight < 1) throw new Error('[armybuilder-tech] оборот после среза верха — нулевой');

  const bottomCropPx = computeFaceBottomCropPx(faceFullH);
  if (faceFullH <= bottomCropPx) {
    throw new Error(`[armybuilder-tech] лицо слишком низкое для среза снизу (${bottomCropPx}px)`);
  }

  await fs.mkdir(outDir, { recursive: true });
  await sharp(frontBuf).jpeg({ quality: 92 }).toFile(path.join(outDir, 'face.jpg'));

  const miniaturePath = path.join(outDir, 'miniature.jpg');
  await writeMiniatureFromFace(frontBuf, faceW, faceFullH, miniaturePath);

  const faceCropH = faceFullH - bottomCropPx;
  const faceCroppedBuf = await sharp(frontBuf)
    .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
    .toBuffer();

  let backBuf = await sharp(backRaw)
    .extract({ left: 0, top: cropTop, width: faceW, height: backStripHeight })
    .toBuffer();

  let bMeta = await sharp(backBuf).metadata();
  if ((bMeta.width ?? 0) !== faceW) {
    backBuf = await sharp(backBuf).resize(faceW, null, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer();
    bMeta = await sharp(backBuf).metadata();
  }

  const backH = bMeta.height ?? 0;
  const totalH = faceCropH + backH;

  const imagePath = path.join(outDir, 'image.jpg');
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

  return {
    imageUrl: `/catalog-units/${folderBase}/image.jpg`,
    miniatureUrl: `/catalog-units/${folderBase}/miniature.jpg`,
    scrollLayout: { faceH: faceFullH, totalH },
    logLine: `face ${faceW}×${faceCropH} (−${bottomCropPx}px) + back ${faceW}×${backH} → ${faceW}×${totalH}`,
  };
}

async function patchUnitJson(unitId, sprite, miniatureSprite) {
  const p = path.join(repoRoot, 'src', 'catalog', 'units', `${unitId}.json`);
  const j = JSON.parse(await fs.readFile(p, 'utf8'));
  j.card = j.card ?? {};
  j.card.sprite = sprite;
  j.card.miniatureSprite = miniatureSprite;
  await fs.writeFile(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
}

async function writeHotspot(unitId, imageUrl, title, scrollLayout) {
  const payload = {
    image: imageUrl,
    title,
    regions: [],
    ...(scrollLayout ? { scrollLayout } : {}),
  };
  const p = path.join(repoRoot, 'src', 'catalog', 'hotspots', `${unitId}.json`);
  await fs.writeFile(p, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function main() {
  const publicUnits = path.join(repoRoot, 'public', 'catalog-units');
  const boydDir = path.join(publicUnits, 'armybuilder-boyd');
  const mulDir = path.join(publicUnits, 'armybuilder-mul');

  const boydFront = await resolveFrontFile(boydDir);
  const mulFront = await resolveFrontFile(mulDir);
  const boydBack = await resolveBackFile(boydDir);
  const mulBack = await resolveBackFile(mulDir);

  let boydResult;
  if (boydBack) {
    boydResult = await buildStitched(boydFront, boydBack, boydDir, 'armybuilder-boyd');
    console.log(`[armybuilder-tech] armybuilder-boyd: склейка — ${boydResult.logLine}`);
  } else {
    console.warn(
      `[armybuilder-tech] нет оборота в armybuilder-boyd (положите back.webp рядом с лицом) — только лицо в image.jpg`,
    );
    boydResult = await buildFaceOnly(boydFront, boydDir, 'armybuilder-boyd');
  }

  let mulResult;
  if (mulBack) {
    mulResult = await buildStitched(mulFront, mulBack, mulDir, 'armybuilder-mul');
    console.log(`[armybuilder-tech] armybuilder-mul: склейка — ${mulResult.logLine}`);
  } else {
    console.warn(
      `[armybuilder-tech] нет оборота в armybuilder-mul (положите back.webp рядом с лицом) — только лицо в image.jpg`,
    );
    mulResult = await buildFaceOnly(mulFront, mulDir, 'armybuilder-mul');
  }

  const { logLine: _b, ...boydUrls } = boydResult;
  const { logLine: _m, ...mulUrls } = mulResult;

  for (const id of BOYD_IDS) {
    await patchUnitJson(id, boydUrls.imageUrl, boydUrls.miniatureUrl);
    await writeHotspot(id, boydUrls.imageUrl, 'Бойд Великолепный', boydUrls.scrollLayout);
  }
  for (const id of MUL_IDS) {
    await patchUnitJson(id, mulUrls.imageUrl, mulUrls.miniatureUrl);
    await writeHotspot(id, mulUrls.imageUrl, 'Автоматон "М.У.Л."', mulUrls.scrollLayout);
  }

  console.log(
    `[armybuilder-tech] готово: hotspots + units, ${BOYD_IDS.length} boyd, ${MUL_IDS.length} mul`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
