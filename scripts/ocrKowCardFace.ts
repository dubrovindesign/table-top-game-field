/**
 * OCR лица и оборота: статы с **кропов зон** лица (Tornscape), fallback — полный текст.
 */
import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import {
  mergeKowStatsPreferCrops,
  parseFirstAttackFromOcrText,
  parseStatsFromOcrText,
  parsedFirstAttackFromAttackCrop,
  parsedFirstAttackFromDigitFields,
  type ParsedFirstAttack,
  type ParsedKowCardStats,
} from '../src/catalog/kowCardStatsOcrParse';
import {
  TORNSCAPE_ATTACK_DIGIT_REGIONS,
  TORNSCAPE_FACE_REGIONS,
  faceNormRectToScrollNormRect,
  parseDefenseCropDigits,
  parseFirstSmallInt,
  type NormRect,
} from '../src/catalog/kowTornscapeFaceLayout';

export type OcrKowCardResult = {
  /** Полный текст распознавания лица или всего скролла (зависит от режима OCR). */
  faceText: string;
  backText: string;
  mergedText: string;
  stats: ParsedKowCardStats;
  firstAttack: ParsedFirstAttack | null;
};

/** Эталон Arc II: ~828×1419; при другом H/W слегка сдвигаем зоны статов по Y. */
const REF_FACE_ASPECT = 1419 / 828;

function verticalBiasY(faceW: number, faceH: number): number {
  const a = faceH / faceW;
  return Math.max(-0.04, Math.min(0.04, (REF_FACE_ASPECT - a) * 0.42));
}

function biasRectY(rect: NormRect, dy: number): NormRect {
  const y = Math.max(0.005, Math.min(0.995 - rect.h, rect.y + dy));
  return { ...rect, y };
}

const MIN_CROP_PX = 28;

