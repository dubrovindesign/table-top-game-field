import assert from 'node:assert/strict';
import test from 'node:test';
import { Hex, huge2DominoAllCellsOriented, huge2DominoHexonCentersOriented } from './hex.ts';

const HUGE2_NEIGHBOR_OFFSETS_CW = [
  new Hex(3, -1),
  new Hex(1, 2),
  new Hex(-2, 3),
  new Hex(-3, 1),
  new Hex(-1, -2),
  new Hex(2, -3),
];

test('huge2 centers use anchor + rotation direction neighbor', () => {
  const anchor = new Hex(10, -4);
  const r0 = huge2DominoHexonCentersOriented(anchor, 0);
  assert.equal(r0.length, 2);
  assert.equal(r0[0]!.key, anchor.key);
  assert.equal(r0[1]!.key, anchor.add(HUGE2_NEIGHBOR_OFFSETS_CW[0]!).key);
});

test('huge2 domino: second center follows hexon-neighbor offsets for each rotation step', () => {
  const anchor = new Hex(2, 3);
  for (let step = 0; step < 6; step++) {
    const rotationDeg = step * 60;
    const centers = huge2DominoHexonCentersOriented(anchor, rotationDeg);
    assert.deepEqual(
      centers.map((c) => c.key),
      [anchor.key, anchor.add(HUGE2_NEIGHBOR_OFFSETS_CW[step]!).key],
    );
  }
});

test('huge2 covers 14 small-cell entries (2 hexons × 7 cells), all unique', () => {
  const cells = huge2DominoAllCellsOriented(new Hex(0, 0), 120);
  assert.equal(cells.length, 14);
  assert.equal(new Set(cells.map((c) => c.key)).size, 14);
});

test('huge2 all-cells unique count is stable for every 60° rotation', () => {
  const anchor = new Hex(-1, 2);
  for (let step = 0; step < 6; step++) {
    const cells = huge2DominoAllCellsOriented(anchor, step * 60);
    assert.equal(cells.length, 14);
    assert.equal(new Set(cells.map((c) => c.key)).size, 14);
  }
});
