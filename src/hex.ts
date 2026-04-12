/**
 * Hex math based on Red Blob Games guide:
 * https://www.redblobgames.com/grids/hexagons/
 *
 * Uses AXIAL coordinates (q, r) with flat-top orientation.
 * Cube coordinate s = -q - r (computed when needed).
 */

// ── Hex coordinate ──────────────────────────────────────────────

export class Hex {
  public readonly q: number;
  public readonly r: number;

  constructor(
    q: number,
    r: number,
  ) {
    this.q = q;
    this.r = r;
  }

  /** Cube coordinate s, derived from q and r */
  get s(): number {
    return -this.q - this.r;
  }

  /** Unique string key for use in Maps / Sets */
  get key(): string {
    return `${this.q},${this.r}`;
  }

  // ── Arithmetic ──

  add(other: Hex): Hex {
    return new Hex(this.q + other.q, this.r + other.r);
  }

  subtract(other: Hex): Hex {
    return new Hex(this.q - other.q, this.r - other.r);
  }

  scale(k: number): Hex {
    return new Hex(this.q * k, this.r * k);
  }

  equals(other: Hex): boolean {
    return this.q === other.q && this.r === other.r;
  }

  // ── Neighbors ──

  /** 6 axial direction vectors (flat-top) */
  static directions: Hex[] = [
    new Hex(+1, 0),  // 0 — East
    new Hex(+1, -1), // 1 — NE
    new Hex(0, -1),  // 2 — NW
    new Hex(-1, 0),  // 3 — West
    new Hex(-1, +1), // 4 — SW
    new Hex(0, +1),  // 5 — SE
  ];

  neighbor(direction: number): Hex {
    return this.add(Hex.directions[direction]);
  }

  neighbors(): Hex[] {
    return Hex.directions.map((d) => this.add(d));
  }

  // ── Distance ──

  length(): number {
    return Math.max(Math.abs(this.q), Math.abs(this.r), Math.abs(this.s));
  }

  distanceTo(other: Hex): number {
    return this.subtract(other).length();
  }

  // ── Rotation (60° steps in cube space) ──

  rotateCW(): Hex {
    const newQ = -this.r;
    const newR = -this.s;
    return new Hex(newQ, newR);
  }

  rotateCCW(): Hex {
    const newQ = -this.s;
    const newR = -this.q;
    return new Hex(newQ, newR);
  }
}

// ── Layout: hex ↔ pixel conversion ─────────────────────────────

export interface Point {
  x: number;
  y: number;
}

interface Orientation {
  f0: number; f1: number; f2: number; f3: number;
  b0: number; b1: number; b2: number; b3: number;
  startAngle: number;
}

const FLAT_TOP: Orientation = {
  f0: 3 / 2,    f1: 0,
  f2: Math.sqrt(3) / 2, f3: Math.sqrt(3),
  b0: 2 / 3,    b1: 0,
  b2: -1 / 3,   b3: Math.sqrt(3) / 3,
  startAngle: 0,
};

const POINTY_TOP: Orientation = {
  f0: Math.sqrt(3),    f1: Math.sqrt(3) / 2,
  f2: 0,               f3: 3 / 2,
  b0: Math.sqrt(3) / 3, b1: -1 / 3,
  b2: 0,                b3: 2 / 3,
  startAngle: 0.5,
};

export type HexOrientation = 'flat' | 'pointy';

export class Layout {
  private orientation: Orientation;
  public readonly type: HexOrientation;
  public readonly size: Point;
  public readonly origin: Point;

  constructor(
    type: HexOrientation,
    size: Point,
    origin: Point,
  ) {
    this.type = type;
    this.size = size;
    this.origin = origin;
    this.orientation = type === 'flat' ? FLAT_TOP : POINTY_TOP;
  }

  hexToPixel(h: Hex): Point {
    const o = this.orientation;
    const x = (o.f0 * h.q + o.f1 * h.r) * this.size.x;
    const y = (o.f2 * h.q + o.f3 * h.r) * this.size.y;
    return { x: x + this.origin.x, y: y + this.origin.y };
  }

