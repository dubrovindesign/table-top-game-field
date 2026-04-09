/**
 * Сетка наёмников KoW: **4 колонки × 2 ряда** (8 слотов; на листе заполнены 6 — первый ряд целиком,
 * второй ряд только первые два слота слева).
 *
 * Границы — равномерное деление ширины на 4 и высоты на 2 с округлением пикселей
 * (`round(i×W/4)`, `round(j×H/2)`), без формулы 7×4.
 */
import sharp from 'sharp';

/**
 * @returns {{ vLines: number[], hLines: number[], width: number, height: number }}
 */
export function buildUniformGrid4x2(w, h) {
  const vLines = [];
  for (let c = 0; c <= 4; c++) {
    vLines.push(Math.round((c * w) / 4));
  }
  const hLines = [];
  for (let r = 0; r <= 2; r++) {
    hLines.push(Math.round((r * h) / 2));
  }
  return { vLines, hLines, width: w, height: h };
}

/**
 * @returns {Promise<{ vLines: number[], hLines: number[], width: number, height: number }>}
 */
export async function inferMercKowGridFromFrontPath(frontPath) {
  const meta = await sharp(frontPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return buildUniformGrid4x2(width, height);
}
