import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScenarioDocument } from './schema.ts';

const minimalValidSnapshot = {
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
} as const;

test('parseScenarioDocument accepts valid v1 custom scenario', () => {
  const result = parseScenarioDocument({
    id: 'my-scenario',
    version: 1,
    kind: 'custom',
    meta: {
      name: 'My Scenario',
      description: 'desc',
      tags: ['test'],
      difficulty: 'normal',
    },
    boardOrientation: 'horizontal',
    snapshot: minimalValidSnapshot,
  });
  assert.equal(result.ok, true);
});

test('parseScenarioDocument rejects unsupported document version', () => {
  const result = parseScenarioDocument({ version: 999 });
  assert.equal(result.ok, false);
});

test('parseScenarioDocument rejects invalid snapshot', () => {
  const result = parseScenarioDocument({
    id: 'bad-snap',
    version: 1,
    kind: 'custom',
    meta: {
      name: 'x',
      description: 'y',
      tags: [],
      difficulty: 'easy',
    },
    boardOrientation: 'vertical',
    snapshot: { v: 1, units: 'not-an-array' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /snapshot/i);
  }
});

test('parseScenarioDocument rejects invalid boardOrientation', () => {
  const result = parseScenarioDocument({
    id: 'bad-orientation',
    version: 1,
    kind: 'custom',
    meta: {
      name: 'x',
      description: 'y',
      tags: [],
      difficulty: 'easy',
    },
    boardOrientation: 'diagonal',
    snapshot: minimalValidSnapshot,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /boardOrientation/i);
  }
});

test('parseScenarioDocument accepts legacy snapshot omitting boardOrientation', () => {
  const legacySnapshot = { ...minimalValidSnapshot };
  assert.equal(Object.hasOwn(legacySnapshot, 'boardOrientation'), false);

  const result = parseScenarioDocument({
    id: 'legacy-snapshot',
    version: 1,
    kind: 'custom',
    meta: {
      name: 'x',
      description: 'y',
      tags: [],
      difficulty: 'easy',
    },
    boardOrientation: 'vertical',
    snapshot: legacySnapshot,
  });
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail('expected ok');
  assert.equal(result.value.snapshot.boardOrientation, undefined);
  assert.equal(result.value.boardOrientation, 'vertical');
});