  pixelToHex(p: Point): Hex {
    const o = this.orientation;
    const pt: Point = {
      x: (p.x - this.origin.x) / this.size.x,
      y: (p.y - this.origin.y) / this.size.y,
    };
    const q = o.b0 * pt.x + o.b1 * pt.y;
    const r = o.b2 * pt.x + o.b3 * pt.y;
    return hexRound(q, r);
  }

  hexCornerOffset(corner: number): Point {
    const o = this.orientation;
    const angle = (2 * Math.PI * (o.startAngle + corner)) / 6;
    return {
      x: this.size.x * Math.cos(angle),
      y: this.size.y * Math.sin(angle),
    };
  }

  hexCorners(h: Hex): Point[] {
    const center = this.hexToPixel(h);
    const corners: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const off = this.hexCornerOffset(i);
      corners.push({ x: center.x + off.x, y: center.y + off.y });
    }
    return corners;
  }
}

// ── Rounding fractional hex to nearest integer hex ─────────────

function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  return new Hex(rq, rr);
}

// ── Line drawing ───────────────────────────────────────────────

export function hexLineDraw(a: Hex, b: Hex): Hex[] {
  const N = a.distanceTo(b);
  if (N === 0) return [a];

  const results: Hex[] = [];
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const lq = aq + (bq - aq) * t;
    const lr = ar + (br - ar) * t;
    results.push(hexRound(lq, lr));
  }
  return results;
}

// ── Multi-hex footprints (board logic; keep in sync across main / renderer / healthUi) ──

const LARGE_TRI_OFFSET_E = new Hex(1, 0);
const LARGE_TRI_OFFSET_SE = new Hex(0, 1);

function rotateAxialOffsetCWSteps(offset: Hex, stepsCW: number): Hex {
  let h = offset;
  let n = stepsCW % 6;
  if (n < 0) n += 6;
  for (let i = 0; i < n; i++) h = h.rotateCW();
  return h;
}

/**
 * Large unit footprint: 3 small hexes sharing one vertex, rotated in 60° steps
 * around the anchor (must match renderer canvas rotation in `rotationDeg`).
 */
export function largeTriangleCellsOriented(anchor: Hex, rotationDeg: number): Hex[] {
  const steps = ((Math.round(rotationDeg / 60) % 6) + 6) % 6;
  return [
    anchor,
    anchor.add(rotateAxialOffsetCWSteps(LARGE_TRI_OFFSET_E, steps)),
    anchor.add(rotateAxialOffsetCWSteps(LARGE_TRI_OFFSET_SE, steps)),
  ];
}

/** Large unit at rotation 0: anchor + E + SE. */
export function largeTriangleCells(anchor: Hex): Hex[] {
  return largeTriangleCellsOriented(anchor, 0);
}

const HUGE_TRI_HEX_EAST = new Hex(3, -1);
const HUGE_TRI_HEX_SE = new Hex(1, 2);

/**
 * Huge unit: 3 hexon centers (same relative triangle as large mini, hexon-scale axial steps),
 * rotated in 60° steps around `anchor` (must match renderer rotation in `rotationDeg`).
 */
export function hugeTriangleHexonCentersOriented(anchor: Hex, rotationDeg: number): Hex[] {
  const steps = ((Math.round(rotationDeg / 60) % 6) + 6) % 6;
  return [
    anchor,
    anchor.add(rotateAxialOffsetCWSteps(HUGE_TRI_HEX_EAST, steps)),
    anchor.add(rotateAxialOffsetCWSteps(HUGE_TRI_HEX_SE, steps)),
  ];
}

/** Huge unit at rotation 0: anchor + hexon East + hexon SE offsets. */
export function hugeTriangleHexonCenters(anchor: Hex): Hex[] {
  return hugeTriangleHexonCentersOriented(anchor, 0);
}

/** All small hex cells covered by a huge mini (3×7), with hexon triangle orientation. */
export function hugeTriangleAllCellsOriented(anchor: Hex, rotationDeg: number): Hex[] {
  return hugeTriangleHexonCentersOriented(anchor, rotationDeg).flatMap((hc) => [
    hc,
    ...Hex.directions.map((d) => hc.add(d)),
  ]);
}

export function hugeTriangleAllCells(anchor: Hex): Hex[] {
  return hugeTriangleAllCellsOriented(anchor, 0);
}

