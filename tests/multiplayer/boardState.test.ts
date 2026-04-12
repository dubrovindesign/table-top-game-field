import assert from 'node:assert/strict';
import test from 'node:test';

import { isSerializedBoardStateV1 } from '../../src/multiplayer/boardState.ts';

function baseState() {
  return {
    v: 1 as const,
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
    godDeckSlots: {
      '0': { discardIds: [], deckCount: 0, handCount: 0, blindCount: 0, blindCardIds: [] },
      '1': { discardIds: [], deckCount: 0, handCount: 0, blindCount: 0, blindCardIds: [] },
    },
    tableTurnNumber: 1,
  };
}

test('isSerializedBoardStateV1 accepts board templates and instances', () => {
  const s = {
    ...baseState(),
    boardTemplates: [
      {
        id: 'tpl-main',
        hexes: [{ q: 0, r: 0 }],
        backgroundImageSrc: '/greenfield.png',
        cellsSvgOverlaySrc: '/cellscontrast.svg',
      },
    ],
    boardInstances: [
      {
        id: 'board-1',
        templateId: 'tpl-main',
        world: { x: 0, y: 0 },
        rotationDeg: 90,
        scale: 1,
        zIndex: 0,
      },
    ],
    activeBoardInstanceId: 'board-1',
  };
  assert.equal(isSerializedBoardStateV1(s), true);
});

test('isSerializedBoardStateV1 rejects invalid board instance scale', () => {
  const s = {
    ...baseState(),
    boardTemplates: [{ id: 'tpl-main', hexes: [{ q: 0, r: 0 }] }],
    boardInstances: [
      {
        id: 'board-1',
        templateId: 'tpl-main',
        world: { x: 0, y: 0 },
        rotationDeg: 0,
        scale: 0,
        zIndex: 0,
      },
    ],
    activeBoardInstanceId: 'board-1',
  };
  assert.equal(isSerializedBoardStateV1(s), false);
});

