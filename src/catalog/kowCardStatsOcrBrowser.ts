/**
 * OCR в редакторе каталога: кропы зон лица Tornscape + fallback по полному тексту.
 */
import {
  mergeKowStatsPreferCrops,
  parseFirstAttackFromOcrText,
  parseStatsFromOcrText,
  parsedFirstAttackFromAttackCrop,
  type ParsedFirstAttack,
  type ParsedKowCardStats,
} from './kowCardStatsOcrParse';
import {
  TORNSCAPE_FACE_REGIONS,
  parseDefenseCropDigits,
  parseFirstSmallInt,
  type NormRect,
} from './kowTornscapeFaceLayout';

export type BrowserOcrKowResult = {
  mergedText: string;
  stats: ParsedKowCardStats;
  firstAttack: ParsedFirstAttack | null;
};

function cropNormRectToCanvas(bmp: ImageBitmap, rect: NormRect): HTMLCanvasElement {
  const W = bmp.width;
  const H = bmp.height;
  const sx = Math.max(0, Math.floor(rect.x * W));
  const sy = Math.max(0, Math.floor(rect.y * H));
  const sw = Math.max(1, Math.floor(rect.w * W));
  const sh = Math.max(1, Math.floor(rect.h * H));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('[kowOcr] canvas 2d');
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
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

export async function runOcrOnFaceBackFiles(face: File, back: File): Promise<BrowserOcrKowResult> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('rus+eng');
  const faceBmp = await createImageBitmap(face);
  try {
    const defC = cropNormRectToCanvas(faceBmp, TORNSCAPE_FACE_REGIONS.defenseBlock);
    const hpC = cropNormRectToCanvas(faceBmp, TORNSCAPE_FACE_REGIONS.healthBlock);
    const walkC = cropNormRectToCanvas(faceBmp, TORNSCAPE_FACE_REGIONS.walkBlock);
    const runC = cropNormRectToCanvas(faceBmp, TORNSCAPE_FACE_REGIONS.runBlock);
    const atkC = cropNormRectToCanvas(faceBmp, TORNSCAPE_FACE_REGIONS.firstAttackBlock);

    async function ocrDigitsLine(canvas: HTMLCanvasElement): Promise<string> {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: '0123456789',
      });
      const r = await worker.recognize(canvas);
      return r.data.text ?? '';
    }

    async function ocrFreeBlock(canvas: HTMLCanvasElement): Promise<string> {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: '',
      });
      const r = await worker.recognize(canvas);
      return r.data.text ?? '';
    }

    const defText = await ocrDigitsLine(defC);
    const hpText = await ocrDigitsLine(hpC);
    const walkText = await ocrDigitsLine(walkC);
    const runText = await ocrDigitsLine(runC);
    const attackStripText = await ocrFreeBlock(atkC);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
    const faceBuf = new Uint8Array(await face.arrayBuffer());
    const backBuf = new Uint8Array(await back.arrayBuffer());
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

    return { mergedText, stats, firstAttack };
  } finally {
    faceBmp.close();
    await worker.terminate();
  }
}
