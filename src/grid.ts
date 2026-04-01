/**
 * Grid shapes — generates sets of Hex coordinates.
 * Each hex carries optional per-cell data (terrain, occupant, etc.)
 */

import { Hex } from './hex';

// ── Per-cell data (extend later with terrain, units, …) ────────

export interface CellData {
  terrain: string;
}

function defaultCell(): CellData {
  return { terrain: 'plain' };
}

// ── HexGrid — the board state ──────────────────────────────────

export class HexGrid {
  cells = new Map<string, CellData>();
  hexes = new Map<string, Hex>();

  add(hex: Hex, data?: CellData): void {
    this.hexes.set(hex.key, hex);
    this.cells.set(hex.key, data ?? defaultCell());
  }

  /** Remove a hex from the grid */
  remove(hex: Hex): boolean {
    const key = hex.key;
    if (this.hexes.has(key)) {
      this.hexes.delete(key);
      this.cells.delete(key);
      return true;
    }
    return false;
  }

  has(hex: Hex): boolean {
    return this.hexes.has(hex.key);
  }

  getCell(hex: Hex): CellData | undefined {
    return this.cells.get(hex.key);
  }

  allHexes(): Hex[] {
    return [...this.hexes.values()];
  }

  neighbors(hex: Hex): Hex[] {
    return hex.neighbors().filter((n) => this.has(n));
  }

  get size(): number {
    return this.hexes.size;
  }
}

// ── Shape generators ───────────────────────────────────────────

/** Parallelogram — matches the screenshot shape */
export function createParallelogram(cols: number, rows: number): HexGrid {
  const grid = new HexGrid();
  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      grid.add(new Hex(q, r));
    }
  }
  return grid;
}

/**
 * Rectangle for FLAT-TOP hexagons using odd-q offset coordinates.
 * col = 0..width-1  (left→right on screen)
 * row = 0..height-1 (top→bottom on screen)
 * Conversion: axial q = col, r = row - floor(col/2)
 */
export function createRectangle(width: number, height: number): HexGrid {
  const grid = new HexGrid();
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) {
      const q = col;
      const r = row - Math.floor(col / 2);
      grid.add(new Hex(q, r));
    }
  }
  return grid;
}

/** Hexagonal shape — a big hexagon of given radius */
export function createHexagon(radius: number): HexGrid {
  const grid = new HexGrid();
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      grid.add(new Hex(q, r));
    }
  }
  return grid;
}
