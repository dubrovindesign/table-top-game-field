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
