/**
 * Clip paths for army panel unit thumbnails — same footprint geometry as board miniatures
 * (flat hex layout, HEX_SIZE 28 — matches `main.ts`).
 */

import { Hex, Layout, type Point } from './hex';
import type { UnitSize } from './unitCard';

/** Same as `HEX_SIZE` in main.ts — silhouette must match rendered board. */
const REF_HEX = 28;
const REF_LAYOUT = new Layout('flat', { x: REF_HEX, y: REF_HEX }, { x: 0, y: 0 });

function outerBoundaryVerticesFromCells(cells: Point[], layout: Layout, scale: number): Point[] {
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

/** Matches `Renderer.hugeTriangleLocalCellCenters` — 21 small hex cells for huge footprint. */
function hugeTriangleLocalCellCenters(layout: Layout): Point[] {
  const zero = new Hex(0, 0);
  const o = layout.hexToPixel(zero);
  const hexonOffsets = [new Hex(0, 0), new Hex(3, -1), new Hex(1, 2)];
  const cells: Point[] = [];
  for (const hOff of hexonOffsets) {
    const hc = layout.hexToPixel(hOff);
    cells.push({ x: hc.x - o.x, y: hc.y - o.y });
    for (const d of Hex.directions) {
      const nb = hOff.add(d);
      const np = layout.hexToPixel(nb);
      cells.push({ x: np.x - o.x, y: np.y - o.y });
    }
  }
  return cells;
}

function singleHexVertices(layout: Layout): Point[] {
  return layout.hexCorners(new Hex(0, 0));
}

function vertsToPolygonClipPath(verts: Point[]): string {
  if (verts.length < 3) return 'none';
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return 'none';
  const parts = verts.map(
    (v) => `${(((v.x - minX) / w) * 100).toFixed(3)}% ${(((v.y - minY) / h) * 100).toFixed(3)}%`,
  );
  return `polygon(${parts.join(', ')})`;
}

function computeClipPaths(): Record<UnitSize, string> {
  const L = REF_LAYOUT;
  const small = vertsToPolygonClipPath(singleHexVertices(L));
  const big = vertsToPolygonClipPath(outerBoundaryVerticesFromCells(hexonLocalCellCenters(L), L, 1));
  const large = vertsToPolygonClipPath(
    outerBoundaryVerticesFromCells(largeTriangleLocalCellCenters(L), L, 1),
  );
  const huge = vertsToPolygonClipPath(
    outerBoundaryVerticesFromCells(hugeTriangleLocalCellCenters(L), L, 1),
  );
  return { small, big, large, huge };
}

const CLIP_BY_SIZE = computeClipPaths();

/**
 * CSS `clip-path` for a square thumb, matching the board miniature silhouette for `size`.
 */
export function armyUnitThumbClipPath(size: UnitSize | undefined): string {
  const s = size ?? 'small';
  return CLIP_BY_SIZE[s] ?? CLIP_BY_SIZE.small;
}

export function applyArmyUnitThumbClip(thumbEl: HTMLElement, size: UnitSize | undefined): void {
  const path = armyUnitThumbClipPath(size);
  thumbEl.style.clipPath = path;
  thumbEl.style.setProperty('-webkit-clip-path', path);
}