const HUGE2_DOMINO_HEX_NEIGHBOR = new Hex(3, -1);

/**
 * Huge2 unit: 2 adjacent hexon centers on the hexon lattice.
 * Rotation follows the same 60° CW stepping as other oriented multi-cell helpers.
 */
export function huge2DominoHexonCentersOriented(anchor: Hex, rotationDeg: number): Hex[] {
  const steps = ((Math.round(rotationDeg / 60) % 6) + 6) % 6;
  return [anchor, anchor.add(rotateAxialOffsetCWSteps(HUGE2_DOMINO_HEX_NEIGHBOR, steps))];
}

/** All small hex cells covered by a huge2 mini (2×7 cells, without overlap). */
export function huge2DominoAllCellsOriented(anchor: Hex, rotationDeg: number): Hex[] {
  return huge2DominoHexonCentersOriented(anchor, rotationDeg).flatMap((hc) => [
    hc,
    ...Hex.directions.map((d) => hc.add(d)),
  ]);
}

const CORNER_MATCH_EPS2 = 1e-4;

/**
 * The single vertex where three mutually adjacent small hexes meet (Y junction).
 * Fallback: centroid of the three hex centers.
 */
export function layoutSharedVertexThreeHexes(layout: Layout, a: Hex, b: Hex, c: Hex): Point {
  const cornersA = layout.hexCorners(a);
  const cornersB = layout.hexCorners(b);
  const cornersC = layout.hexCorners(c);
  for (const pa of cornersA) {
    for (const pb of cornersB) {
      if ((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2 > CORNER_MATCH_EPS2) continue;
      for (const pc of cornersC) {
        if ((pa.x - pc.x) ** 2 + (pa.y - pc.y) ** 2 <= CORNER_MATCH_EPS2) return pa;
      }
    }
  }
  const p0 = layout.hexToPixel(a);
  const p1 = layout.hexToPixel(b);
  const p2 = layout.hexToPixel(c);
  return { x: (p0.x + p1.x + p2.x) / 3, y: (p0.y + p1.y + p2.y) / 3 };
}

/**
 * Inner triple junction of three hexon silhouettes (21 small hexes), in world space.
 * Picks a corner cluster touched by all three hexon centers, closest to their centroid.
 */
export function layoutHugeMiniTriplePointWorld(layout: Layout, anchor: Hex, rotationDeg = 0): Point {
  const centers = hugeTriangleHexonCentersOriented(anchor, rotationDeg);
  const cells = hugeTriangleAllCellsOriented(anchor, rotationDeg);
  const centerByCell = new Map<string, Hex>();
  for (const hc of centers) {
    for (const cell of [hc, ...Hex.directions.map((d) => hc.add(d))]) {
      centerByCell.set(cell.key, hc);
    }
  }
  type Agg = { sx: number; sy: number; n: number; parents: Set<string> };
  const bucket = new Map<string, Agg>();
  const keyOf = (p: Point) => `${Math.round(p.x * 16)}_${Math.round(p.y * 16)}`;
  for (const cell of cells) {
    const parent = centerByCell.get(cell.key);
    if (!parent) continue;
    for (const cor of layout.hexCorners(cell)) {
      const k = keyOf(cor);
      let ag = bucket.get(k);
      if (!ag) {
        ag = { sx: 0, sy: 0, n: 0, parents: new Set() };
        bucket.set(k, ag);
      }
      ag.sx += cor.x;
      ag.sy += cor.y;
      ag.n += 1;
      ag.parents.add(parent.key);
    }
  }
  let tcx = 0;
  let tcy = 0;
  for (const hc of centers) {
    const w = layout.hexToPixel(hc);
    tcx += w.x;
    tcy += w.y;
  }
  tcx /= 3;
  tcy /= 3;
  let best: Point = { x: tcx, y: tcy };
  let bestD = Infinity;
  for (const ag of bucket.values()) {
    if (ag.parents.size < 3) continue;
    const p = { x: ag.sx / ag.n, y: ag.sy / ag.n };
    const d2 = (p.x - tcx) ** 2 + (p.y - tcy) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = p;
    }
  }
  return best;
}