async function cropFaceBuffer(faceBuf: Buffer, rect: NormRect): Promise<Buffer> {
  const meta = await sharp(faceBuf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const dy = verticalBiasY(W, H);
  const r = biasRectY(rect, dy);
  let left = Math.max(0, Math.floor(r.x * W));
  let top = Math.max(0, Math.floor(r.y * H));
  let width = Math.max(MIN_CROP_PX, Math.floor(r.w * W));
  let height = Math.max(MIN_CROP_PX, Math.floor(r.h * H));
  if (left + width > W) left = Math.max(0, W - width);
  if (top + height > H) top = Math.max(0, H - height);
  width = Math.min(width, W - left);
  height = Math.min(height, H - top);
  width = Math.max(MIN_CROP_PX, width);
  height = Math.max(MIN_CROP_PX, height);
  return sharp(faceBuf).extract({ left, top, width, height }).png().toBuffer();
}

/** Кроп по долям **полной склейки** image.jpg (без сдвига по aspect лица). */
async function cropScrollBuffer(imageBuf: Buffer, rect: NormRect): Promise<Buffer> {
  const meta = await sharp(imageBuf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const r = rect;
  let left = Math.max(0, Math.floor(r.x * W));
  let top = Math.max(0, Math.floor(r.y * H));
  let width = Math.max(MIN_CROP_PX, Math.floor(r.w * W));
  let height = Math.max(MIN_CROP_PX, Math.floor(r.h * H));
  if (left + width > W) left = Math.max(0, W - width);
  if (top + height > H) top = Math.max(0, H - height);
  width = Math.min(width, W - left);
  height = Math.min(height, H - top);
  width = Math.max(MIN_CROP_PX, width);
  height = Math.max(MIN_CROP_PX, height);
  return sharp(imageBuf).extract({ left, top, width, height }).png().toBuffer();
}

export type ScrollOcrLayout = {
  width: number;
  faceFullH: number;
  faceCropH: number;
  totalH: number;
  backBuf: Buffer;
};

/**
 * OCR по **склеенному** изображению (как `image.jpg`): зоны заданы в долях скролла,
 * получаются из эталонных face-норм через `faceNormRectToScrollNormRect` (Великий Терновник / Arc II).
 */
export async function runOcrOnScrollImage(
  imageBuf: Buffer,
  layout: ScrollOcrLayout,
): Promise<OcrKowCardResult> {
  const { faceFullH, totalH, faceCropH, backBuf } = layout;
  const toScroll = (r: NormRect) => faceNormRectToScrollNormRect(r, faceFullH, totalH);

  const worker = await createWorker('rus+eng');
  try {
    const R = TORNSCAPE_FACE_REGIONS;
    const A = TORNSCAPE_ATTACK_DIGIT_REGIONS;
    const [
      defBuf,
      hpBuf,
      walkBuf,
      runBuf,
      atkBuf,
      atkNameBuf,
      arBuf,
      adBuf,
      arRedBuf,
      arBlBuf,
      arGrBuf,
    ] = await Promise.all([
      cropScrollBuffer(imageBuf, toScroll(R.defenseBlock)),
      cropScrollBuffer(imageBuf, toScroll(R.healthBlock)),
      cropScrollBuffer(imageBuf, toScroll(R.walkBlock)),
      cropScrollBuffer(imageBuf, toScroll(R.runBlock)),
      cropScrollBuffer(imageBuf, toScroll(R.firstAttackBlock)),
      cropScrollBuffer(imageBuf, toScroll(R.firstAttackNameBand)),
      cropScrollBuffer(imageBuf, toScroll(A.range)),
      cropScrollBuffer(imageBuf, toScroll(A.damage)),
      cropScrollBuffer(imageBuf, toScroll(A.red)),
      cropScrollBuffer(imageBuf, toScroll(A.black)),
      cropScrollBuffer(imageBuf, toScroll(A.green)),
    ]);

    const defText = await ocrDefenseDigitsBlock(worker, defBuf);
    const hpText = await ocrDigitsLine(worker, hpBuf);
    const walkText = await ocrDigitsLine(worker, walkBuf);
    const runText = await ocrDigitsLine(worker, runBuf);

    const attackStripText = await ocrFreeTextBlock(worker, atkBuf);
    const attackNameRaw = await ocrFreeTextBlock(worker, atkNameBuf);
    const fromAttackStripParsed = parsedFirstAttackFromAttackCrop(attackStripText);
    const bannerName = pickAttackNameFromBannerText(attackNameRaw);
    const attackNameHint =
      bannerName !== 'Атака'
        ? bannerName
        : (fromAttackStripParsed?.name?.trim() ? fromAttackStripParsed.name : 'Атака');

    const atkRText = await ocrDigitsLine(worker, arBuf);
    const atkDText = await ocrDigitsLine(worker, adBuf);
    const atkRedT = await ocrDigitsLine(worker, arRedBuf);
    const atkBlT = await ocrDigitsLine(worker, arBlBuf);
    const atkGrT = await ocrDigitsLine(worker, arGrBuf);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
    const im = await sharp(imageBuf).metadata();
    const iW = im.width ?? 0;
    const iH = im.height ?? 0;
    const statsTop = Math.min(Math.floor(faceFullH * 0.36), Math.max(0, faceCropH - 2));
    const statsH = Math.min(Math.floor(faceFullH * 0.5), Math.max(MIN_CROP_PX, faceCropH - statsTop));
    const statsZoneBuf =
      iW > 0 && faceCropH > 0
        ? await sharp(imageBuf)
            .extract({ left: 0, top: statsTop, width: iW, height: statsH })
            .png()
            .toBuffer()
        : imageBuf;
    const scrollR = await worker.recognize(imageBuf);
    const statsZoneR = await worker.recognize(statsZoneBuf);
    const backR = await worker.recognize(backBuf);
    const scrollText = scrollR.data.text ?? '';
    const statsZoneText = statsZoneR.data.text ?? '';
    const backText = backR.data.text ?? '';
    const mergedText = `${statsZoneText}\n${scrollText}\n${backText}`;

    const fromCrops = statsFromFaceCrops(defText, hpText, walkText, runText);
    const fromFull = parseStatsFromOcrText(mergedText);
    const stats = mergeKowStatsPreferCrops(fromCrops, fromFull);

    const fromDigitAtk = parsedFirstAttackFromDigitFields({
      nameHint: attackNameHint,
      range: parseFirstSmallInt(atkRText, 20),
      damage: parseFirstSmallInt(atkDText, 20),
      red: parseFirstSmallInt(atkRedT, 20),
      black: parseFirstSmallInt(atkBlT, 20),
      green: parseFirstSmallInt(atkGrT, 20),
    });
    const fromAttackCrop = fromAttackStripParsed;
    const fromFullAtk = parseFirstAttackFromOcrText(mergedText);
    const firstAttack = fromDigitAtk ?? fromAttackCrop ?? fromFullAtk;

    if (process.env.DEBUG_OCR === '1') {
      console.error('[DEBUG_OCR scroll]', {
        defText,
        hpText,
        walkText,
        runText,
        atkRText,
        atkDText,
        atkRedT,
        atkBlT,
        atkGrT,
        attackNameRaw: attackNameRaw.slice(0, 200),
        attackStripHead: attackStripText.slice(0, 300),
      });
    }

    return { faceText: scrollText, backText, mergedText, stats, firstAttack };
  } finally {
    await worker.terminate();
  }
}

/** Мелкие кропы плохо читаются — увеличиваем без размытия (nearest). */
async function upsampleDigitCrop(buf: Buffer): Promise<Buffer> {
  const m = await sharp(buf).metadata();
  const w = m.width ?? 1;
  const minW = 220;
  if (w >= minW) return buf;
  const scale = Math.ceil(minW / w);
  return sharp(buf)
    .resize(Math.round(w * scale), null, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

async function ocrDigitsLine(worker: Awaited<ReturnType<typeof createWorker>>, buf: Buffer): Promise<string> {
  const prep = await upsampleDigitCrop(buf);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: '',
  });
  const r = await worker.recognize(prep);
  return r.data.text ?? '';
}

/** Два куба защиты друг под другом — без whitelist (цифры на цветных гранях). */
async function ocrDefenseDigitsBlock(worker: Awaited<ReturnType<typeof createWorker>>, buf: Buffer): Promise<string> {
  const prep = await upsampleDigitCrop(buf);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessedit_char_whitelist: '',
  });
  const r = await worker.recognize(prep);
  return r.data.text ?? '';
}

