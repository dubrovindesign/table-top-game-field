#!/usr/bin/env node
/**
 * Кастилия: склеивает лицевую карту (face) с обрезанным низом оборотной стороны
 * (убраны портрет, имя, блок защиты/здоровья — остаются плашки и текст снизу).
 * Результат: один длинный image.jpg для карточки + скролл; face.jpg — только лицо для миниатюры.
 *
 * Нужны файлы:
 * - public/kastilia-back.jpg — лист оборотов (та же сетка 7×4 / 25 карт, что лицевая сетка)
 *
 * Константа BACK_TOP_CROP_RATIO — доля высоты ячейки оборота, срезаемая сверху (подобрать визуально).
 * BACK_TOP_CROP_LESS_PX — на столько пикселей *уменьшить* срез (показать больше верха оборота).
 * FACE_BOTTOM_CROP_PX — срез снизу у лицевой части в склейке (face.jpg на диске полный, для миниатюры).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Доля высоты ячейки оборота: отрезать сверху (шапка с именем и иконками) */
const BACK_TOP_CROP_RATIO = 0.255;
/** Меньше срезать на N px сверху (больше видно верх оборотной части) */
const BACK_TOP_CROP_LESS_PX = 30;
/** Срезать снизу лицо в составном image.jpg (хотспоты считаются от полной высоты face.jpg) */
const FACE_BOTTOM_CROP_PX = 30;

/**
 * Миниатюра в армии / на столе: вырез с полного face.jpg (доли 0–1).
 * Рамка: правее баннера фракции, до ~правого края, сверху до низа арта (перед блоком с именем) — как на референс-скрине.
 */
const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

const COLS = 7;

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

const BACK_CANON = 'public/kastilia-back.jpg';

function cellRect(index, W, H) {
  const cellW = W / COLS;
  const cellH = H / 4;
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

/** Вернуть координаты относительно только лица (до склейки со спинкой) */
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

  for (let i = 0; i < UNITS.length; i++) {
    const id = UNITS[i];
    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    const facePath = path.join(dir, 'face.jpg');
    const imagePath = path.join(dir, 'image.jpg');

    try {
      await fs.access(path.join(dir, 'face.jpg'));
    } catch {
      await fs.copyFile(imagePath, facePath);
      console.log(`[castilla-scroll] ${id}: copied image.jpg -> face.jpg`);
    }

    const { left, top, width, height } = cellRect(i, W, H);
    const cropTop = Math.max(0, Math.round(height * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    const backStripHeight = height - cropTop;

    const faceBuf = await sharp(facePath).toBuffer();
    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) {
      throw new Error(`[castilla-scroll] ${id}: face.jpg слишком низкий для среза снизу`);
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

    /** Доли хотспотов в generate от полной высоты face.jpg → в доли полной склейки */
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
    /** faceH = полная высота face.jpg (как в редакторе хотспотов), totalH = склейка */
    data.scrollLayout = { faceH: faceFullH, totalH: totalH };
    await fs.writeFile(hfPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(
      `[castilla-scroll] ${id}: face ${faceW}x${faceCropH} (лицо −${FACE_BOTTOM_CROP_PX}px снизу) + back ${faceW}x${backH} -> ${faceW}x${totalH}, hotspot y×${scaleY.toFixed(4)}`,
    );
  }
  console.log(
    '[castilla-scroll] Готово. `vite preview` читает dist/: после смены JPG сделайте npm run build (или preview:mp).',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
