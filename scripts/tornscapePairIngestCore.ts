/**
 * Склейка лица + оборота Tornscape, опционально OCR статы и хотспоты «Торкемад».
 * Используется `batch-ingest-tornscape-cards.ts`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { UnitCardData } from '../src/unitCard';
import { buildTornscapeScrollHotspotRegionsFromA2Preset } from '../src/catalog/tornscapeScrollHotspots';
import { parsedAttackToAbility } from '../src/catalog/kowCardStatsOcrParse';
import {
  runOcrOnFaceBackBuffers,
  runOcrOnScrollImage,
  type OcrKowCardResult,
} from './ocrKowCardFace';

export const BACK_TOP_CROP_RATIO = 0.255;
export const BACK_TOP_CROP_LESS_PX = 30;
export const FACE_BOTTOM_CROP_PX = 30;

export const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

const OUT_JPEG = { quality: 92, mozjpeg: true };

export type TornscapeIngestOptions = {
  repoRoot: string;
  frontAbs: string;
  backAbs: string;
  unitId: string;
  /** 0 = без даунскейла */
  maxEdge: number;
  ocr: boolean;
  noHotspot: boolean;
  noTorKemadTemplate: boolean;
  dryRun: boolean;
};

export type TornscapeIngestResult = {
  unitId: string;
  faceW: number;
  faceFullH: number;
  totalH: number;
  scaleY: number;
};

