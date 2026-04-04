import { Hex, type Layout, type Point } from './hex';

/**
 * Hexon draw scale — must match renderer `drawBigMiniHexonAtPoint` transform.
 */
export const BIG_MINI_VISUAL_SCALE = 0.92;

/**
 * HP badge for big miniatures: scale vs `baseRadius` (renderer + hit-test).
 */
export const BIG_UNIT_HEALTH_UI_SCALE = 0.68;

/** Small unit HP badge: scale vs hex half-height `halfH` (smaller badge). */
export const SMALL_UNIT_HEALTH_BADGE_SCALE = 0.52;

/**
 * Flat-top layout: `hexCornerOffset(1)` is the bottom-right vertex (+x, +y on screen).
 * Inset 1 = on vertex; lower = closer to center (keeps badge inside the cell).
 */
export const SMALL_UNIT_HEALTH_BADGE_CORNER_INDEX = 1;
export const SMALL_UNIT_HEALTH_BADGE_INSET_FRAC = 0.72;

/** HP badge anchor for small units: bottom-right of hex, rotated with the unit. */
export function smallUnitHealthBadgeCenterWorldRad(
  hexCenterWorld: Point,
  rotationRad: number,
  layout: Layout,
): Point {
  const v = layout.hexCornerOffset(SMALL_UNIT_HEALTH_BADGE_CORNER_INDEX);
  const x0 = v.x * SMALL_UNIT_HEALTH_BADGE_INSET_FRAC;
  const y0 = v.y * SMALL_UNIT_HEALTH_BADGE_INSET_FRAC;
  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);
  return {
    x: hexCenterWorld.x + c * x0 - s * y0,
    y: hexCenterWorld.y + s * x0 + c * y0,
  };
}

function hexonLocalCellCenters(layout: Layout): Point[] {
  const zero = new Hex(0, 0);
  const o = layout.hexToPixel(zero);
  return [
    { x: 0, y: 0 },
    ...Hex.directions.map((d) => {
      const p = layout.hexToPixel(zero.add(d));
      return { x: p.x - o.x, y: p.y - o.y };
    }),
  ];
}

function hexonBoundsLocal(layout: Layout): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of hexonLocalCellCenters(layout)) {
    for (let i = 0; i < 6; i++) {
      const off = layout.hexCornerOffset(i);
      const x = cell.x + off.x;
      const y = cell.y + off.y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Big miniature: HP badge centered on bottom edge, slightly inside the hexon (world space).
 */
export function bigMiniHealthBadgeCenterWorld(
  hexCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const b = hexonBoundsLocal(layout);
  const insetFrac = 0.86;
  const lx = 0;
  const ly = b.maxY * insetFrac;
  const lsx = lx * BIG_MINI_VISUAL_SCALE;
  const lsy = ly * BIG_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: hexCenterWorld.x + c * lsx - s * lsy,
    y: hexCenterWorld.y + s * lsx + c * lsy,
  };
}
