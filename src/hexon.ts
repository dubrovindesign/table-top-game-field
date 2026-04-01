/**
 * Hexon — a super-hex consisting of 1 center + 6 neighbors (7 cells).
 *
 * Hexons tile the plane perfectly (no gaps, no overlaps) using
 * a lattice with basis vectors a1=(3,-1) and a2=(1,2) in axial coords.
 * The parallelogram area |det| = |3·2 − (−1)·1| = 7 = hexon size. ✓
 */

import { Hex } from './hex';
import type { HexGrid } from './grid';

// ── Hexon data ─────────────────────────────────────────────────

export interface Hexon {
  id: number;
  center: Hex;
  cells: Hex[];        // all cells belonging to this hexon (up to 7)
  colorIndex: number;  // for visual distinction (0, 1, or 2)
}

// ── Lattice vectors ────────────────────────────────────────────

const A1 = { q: 3, r: -1 };
const A2 = { q: 1, r: 2 };
const HEXON_ANCHOR = { q: 2, r: 0 };

// ── Inverse mapping: hex → hexon center ────────────────────────

/**
 * Given any axial (q, r), find the hexon center it belongs to.
 *
 * Lattice matrix M = [[3, 1], [-1, 2]], det = 7
 * M⁻¹ = 1/7 · [[2, -1], [1, 3]]
 *
 * We solve M · [n, m]ᵀ = [q, r]ᵀ  for fractional (n, m),
 * then round to nearest integer lattice point considering
 * all 7 possible offsets.
 */
export function hexToHexonCenter(q: number, r: number): { cq: number; cr: number; n: number; m: number } {
  // Anchor lattice so that one full hexon is centered at (2, 0).
  const localQ = q - HEXON_ANCHOR.q;
  const localR = r - HEXON_ANCHOR.r;

  // Fractional lattice coordinates
  const nf = (2 * localQ - localR) / 7;
  const mf = (localQ + 3 * localR) / 7;

  // Try rounding in all directions to find the correct hexon
  let bestDist = Infinity;
  let bestN = 0;
  let bestM = 0;

  for (const dn of [Math.floor(nf), Math.ceil(nf)]) {
    for (const dm of [Math.floor(mf), Math.ceil(mf)]) {
      const cq = dn * A1.q + dm * A2.q;
      const cr = dn * A1.r + dm * A2.r;
      // Hex distance from (q,r) to center (cq,cr)
      const dq = q - cq;
      const dr = r - cr;
      const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
      if (dist <= 1 && dist < bestDist) {
        bestDist = dist;
        bestN = dn;
        bestM = dm;
      }
    }
  }

  const cq = bestN * A1.q + bestM * A2.q + HEXON_ANCHOR.q;
  const cr = bestN * A1.r + bestM * A2.r + HEXON_ANCHOR.r;
  return { cq, cr, n: bestN, m: bestM };
}

// ── Build hexon map for a grid ─────────────────────────────────

export interface HexonMap {
  /** hex.key → Hexon it belongs to */
  cellToHexon: Map<string, Hexon>;
  /** All hexons */
  hexons: Hexon[];
}

export function buildHexonMap(grid: HexGrid): HexonMap {
  const cellToHexon = new Map<string, Hexon>();
  const hexonByCenter = new Map<string, Hexon>();
  let nextId = 0;

  for (const hex of grid.allHexes()) {
    const { cq, cr, n, m } = hexToHexonCenter(hex.q, hex.r);
    const centerKey = `${cq},${cr}`;

    let hexon = hexonByCenter.get(centerKey);
    if (!hexon) {
      // 3-coloring using lattice coords: (n - m) mod 3
      const colorIndex = ((n - m) % 3 + 3) % 3;
      hexon = {
        id: nextId++,
        center: new Hex(cq, cr),
        cells: [],
        colorIndex,
      };
      hexonByCenter.set(centerKey, hexon);
    }

    hexon.cells.push(hex);
    cellToHexon.set(hex.key, hexon);
  }

  return {
    cellToHexon,
    hexons: [...hexonByCenter.values()],
  };
}

// ── Hexon-level distance (in hexon steps) ──────────────────────

/**
 * Convert a hexon center (axial) to lattice coordinates (n, m).
 * Hexon centers form their own hex grid in (n, m) space.
 */
export function hexonToLattice(center: Hex): { n: number; m: number } {
  const lq = center.q - HEXON_ANCHOR.q;
  const lr = center.r - HEXON_ANCHOR.r;
  const n = Math.round((2 * lq - lr) / 7);
  const m = Math.round((lq + 3 * lr) / 7);
  return { n, m };
}

/**
 * Distance between two hexon centers measured in hexon steps.
 * Uses standard hex distance in lattice (n, m) space.
 */
export function hexonDistance(a: Hex, b: Hex): number {
  const la = hexonToLattice(a);
  const lb = hexonToLattice(b);
  const dn = la.n - lb.n;
  const dm = la.m - lb.m;
  return Math.max(Math.abs(dn), Math.abs(dm), Math.abs(dn + dm));
}

// ── Check if two adjacent hexes belong to different hexons ─────

export function isHexonBoundary(
  hex: Hex,
  neighbor: Hex,
  hexonMap: HexonMap,
): boolean {
  const h1 = hexonMap.cellToHexon.get(hex.key);
  const h2 = hexonMap.cellToHexon.get(neighbor.key);
  if (!h1 || !h2) return true; // edge of grid = boundary
  return h1.id !== h2.id;
}
