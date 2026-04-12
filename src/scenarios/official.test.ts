import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScenarioDocument } from './schema.ts';
import { loadOfficialScenarioDocuments, validateScenarioDocumentStrict } from './official.ts';

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

test('loadOfficialScenarioDocuments returns at least 20 valid official scenarios', () => {
  const docs = loadOfficialScenarioDocuments();
  assert.ok(docs.length >= 20);
  const ids = new Set<string>();
  for (const d of docs) {
    assert.equal(d.version, 1);
    assert.equal(d.kind, 'official');
    const again = parseScenarioDocument(d);
    assert.equal(again.ok, true);
    ids.add(d.id);
  }
  assert.equal(ids.size, docs.length);
});

test('validateScenarioDocumentStrict throws with a clear message when document is invalid', () => {
  assert.throws(
    () =>
      validateScenarioDocumentStrict(
        {
          id: 'bad',
          version: 999,
          kind: 'official',
          meta: {
            name: 'x',
            description: 'y',
            tags: [],
            difficulty: 'easy',
          },
          boardOrientation: 'horizontal',
          snapshot: minimalValidSnapshot,
        },
        'test doc',
      ),
    /test doc:.*version/i,
  );
});

test('parseScenarioDocument rejects invalid payload (validator path)', () => {
  const r = parseScenarioDocument({ foo: 1 });
  assert.equal(r.ok, false);
  if (r.ok) assert.fail('expected failure');
});
