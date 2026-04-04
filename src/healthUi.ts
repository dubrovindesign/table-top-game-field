import {
  Hex,
  type Layout,
  type Point,
  layoutHugeMiniTriplePointWorld,
} from './hex';

/**
 * Hexon draw scale — must match renderer `drawBigMiniHexonAtPoint` transform.
 */
export const BIG_MINI_VISUAL_SCALE = 0.92;

/** Large mini (3-hex triangle) draw scale. */
export const LARGE_MINI_VISUAL_SCALE = 0.92;

/** Huge mini (3-hexon triangle) draw scale. */
export const HUGE_MINI_VISUAL_SCALE = 0.88;

/**
 * HP badge for big miniatures: scale vs `baseRadius` (renderer + hit-test).
 */
export const BIG_UNIT_HEALTH_UI_SCALE = 0.68;

/** Small unit HP badge: scale vs hex half-height `halfH` (smaller badge). */
export const SMALL_UNIT_HEALTH_BADGE_SCALE = 0.52;

/** When − / + is open, badge + buttons scale by this factor (renderer + hit-test). */
export const SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN = 1.62;

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

/** Rightmost vertex (corner 0, flat-top), almost at the tip — inset keeps the dot inside the hex. */
export const SMALL_UNIT_ACTIVATION_INSET_FRAC = 0.92;

export function smallUnitActivationToggleCenterWorldRad(
  hexCenterWorld: Point,
  rotationRad: number,
  layout: Layout,
): Point {
  const v = layout.hexCornerOffset(0);
  const x0 = v.x * SMALL_UNIT_ACTIVATION_INSET_FRAC;
  const y0 = v.y * SMALL_UNIT_ACTIVATION_INSET_FRAC;
  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);
  return {
    x: hexCenterWorld.x + c * x0 - s * y0,
    y: hexCenterWorld.y + s * x0 + c * y0,
  };
}

/**
 * Big miniature: activation dot on the east peripheral hex, right edge (same local rule as small).
 */
export function bigMiniActivationToggleCenterWorld(
  hexonCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const zero = new Hex(0, 0);
  const o = layout.hexToPixel(zero);
  const pe = layout.hexToPixel(new Hex(1, 0));
  const eastCellCenterWorld = {
    x: hexonCenterWorld.x + (pe.x - o.x),
    y: hexonCenterWorld.y + (pe.y - o.y),
  };
  const rotRad = (rotationDeg * Math.PI) / 180;
  return smallUnitActivationToggleCenterWorldRad(
    eastCellCenterWorld,
    rotRad,
    layout,
  );
}

/** Large triangle: right side of silhouette, vertically centered. */
export function largeMiniActivationToggleCenterWorld(
  anchorHexCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const b = largeTriangleBoundsLocal(layout);
  const pad = Math.min(layout.size.x, layout.size.y) * 0.1;
  const lx = b.maxX - pad;
  const ly = (b.minY + b.maxY) / 2;
  const dx = lx * LARGE_MINI_VISUAL_SCALE;
  const dy = ly * LARGE_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: anchorHexCenterWorld.x + c * dx - s * dy,
    y: anchorHexCenterWorld.y + s * dx + c * dy,
  };
}

/** Huge triangle: same idea as large; `pivotWorld` matches health badge anchor. */
export function hugeMiniActivationToggleCenterFromPivotWorld(
  pivotWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const b = hugeTriangleBoundsLocal(layout);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const pad = Math.min(layout.size.x, layout.size.y) * 0.1;
  const lx = b.maxX - pad;
  const ly = (b.minY + b.maxY) / 2;
  const dx = (lx - cx) * HUGE_MINI_VISUAL_SCALE;
  const dy = (ly - cy) * HUGE_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: pivotWorld.x + c * dx - s * dy,
    y: pivotWorld.y + s * dx + c * dy,
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
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const insetFrac = 0.86;
  const lx = 0;
  const ly = b.maxY * insetFrac;
  const dx = (lx - cx) * BIG_MINI_VISUAL_SCALE;
  const dy = (ly - cy) * BIG_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: hexCenterWorld.x + c * dx - s * dy,
    y: hexCenterWorld.y + s * dx + c * dy,
  };
}