function pickAttackNameFromBannerText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const ud = lines.find((l) => /УДАР|ВЫСТРЕЛ/i.test(l) && l.length < 90);
  if (ud) return ud.slice(0, 100);
  const cyr = lines.find((l) => /[а-яА-ЯЁё]{8,}/.test(l) && l.length < 90);
  if (cyr) return cyr.slice(0, 100);
  return 'Атака';
}

async function ocrFreeTextBlock(worker: Awaited<ReturnType<typeof createWorker>>, buf: Buffer): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessedit_char_whitelist: '',
  });
  const r = await worker.recognize(buf);
  return r.data.text ?? '';
}

function statsFromFaceCrops(
  defText: string,
  hpText: string,
  walkText: string,
  runText: string,
): ParsedKowCardStats {
  const def = parseDefenseCropDigits(defText);
  const hp = parseFirstSmallInt(hpText, 99);
  const walk = parseFirstSmallInt(walkText, 15);
  const run = parseFirstSmallInt(runText, 15);
  const out: ParsedKowCardStats = {};
  if (def.white != null) out.defenseWhite = def.white;
  if (def.green != null) out.defenseGreen = def.green;
  if (hp != null) {
    out.health = hp;
    out.maxHealth = hp;
  }
  if (walk != null) out.walk = walk;
  if (run != null) out.run = run;
  return out;
}

