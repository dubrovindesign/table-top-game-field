import assert from 'node:assert/strict';
import test from 'node:test';
import { isSerializedBoardStateV1 } from '../multiplayer/boardState.ts';
import { applyScenarioDocument } from './apply.ts';
import { deriveRotationModel } from './rotationModel.ts';

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

function validScenarioDoc(orientation: 'horizontal' | 'vertical') {
  return {
    id: 'apply-test',
    version: 1,
    kind: 'custom' as const,
    meta: {
      name: 't',
      description: 'd',
      tags: [],
      difficulty: 'easy' as const,
    },
    boardOrientation: orientation,
    snapshot: minimalValidSnapshot,
  };
}

test('applyScenarioDocument invokes deps in order: snapshot → orientation → notify', () => {
  const calls: string[] = [];
  const result = applyScenarioDocument(validScenarioDoc('vertical'), {
    applyBoardSnapshot: () => {
      calls.push('snapshot');
    },
    setBoardOrientation: (o) => {
      calls.push(`orientation:${o}`);
    },
    notifyBoardEditLocal: () => {
      calls.push('notify');
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['snapshot', 'orientation:vertical', 'notify']);
});

test('applyScenarioDocument invalid document: no deps run', () => {
  const calls: string[] = [];
  const result = applyScenarioDocument(
    { version: 999, id: 'x' },
    {
      applyBoardSnapshot: () => {
        calls.push('snapshot');
      },
      setBoardOrientation: () => {
        calls.push('orientation');
      },
      notifyBoardEditLocal: () => {
        calls.push('notify');
      },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) assert.fail('expected failure');
  assert.match(result.error, /version/i);
  assert.deepEqual(calls, []);
});

test('applyScenarioDocument rejects bad snapshot before any dep', () => {
  const calls: string[] = [];
  const bad = {
    ...validScenarioDoc('horizontal'),
    snapshot: { v: 1, units: 'nope' },
  };
  const result = applyScenarioDocument(bad, {
    applyBoardSnapshot: () => {
      calls.push('snapshot');
    },
    setBoardOrientation: () => {
      calls.push('orientation');
    },
    notifyBoardEditLocal: () => {
      calls.push('notify');
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

test('isSerializedBoardStateV1 accepts legacy snapshot without orientation', () => {
  const legacy = { ...minimalValidSnapshot };
  assert.equal(isSerializedBoardStateV1(legacy), true);
});

test('isSerializedBoardStateV1 accepts snapshot with valid boardOrientation', () => {
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalValidSnapshot,
      boardOrientation: 'horizontal',
    }),
    true,
  );
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalValidSnapshot,
      boardOrientation: 'vertical',
    }),
    true,
  );
});

test('isSerializedBoardStateV1 rejects invalid boardOrientation value', () => {
  assert.equal(
    isSerializedBoardStateV1({
      ...minimalValidSnapshot,
      boardOrientation: 'diagonal',
    }),
    false,
  );
});

test('legacy snapshot without snapshot.boardOrientation still applies; orientation from scenario doc', () => {
  const legacySnapshot = { ...minimalValidSnapshot };
  assert.equal(Object.hasOwn(legacySnapshot, 'boardOrientation'), false);

  const calls: string[] = [];
  let appliedSnapshot: unknown;
  const doc = {
    id: 'legacy-snap-path',
    version: 1 as const,
    kind: 'custom' as const,
    meta: {
      name: 't',
      description: 'd',
      tags: [] as string[],
      difficulty: 'easy' as const,
    },
    boardOrientation: 'horizontal' as const,
    snapshot: legacySnapshot,
  };

  const result = applyScenarioDocument(doc, {
    applyBoardSnapshot: (s) => {
      appliedSnapshot = s;
      calls.push('snapshot');
    },
    setBoardOrientation: (o) => {
      calls.push(`orientation:${o}`);
    },
    notifyBoardEditLocal: () => {
      calls.push('notify');
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['snapshot', 'orientation:horizontal', 'notify']);
  assert.strictEqual(appliedSnapshot, legacySnapshot);
});

test('doc.boardOrientation takes precedence over snapshot.boardOrientation during apply', () => {
  const snapshotWithConflictingOrientation = {
    ...minimalValidSnapshot,
    boardOrientation: 'horizontal' as const,
  };

  const calls: string[] = [];
  const result = applyScenarioDocument(
    {
      ...validScenarioDoc('vertical'),
      snapshot: snapshotWithConflictingOrientation,
    },
    {
      applyBoardSnapshot: () => {
        calls.push('snapshot');
      },
      setBoardOrientation: (o) => {
        calls.push(`orientation:${o}`);
      },
      notifyBoardEditLocal: () => {
        calls.push('notify');
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['snapshot', 'orientation:vertical', 'notify']);
});

test('applyScenarioDocument rejects invalid snapshot.boardOrientation via parse boundary', () => {
  const calls: string[] = [];
  const result = applyScenarioDocument(
    {
      ...validScenarioDoc('horizontal'),
      snapshot: {
        ...minimalValidSnapshot,
        boardOrientation: 'diagonal',
      },
    },
    {
      applyBoardSnapshot: () => {
        calls.push('snapshot');
      },
      setBoardOrientation: () => {
        calls.push('orientation');
      },
      notifyBoardEditLocal: () => {
        calls.push('notify');
      },
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) assert.fail('expected failure');
  assert.match(result.error, /snapshot/i);
  assert.deepEqual(calls, []);
});

test('vertical scenario orientation does not add field-only delta vs horizontal (content seat-driven)', () => {
  const baseDeg = -10;
  const seatExtraDeg = 180;
  const horizontal = deriveRotationModel({ baseDeg, seatExtraDeg, orientation: 'horizontal' });
  const vertical = deriveRotationModel({ baseDeg, seatExtraDeg, orientation: 'vertical' });
  assert.equal(horizontal.contentDeg, vertical.contentDeg);
  assert.equal(vertical.fieldDeg, horizontal.fieldDeg);
});
