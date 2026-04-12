import assert from 'node:assert/strict';
import test from 'node:test';

import { isSerializedBoardStateV1 } from './boardState.ts';

function minimalSnapshot(): Record<string, unknown> {
  return {
    v: 1,
    units: [],
    unitCardData: [],
    bigMiniatures: [],
    bigMiniCardData: [],
    largeMiniatures: [],
    largeMiniCardData: [],
    hugeMiniatures: [],
    hugeMiniCardData: [],
    terrains: [],
    terrainOffBoardWorlds: [],
    terrainRotationDeg: 0,
    etherVortexes: [],
    godTablePieces: [],
  };
}

test('isSerializedBoardStateV1 accepts legacy snapshot without deadByZone', () => {
  assert.equal(isSerializedBoardStateV1(minimalSnapshot()), true);
});

test('isSerializedBoardStateV1 accepts snapshot with valid empty deadByZone tuple', () => {
  assert.equal(isSerializedBoardStateV1({ ...minimalSnapshot(), deadByZone: [[], []] }), true);
});

test('isSerializedBoardStateV1 accepts snapshot with valid deadByZone entries', () => {
  const raw = {
    ...minimalSnapshot(),
    deadByZone: [
      [{ boardInstanceId: 'b1', scoredPoints: 3, order: 0 }],
      [{ boardInstanceId: 'b2', scoredPoints: 0, order: 0 }],
    ],
  };
  assert.equal(isSerializedBoardStateV1(raw), true);
});

test('isSerializedBoardStateV1 rejects deadByZone that is not a two-slot tuple', () => {
  assert.equal(isSerializedBoardStateV1({ ...minimalSnapshot(), deadByZone: [] as unknown as [] }), false);
  assert.equal(isSerializedBoardStateV1({ ...minimalSnapshot(), deadByZone: [[]] as unknown as [] }), false);
});

test('isSerializedBoardStateV1 rejects deadByZone with non-array zone', () => {
  assert.equal(
    isSerializedBoardStateV1({ ...minimalSnapshot(), deadByZone: [[], 'x'] as unknown as [] }),
    false,
  );
});

test('isSerializedBoardStateV1 rejects malformed dead entry', () => {
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalSnapshot(),
      deadByZone: [[{ boardInstanceId: '', scoredPoints: 0, order: 0 }], []],
    }),
    false,
  );
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalSnapshot(),
      deadByZone: [[{ boardInstanceId: 'ok', scoredPoints: 1.5, order: 0 }], []],
    }),
    false,
  );
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalSnapshot(),
      deadByZone: [[{ boardInstanceId: 'ok', scoredPoints: 0, order: -1 }], []],
    }),
    false,
  );
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalSnapshot(),
      deadByZone: [[{ scoredPoints: 0, order: 0 }], []],
    }),
    false,
  );
});
