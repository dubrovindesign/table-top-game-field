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

/** Large triangle: right side of silhouette, vertically centered. Use model `rotationDeg` on all seats. */
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

/** HP badge scale for large mini (3-hex triangle), vs `baseRadius` in renderer. */
export const LARGE_UNIT_HEALTH_UI_SCALE = 0.62 * 0.8;

/**
 * After picking the footprint’s bottom-left tip, move this fraction toward the contour centroid
 * so the HP disc stays inside the white stroke (rounded corners shrink the visual tip).
 */
export const LARGE_UNIT_HEALTH_BADGE_INWARD_ALONG_TIP = 0.22;

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

/** Same outer contour as renderer `outerVerticesFromCells` / `addOuterPathFromCells` (scale = 1). */
function largeTriangleOuterVerticesLocal(layout: Layout): Point[] {
  return outerBoundaryVerticesFromCells(largeTriangleLocalCellCenters(layout), layout, 1);
}

function outerBoundaryVerticesFromCells(
  cells: Point[],
  layout: Layout,
  scale: number,
): Point[] {
  const segKey = (p: Point, q: Point): string => {
    const k1 = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    const k2 = `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  };
  const edgeCounts = new Map<string, number>();
  const edgeA = new Map<string, Point>();
  const edgeB = new Map<string, Point>();
  for (const cell of cells) {
    for (let i = 0; i < 6; i++) {
      const o1 = layout.hexCornerOffset(i);
      const o2 = layout.hexCornerOffset((i + 1) % 6);
      const a = { x: scale * (cell.x + o1.x), y: scale * (cell.y + o1.y) };
      const b = { x: scale * (cell.x + o2.x), y: scale * (cell.y + o2.y) };
      const k = segKey(a, b);
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
      if (!edgeA.has(k)) {
        edgeA.set(k, a);
        edgeB.set(k, b);
      }
    }
  }
  const vertsMap = new Map<string, Point>();
  for (const [k, cnt] of edgeCounts) {
    if (cnt !== 1) continue;
    const a = edgeA.get(k)!;
    const b = edgeB.get(k)!;
    vertsMap.set(`${a.x.toFixed(4)},${a.y.toFixed(4)}`, a);
    vertsMap.set(`${b.x.toFixed(4)},${b.y.toFixed(4)}`, b);
  }
  const verts = [...vertsMap.values()];
  if (verts.length < 3) return verts;
  let cx = 0;
  let cy = 0;
  for (const v of verts) {
    cx += v.x;
    cy += v.y;
  }
  cx /= verts.length;
  cy /= verts.length;
  verts.sort(
    (p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx),
  );
  return verts;
}

/** +y = down: bottom-left tip = lowest vertex, then leftmost among ties. */
function bottomLeftTipOfPolygon(verts: Point[]): Point {
  let best = verts[0]!;
  for (const p of verts) {
    if (p.y > best.y + 1e-9) best = p;
    else if (Math.abs(p.y - best.y) <= 1e-9 && p.x < best.x - 1e-9) best = p;
  }
  return best;
}

/**
 * Pivot = anchor hex center (same as large mini draw). Uses outer contour of the 3-hex triangle
 * in local space, then applies `LARGE_MINI_VISUAL_SCALE` and rotation like `drawLargeMiniShapeAtPoint`.
 * Always pass **model** `rotationDeg` (not opposite-seat visual); board rotation handles the view.
 */
export function largeMiniHealthBadgeCenterWorld(
  anchorHexCenterWorld: Point,
  rotationDeg: number,
  layout: Layout,
): Point {
  const verts = largeTriangleOuterVerticesLocal(layout);
  const rotRad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  let lx: number;
  let ly: number;
  if (verts.length >= 3) {
    const tip = bottomLeftTipOfPolygon(verts);
    let tcx = 0;
    let tcy = 0;
    for (const v of verts) {
      tcx += v.x;
      tcy += v.y;
    }
    tcx /= verts.length;
    tcy /= verts.length;
    const t = LARGE_UNIT_HEALTH_BADGE_INWARD_ALONG_TIP;
    lx = tip.x + t * (tcx - tip.x);
    ly = tip.y + t * (tcy - tip.y);
  } else {
    const v = layout.hexCornerOffset(2);
    lx = v.x * 0.76;
    ly = v.y * 0.76;
  }
  const S = LARGE_MINI_VISUAL_SCALE;
  const sx = S * lx;
  const sy = S * ly;
  return {
    x: anchorHexCenterWorld.x + c * sx - s * sy,
    y: anchorHexCenterWorld.y + s * sx + c * sy,
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