export async function runOcrOnFaceBackBuffers(faceBuf: Buffer, backBuf: Buffer): Promise<OcrKowCardResult> {
  const worker = await createWorker('rus+eng');
  try {
    const [
      defBuf,
      hpBuf,
      walkBuf,
      runBuf,
      atkBuf,
      atkNameBuf,
      arBuf,
      adBuf,
      arRedBuf,
      arBlBuf,
      arGrBuf,
    ] = await Promise.all([
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.defenseBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.healthBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.walkBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.runBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.firstAttackBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.firstAttackNameBand),
      cropFaceBuffer(faceBuf, TORNSCAPE_ATTACK_DIGIT_REGIONS.range),
      cropFaceBuffer(faceBuf, TORNSCAPE_ATTACK_DIGIT_REGIONS.damage),
      cropFaceBuffer(faceBuf, TORNSCAPE_ATTACK_DIGIT_REGIONS.red),
      cropFaceBuffer(faceBuf, TORNSCAPE_ATTACK_DIGIT_REGIONS.black),
      cropFaceBuffer(faceBuf, TORNSCAPE_ATTACK_DIGIT_REGIONS.green),
    ]);

    const defText = await ocrDefenseDigitsBlock(worker, defBuf);
    const hpText = await ocrDigitsLine(worker, hpBuf);

    const walkText = await ocrDigitsLine(worker, walkBuf);
    const runText = await ocrDigitsLine(worker, runBuf);

    const attackStripText = await ocrFreeTextBlock(worker, atkBuf);
    const attackNameRaw = await ocrFreeTextBlock(worker, atkNameBuf);
    const fromAttackStripParsed = parsedFirstAttackFromAttackCrop(attackStripText);
    const bannerName = pickAttackNameFromBannerText(attackNameRaw);
    const attackNameHint =
      bannerName !== 'Атака'
        ? bannerName
        : (fromAttackStripParsed?.name?.trim() ? fromAttackStripParsed.name : 'Атака');

    const atkRText = await ocrDigitsLine(worker, arBuf);
    const atkDText = await ocrDigitsLine(worker, adBuf);
    const atkRedT = await ocrDigitsLine(worker, arRedBuf);
    const atkBlT = await ocrDigitsLine(worker, arBlBuf);
    const atkGrT = await ocrDigitsLine(worker, arGrBuf);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
    const fm = await sharp(faceBuf).metadata();
    const fW = fm.width ?? 0;
    const fH = fm.height ?? 0;
    /** Нижняя часть лица без портрета/имени — лучше для fallback-парсера «ОЗ / Шаг / Бег». */
    const statsZoneBuf =
      fW > 0 && fH > 0
        ? await sharp(faceBuf)
            .extract({
              left: 0,
              top: Math.floor(fH * 0.36),
              width: fW,
              height: Math.floor(fH * 0.5),
            })
            .png()
            .toBuffer()
        : faceBuf;
    const faceR = await worker.recognize(faceBuf);
    const statsZoneR = await worker.recognize(statsZoneBuf);
    const backR = await worker.recognize(backBuf);
    const faceText = faceR.data.text ?? '';
    const statsZoneText = statsZoneR.data.text ?? '';
    const backText = backR.data.text ?? '';
    const mergedText = `${statsZoneText}\n${faceText}\n${backText}`;

    const fromCrops = statsFromFaceCrops(defText, hpText, walkText, runText);
    const fromFull = parseStatsFromOcrText(mergedText);
    const stats = mergeKowStatsPreferCrops(fromCrops, fromFull);

    const fromDigitAtk = parsedFirstAttackFromDigitFields({
      nameHint: attackNameHint,
      range: parseFirstSmallInt(atkRText, 20),
      damage: parseFirstSmallInt(atkDText, 20),
      red: parseFirstSmallInt(atkRedT, 20),
      black: parseFirstSmallInt(atkBlT, 20),
      green: parseFirstSmallInt(atkGrT, 20),
    });
    const fromAttackCrop = fromAttackStripParsed;
    const fromFullAtk = parseFirstAttackFromOcrText(mergedText);
    const firstAttack = fromDigitAtk ?? fromAttackCrop ?? fromFullAtk;

    if (process.env.DEBUG_OCR === '1') {
      console.error('[DEBUG_OCR]', {
        defText,
        hpText,
        walkText,
        runText,
        atkRText,
        atkDText,
        atkRedT,
        atkBlT,
        atkGrT,
        attackNameRaw: attackNameRaw.slice(0, 200),
        attackStripHead: attackStripText.slice(0, 300),
      });
    }

    return { faceText, backText, mergedText, stats, firstAttack };
  } finally {
    await worker.terminate();
  }
}

export { parseStatsFromOcrText, parseFirstAttackFromOcrText };
