import assert from 'node:assert/strict';
import test from 'node:test';

import { isSerializedBoardStateV1 } from './boardState.ts';

function makeMinimalSnapshot(): Record<string, unknown> {
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
    huge2Miniatures: [],
    huge2MiniCardData: [],
    terrains: [],
    terrainOffBoardWorlds: [],
    terrainRotationDegs: [],
    etherVortexes: [],
    godTablePieces: [],
  };
}

test('isSerializedBoardStateV1 accepts minimal snapshot with empty huge2 arrays', () => {
  assert.equal(isSerializedBoardStateV1(makeMinimalSnapshot()), true);
});

test('isSerializedBoardStateV1 accepts legacy snapshot without huge2 arrays', () => {
  const raw = {
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
    terrainRotationDegs: [],
    etherVortexes: [],
    godTablePieces: [],
  };
  assert.equal(isSerializedBoardStateV1(raw), true);
});

test('isSerializedBoardStateV1 rejects malformed huge2 miniature entry', () => {
  const raw = {
    ...makeMinimalSnapshot(),
    huge2Miniatures: [{ armyOwnerPlayerSlot: 2 }],
    huge2MiniCardData: [],
  };
  assert.equal(isSerializedBoardStateV1(raw), false);
});
