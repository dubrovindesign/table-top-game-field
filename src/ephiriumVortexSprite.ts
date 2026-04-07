/**
 * Sprite sheet `public/ephyr-cards.webp` — 6×3 grid (3300×2301).
 * Face cards: indices 0–15 row-major (rows 0–1 full, row 2 cols 0–3).
 * Card back: row 2, col 5.
 */

export const EPHYR_CARD_SPRITE_SRC = '/ephyr-cards.webp';

/** Background-size width multiplier for CSS (6 columns). */
export const EPHYR_SPRITE_BG_SIZE_X = '600%';

export function ephyrSpriteGridForFaceIndex(faceIndex0To15: number): { col: number; row: number } {
  if (faceIndex0To15 >= 0 && faceIndex0To15 <= 5) return { col: faceIndex0To15, row: 0 };
  if (faceIndex0To15 <= 11) return { col: faceIndex0To15 - 6, row: 1 };
  if (faceIndex0To15 <= 15) return { col: faceIndex0To15 - 12, row: 2 };
  throw new RangeError(`Ephyr face index must be 0..15, got ${faceIndex0To15}`);
}

/** Percent values for background-position (6 cols × 3 rows). */
export function ephyrSpriteBgPercentForFace(faceIndex0To15: number): { xPct: number; yPct: number } {
  const { col, row } = ephyrSpriteGridForFaceIndex(faceIndex0To15);
  return { xPct: (col / 5) * 100, yPct: (row / 2) * 100 };
}

export function ephyrCardBackBgPercent(): { xPct: number; yPct: number } {
  return { xPct: 100, yPct: 100 };
}