// ── Large mini (3-hex triangle) ───────────────────────────────

/** HP badge scale for large mini (3-hex triangle). */
export const LARGE_UNIT_HEALTH_UI_SCALE = 0.62;

function largeTriangleLocalCellCenters(layout: Layout): Point[] {
  const zero = new Hex(0, 0);
  const o = layout.hexToPixel(zero);
  const east = new Hex(1, 0);
  const se = new Hex(0, 1);
  const pe = layout.hexToPixel(east);
  const ps = layout.hexToPixel(se);
  return [
    { x: 0, y: 0 },
    { x: pe.x - o.x, y: pe.y - o.y },
    { x: ps.x - o.x, y: ps.y - o.y },
  ];
}

function largeTriangleBoundsLocal(layout: Layout): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of largeTriangleLocalCellCenters(layout)) {
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

/** Pivot = anchor hex center; badge offset in local space (first hex at origin). */
export function largeMiniHealthBadgeCenterWorld(
  anchorHexCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const b = largeTriangleBoundsLocal(layout);
  const insetFrac = 0.86;
  const lx = (b.minX + b.maxX) / 2;
  const ly = b.maxY * insetFrac;
  const dx = lx * LARGE_MINI_VISUAL_SCALE;
  const dy = ly * LARGE_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: anchorHexCenterWorld.x + c * dx - s * dy,
    y: anchorHexCenterWorld.y + s * dx + c * dy,
  };
}

// ── Huge mini (3-hexon triangle) ──────────────────────────────

/** HP badge scale for huge mini (3-hexon triangle). */
export const HUGE_UNIT_HEALTH_UI_SCALE = 0.58;

function hugeTriangleLocalCellCenters(layout: Layout): Point[] {
  const zero = new Hex(0, 0);
  const o = layout.hexToPixel(zero);
  const hexonOffsets = [new Hex(0, 0), new Hex(3, -1), new Hex(1, 2)];
  const cells: Point[] = [];
  for (const hOff of hexonOffsets) {
    const hCenter = layout.hexToPixel(hOff);
    const hx = hCenter.x - o.x;
    const hy = hCenter.y - o.y;
    cells.push({ x: hx, y: hy });
    for (const d of Hex.directions) {
      const neighbor = hOff.add(d);
      const np = layout.hexToPixel(neighbor);
      cells.push({ x: np.x - o.x, y: np.y - o.y });
    }
  }
  return cells;
}

function hugeTriangleBoundsLocal(layout: Layout): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of hugeTriangleLocalCellCenters(layout)) {
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

export function hugeMiniHealthBadgeCenterWorld(
  anchorCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const b = hugeTriangleBoundsLocal(layout);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const insetFrac = 0.86;
  const lx = (b.minX + b.maxX) / 2;
  const ly = b.maxY * insetFrac;
  const dx = (lx - cx) * HUGE_MINI_VISUAL_SCALE;
  const dy = (ly - cy) * HUGE_MINI_VISUAL_SCALE;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: anchorCenterWorld.x + c * dx - s * dy,
    y: anchorCenterWorld.y + s * dx + c * dy,
  };
}

/** Same for the 3-hexon huge footprint (triple junction of the three hexon blobs). */
export function hugeMiniDrawPivotWorld(anchor: Hex, rotationDeg: number, layout: Layout): Point {
  const T = layoutHugeMiniTriplePointWorld(layout, anchor, rotationDeg);
  const A = layout.hexToPixel(anchor);
  const Trel = { x: T.x - A.x, y: T.y - A.y };
  const b = hugeTriangleBoundsLocal(layout);
  const C = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const rotRad = (rotationDeg * Math.PI) / 180;
  const S = HUGE_MINI_VISUAL_SCALE;
  const dx = S * (Trel.x - C.x);
  const dy = S * (Trel.y - C.y);
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  return {
    x: T.x - (c * dx - s * dy),
    y: T.y - (s * dx + c * dy),
  };
}
