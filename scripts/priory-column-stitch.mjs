/**
 * Приорат: лист 4×4. Одна карта = столбец `col` и пара рядов `rowPair` (0→ряды 0+1, 2→ряды 2+3).
 */
import sharp from 'sharp';

const COLS = 4;

function colRect(col, W) {
  const left = Math.round((col * W) / COLS);
  const right = Math.round(((col + 1) * W) / COLS);
  return { left, width: right - left };
}

/**
 * @param {string} srcPath
 * @param {number} col 0..3
 * @param {0 | 2} [rowPairStart]
 */
export async function extractPrioryColumnStitched(srcPath, col, rowPairStart = 0) {
  if (rowPairStart !== 0 && rowPairStart !== 2) {
    throw new Error(`[priory-stitch] rowPairStart must be 0 or 2, got ${rowPairStart}`);
  }
  const meta = await sharp(srcPath).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const rowH = H / 4;
  const { left, width } = colRect(col, W);
  const top0 = Math.round(rowPairStart * rowH);
  const top1 = Math.round((rowPairStart + 1) * rowH);
  const h0 = Math.round((rowPairStart + 1) * rowH) - top0;
  const h1 = Math.round((rowPairStart + 2) * rowH) - top1;

  const topBuf = await sharp(srcPath)
    .extract({ left, top: top0, width, height: h0 })
    .jpeg({ quality: 92 })
    .toBuffer();
  const botBuf = await sharp(srcPath)
    .extract({ left, top: top1, width, height: h1 })
    .jpeg({ quality: 92 })
    .toBuffer();

  const fm = await sharp(topBuf).metadata();
  const fmh = fm.height ?? 0;
  const fw = fm.width ?? 0;
  const bmh = (await sharp(botBuf).metadata()).height ?? 0;

  return sharp({
    create: {
      width: fw,
      height: fmh + bmh,
      channels: 3,
      background: { r: 20, g: 28, b: 40 },
    },
  })
    .composite([
      { input: topBuf, left: 0, top: 0 },
      { input: botBuf, left: 0, top: fmh },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