async function optimizeSourceToJpegBuffer(absPath: string, maxEdge: number) {
  const rawMeta = await sharp(absPath).metadata();
  let p = sharp(absPath).rotate();
  if (rawMeta.hasAlpha === true) {
    p = p.flatten({ background: { r: 24, g: 22, b: 20 } });
  }
  const m = await p.metadata();
  const w = m.width ?? 0;
  const h = m.height ?? 0;
  if (maxEdge > 0 && (w > maxEdge || h > maxEdge)) {
    p = p.resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  return p.jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
}

function scaleHotspotRegions(
  regions: { x: number; y: number; w: number; h: number }[],
  scaleY: number,
) {
  return regions.map((r) => ({
    ...r,
    y: r.y * scaleY,
    h: r.h * scaleY,
  }));
}

function unscaleHotspotRegions(
  regions: { x: number; y: number; w: number; h: number }[],
  oldScaleY: number,
) {
  if (oldScaleY <= 0 || oldScaleY === 1) return regions;
  return regions.map((r) => ({
    ...r,
    y: r.y / oldScaleY,
    h: r.h / oldScaleY,
  }));
}

async function writeMiniatureFromFace(faceBuf: Buffer, faceW: number, faceFullH: number, outPath: string) {
  const { x: nx, y: ny, w: nw, h: nh } = MINIATURE_ON_FACE;
  const left = Math.min(faceW - 1, Math.max(0, Math.round(nx * faceW)));
  const top = Math.min(faceFullH - 1, Math.max(0, Math.round(ny * faceFullH)));
  let width = Math.round(nw * faceW);
  let height = Math.round(nh * faceFullH);
  width = Math.max(1, Math.min(width, faceW - left));
  height = Math.max(1, Math.min(height, faceFullH - top));
  await sharp(faceBuf)
    .extract({ left, top, width, height })
    .jpeg({ ...OUT_JPEG, quality: 90 })
    .toFile(outPath);
}

async function compositeScroll(faceBuf: Buffer, backBuf: Buffer) {
  const fm = await sharp(faceBuf).metadata();
  const faceFullH = fm.height ?? 0;
  const faceW = fm.width ?? 0;
  if (faceFullH <= FACE_BOTTOM_CROP_PX) {
    throw new Error(`[tornscapePairIngest] Лицевая сторона слишком низкая: ${faceFullH}px`);
  }

  const faceOutBuf = await sharp(faceBuf).jpeg(OUT_JPEG).toBuffer();

  const bmBack = await sharp(backBuf).metadata();
  const backFullW = bmBack.width ?? 0;
  const backFullH = bmBack.height ?? 0;
  const cropTop = Math.max(0, Math.round(backFullH * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
  let backStripBuf = await sharp(backBuf)
    .extract({ left: 0, top: cropTop, width: backFullW, height: backFullH - cropTop })
    .jpeg(OUT_JPEG)
    .toBuffer();

  let bm = await sharp(backStripBuf).metadata();
  if ((bm.width ?? 0) !== faceW) {
    backStripBuf = await sharp(backStripBuf).resize(faceW, null, { fit: 'fill' }).jpeg(OUT_JPEG).toBuffer();
    bm = await sharp(backStripBuf).metadata();
  }

  const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
  const faceCroppedBuf = await sharp(faceOutBuf)
    .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
    .toBuffer();

  const backH = bm.height ?? 0;
  const totalH = faceCropH + backH;

  const imageBuf = await sharp({
    create: {
      width: faceW,
      height: totalH,
      channels: 3,
      background: { r: 24, g: 22, b: 20 },
    },
  })
    .composite([
      { input: faceCroppedBuf, top: 0, left: 0 },
      { input: backStripBuf, top: faceCropH, left: 0 },
    ])
    .jpeg(OUT_JPEG)
    .toBuffer();

  const scaleY = faceFullH / totalH;
  return {
    imageBuf,
    faceBuf: faceOutBuf,
    faceW,
    faceFullH,
    faceCropH,
    totalH,
    scaleY,
  };
}

function mergeOcrIntoCard(card: UnitCardData, ocr: OcrKowCardResult): UnitCardData {
  const c = structuredClone(card);
  const s = ocr.stats;
  if (s.health != null) {
    c.health = s.health;
    c.maxHealth = s.maxHealth ?? s.health;
  }
  if (s.walk != null) c.walk = s.walk;
  if (s.run != null) c.run = s.run;
  if (s.defenseWhite != null || s.defenseGreen != null) {
    c.defense = {
      ...c.defense,
      ...(s.defenseWhite != null ? { white: s.defenseWhite } : {}),
      ...(s.defenseGreen != null ? { green: s.defenseGreen } : {}),
    };
  }
  if (ocr.firstAttack && ocr.firstAttack.name.trim()) {
    c.attacks = [parsedAttackToAbility(ocr.firstAttack)];
  }
  return c;
}

/**
 * Одна пара файлов → ассеты + при --ocr обновление units/hotspots.
 */
export async function ingestTornscapeCardPair(opts: TornscapeIngestOptions): Promise<TornscapeIngestResult> {
  const {
    repoRoot,
    frontAbs,
    backAbs,
    unitId,
    maxEdge,
    ocr,
    noHotspot,
    noTorKemadTemplate,
    dryRun,
  } = opts;

  const unitJsonPath = path.join(repoRoot, 'src', 'catalog', 'units', `${unitId}.json`);
  await fs.access(unitJsonPath).catch(() => {
    throw new Error(`[tornscapePairIngest] Нет файла каталога: ${unitJsonPath}`);
  });

  const outDir = path.join(repoRoot, 'public', 'catalog-units', unitId);
  const imagePath = path.join(outDir, 'image.jpg');
  const miniaturePath = path.join(outDir, 'miniature.jpg');

  if (dryRun) {
    console.log(`[dry-run] ${imagePath}`);
    console.log(`[dry-run] ${miniaturePath}`);
    const raw = await fs.readFile(unitJsonPath, 'utf8');
    const j = JSON.parse(raw) as { card: UnitCardData };
    const fm = await sharp(await optimizeSourceToJpegBuffer(frontAbs, maxEdge)).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    const bm = await sharp(await optimizeSourceToJpegBuffer(backAbs, maxEdge)).metadata();
    const backFullH = bm.height ?? 0;
    const cropTop = Math.max(0, Math.round(backFullH * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
    const backH = backFullH - cropTop;
    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const totalH = faceCropH + backH;
    const scaleY = faceFullH / totalH;
    return { unitId, faceW, faceFullH, faceCropH, totalH, scaleY };
  }

  const faceOpt = await optimizeSourceToJpegBuffer(frontAbs, maxEdge);
  const backOpt = await optimizeSourceToJpegBuffer(backAbs, maxEdge);

  await fs.mkdir(outDir, { recursive: true });

  const { imageBuf, faceBuf, faceW, faceFullH, faceCropH, totalH, scaleY } = await compositeScroll(
    faceOpt,
    backOpt,
  );

  let mergedCard: UnitCardData | null = null;
  if (ocr) {
    console.log(`[tornscapePairIngest] ${unitId}: OCR (rus+eng)…`);
    const ocrResult = unitId.startsWith('blackthorn-')
      ? await runOcrOnScrollImage(imageBuf, {
          width: faceW,
          faceFullH,
          faceCropH,
          totalH,
          backBuf: backOpt,
        })
      : await runOcrOnFaceBackBuffers(faceOpt, backOpt);
    const unitRaw = await fs.readFile(unitJsonPath, 'utf8');
    const unitJson = JSON.parse(unitRaw) as { card: UnitCardData; id: string; points?: number };
    mergedCard = mergeOcrIntoCard(unitJson.card, ocrResult);
    unitJson.card = mergedCard;
    await fs.writeFile(unitJsonPath, JSON.stringify(unitJson, null, 2) + '\n', 'utf8');
    console.log(`[tornscapePairIngest] Обновлён каталог: ${unitJsonPath}`);
  }

  await fs.writeFile(imagePath, imageBuf);
  await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniaturePath);

  {
    const unitRawSprites = await fs.readFile(unitJsonPath, 'utf8');
    const uj = JSON.parse(unitRawSprites) as { card: UnitCardData; id: string; points?: number };
    uj.card.sprite = `/catalog-units/${unitId}/image.jpg`;
    uj.card.miniatureSprite = `/catalog-units/${unitId}/miniature.jpg`;
    await fs.writeFile(unitJsonPath, JSON.stringify(uj, null, 2) + '\n', 'utf8');
  }

  if (!noHotspot) {
    const hfPath = path.join(repoRoot, 'src', 'catalog', 'hotspots', `${unitId}.json`);
    let hotspotExists = false;
    try {
      await fs.access(hfPath);
      hotspotExists = true;
    } catch {
      /* нет файла */
    }

    const unitSnap = JSON.parse(await fs.readFile(unitJsonPath, 'utf8')) as { card: UnitCardData };
    const cardForHotspots = mergedCard ?? unitSnap.card;

    if (!noTorKemadTemplate) {
      const payload = {
        image: `/catalog-units/${unitId}/image.jpg`,
        title: cardForHotspots.name,
        regions: buildTornscapeScrollHotspotRegionsFromA2Preset(cardForHotspots),
        scrollLayout: { faceH: faceFullH, totalH },
      };
      await fs.writeFile(hfPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      console.log(
        `[tornscapePairIngest] ${hotspotExists ? 'Обновлён' : 'Создан'} хотспот (пресет a2): ${hfPath}`,
      );
    } else if (hotspotExists) {
      const raw = await fs.readFile(hfPath, 'utf8');
      const data = JSON.parse(raw) as {
        image?: string;
        title?: string;
        regions: { x: number; y: number; w: number; h: number }[];
        scrollLayout?: { faceH: number; totalH: number };
      };
      let regions = data.regions ?? [];
      if (data.scrollLayout?.faceH && data.scrollLayout?.totalH) {
        const oldS = data.scrollLayout.faceH / data.scrollLayout.totalH;
        regions = unscaleHotspotRegions(regions, oldS);
      }
      data.image = `/catalog-units/${unitId}/image.jpg`;
      data.regions = scaleHotspotRegions(regions, scaleY);
      data.scrollLayout = { faceH: faceFullH, totalH };
      await fs.writeFile(hfPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log(`[tornscapePairIngest] Обновлён хотспот (пересчёт y/h): ${hfPath}`);
    } else {
      console.warn(
        `[tornscapePairIngest] Нет ${path.basename(hfPath)} и --no-tor-kemad-template — пропуск хотспотов.`,
      );
    }
  }

  console.log(
    `[tornscapePairIngest] ${unitId}: face ${faceW}×${faceFullH - FACE_BOTTOM_CROP_PX} + back → ${faceW}×${totalH}, scaleY=${scaleY.toFixed(4)}`,
  );

  return { unitId, faceW, faceFullH, totalH, scaleY };
}
