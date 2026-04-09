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
  type ParsedFirstAttack,
  type ParsedKowCardStats,
} from '../src/catalog/kowCardStatsOcrParse';
import {
  TORNSCAPE_FACE_REGIONS,
  parseDefenseCropDigits,
  parseFirstSmallInt,
  type NormRect,
} from '../src/catalog/kowTornscapeFaceLayout';

export type OcrKowCardResult = {
  faceText: string;
  backText: string;
  mergedText: string;
  stats: ParsedKowCardStats;
  firstAttack: ParsedFirstAttack | null;
};

async function cropFaceBuffer(faceBuf: Buffer, rect: NormRect): Promise<Buffer> {
  const meta = await sharp(faceBuf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const left = Math.max(0, Math.floor(rect.x * W));
  const top = Math.max(0, Math.floor(rect.y * H));
  const width = Math.max(1, Math.floor(rect.w * W));
  const height = Math.max(1, Math.floor(rect.h * H));
  return sharp(faceBuf).extract({ left, top, width, height }).png().toBuffer();
}

async function ocrDigitsLine(worker: Awaited<ReturnType<typeof createWorker>>, buf: Buffer): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: '0123456789',
  });
  const r = await worker.recognize(buf);
  return r.data.text ?? '';
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
  const hp = parseFirstSmallInt(hpText, 35);
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
    const [defBuf, hpBuf, walkBuf, runBuf, atkBuf] = await Promise.all([
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.defenseBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.healthBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.walkBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.runBlock),
      cropFaceBuffer(faceBuf, TORNSCAPE_FACE_REGIONS.firstAttackBlock),
    ]);

    const defText = await ocrDigitsLine(worker, defBuf);
    const hpText = await ocrDigitsLine(worker, hpBuf);
    const walkText = await ocrDigitsLine(worker, walkBuf);
    const runText = await ocrDigitsLine(worker, runBuf);

    const attackStripText = await ocrFreeTextBlock(worker, atkBuf);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
    const faceR = await worker.recognize(faceBuf);
    const backR = await worker.recognize(backBuf);
    const faceText = faceR.data.text ?? '';
    const backText = backR.data.text ?? '';
    const mergedText = `${faceText}\n${backText}`;

    const fromCrops = statsFromFaceCrops(defText, hpText, walkText, runText);
    const fromFull = parseStatsFromOcrText(mergedText);
    const stats = mergeKowStatsPreferCrops(fromCrops, fromFull);

    const fromAttackCrop = parsedFirstAttackFromAttackCrop(attackStripText);
    const fromFullAtk = parseFirstAttackFromOcrText(mergedText);
    const firstAttack = fromAttackCrop ?? fromFullAtk;

    return { faceText, backText, mergedText, stats, firstAttack };
  } finally {
    await worker.terminate();
  }
}

export { parseStatsFromOcrText, parseFirstAttackFromOcrText };
