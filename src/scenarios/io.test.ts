import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { ScenarioDocument } from './types.ts';
import {
  createScenarioJsonBlob,
  importMany,
  importScenariosFromJsonText,
  parseScenarioJsonText,
  parseScenariosBundleJsonText,
  scenarioDocumentToJsonString,
} from './io.ts';
import { SCENARIOS_STORAGE_KEY, __setScenariosStorageForTests, getById, list } from './store.ts';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(_key: string, _value: string): void {
    throw new Error('quota exceeded');
  }
}

function emptySnapshot(): ScenarioDocument['snapshot'] {
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

function makeDoc(
  id: string,
  opts: { updatedAt?: string; name?: string } = {},
): ScenarioDocument {
  return {
    id,
    version: 1,
    kind: 'custom',
    meta: {
      name: opts.name ?? id,
      description: '',
      tags: [],
      difficulty: 'normal',
      updatedAt: opts.updatedAt,
    },
    boardOrientation: 'horizontal',
    snapshot: emptySnapshot(),
  };
}

let mem: MemoryStorage;

beforeEach(() => {
  mem = new MemoryStorage();
  __setScenariosStorageForTests(mem);
});

afterEach(() => {
  __setScenariosStorageForTests(null);
});

describe('parseScenarioJsonText', () => {
  test('rejects invalid JSON', () => {
    const r = parseScenarioJsonText('{ not json');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /invalid json/i);
  });

  test('rejects valid JSON that is not a valid scenario document', () => {
    const r = parseScenarioJsonText(JSON.stringify({ foo: 1 }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.length > 0);
  });

  test('accepts a valid scenario and round-trips through stringify', () => {
    const doc = makeDoc('roundtrip', { updatedAt: '2024-01-01T00:00:00.000Z' });
    const text = scenarioDocumentToJsonString(doc);
    const r = parseScenarioJsonText(text);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.id, 'roundtrip');
  });
});

describe('parseScenariosBundleJsonText', () => {
  test('rejects when array contains an invalid scenario', () => {
    const good = makeDoc('a');
    const bad = { ...makeDoc('b'), version: 99 };
    const r = parseScenariosBundleJsonText(JSON.stringify([good, bad]));
    assert.equal(r.ok, false);
  });

  test('wraps a single object as a one-element array', () => {
    const doc = makeDoc('solo');
    const r = parseScenariosBundleJsonText(JSON.stringify(doc));
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.map((d) => d.id), ['solo']);
  });
});

describe('createScenarioJsonBlob', () => {
  test('produces JSON text readable as a scenario', async () => {
    const doc = makeDoc('blob-id');
    const blob = createScenarioJsonBlob(doc);
    assert.equal(blob.type, 'application/json;charset=utf-8');
    const text = await blob.text();
    const r = parseScenarioJsonText(text);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.id, 'blob-id');
  });
});

describe('importMany via io + collision handling', () => {
  test('keep-both collision assigns deterministic id `<id>-copy-1`', () => {
    importMany([makeDoc('s', { updatedAt: '2020-01-01T00:00:00.000Z' })], 'keep-both');
    importMany([makeDoc('s', { updatedAt: '2024-01-01T00:00:00.000Z', name: 'imported' })], 'keep-both');

    const ids = new Set(list().map((d) => d.id));
    assert.ok(ids.has('s'));
    assert.ok(ids.has('s-copy-1'));
    assert.equal(getById('s-copy-1')?.meta.name, 'imported');
  });

  test('replace collision overwrites existing document', () => {
    importMany([makeDoc('one', { name: 'old', updatedAt: '2020-01-01T00:00:00.000Z' })], 'replace');
    importMany([makeDoc('one', { name: 'new', updatedAt: '2024-01-01T00:00:00.000Z' })], 'replace');
    assert.equal(getById('one')?.meta.name, 'new');
  });
});

describe('importScenariosFromJsonText', () => {
  test('returns error for invalid JSON without touching storage', () => {
    const before = mem.getItem(SCENARIOS_STORAGE_KEY);
    const r = importScenariosFromJsonText('not json', 'replace');
    assert.equal(r.ok, false);
    assert.equal(mem.getItem(SCENARIOS_STORAGE_KEY), before);
  });

  test('imports bundle and reports count', () => {
    const text = JSON.stringify([makeDoc('x'), makeDoc('y')]);
    const r = importScenariosFromJsonText(text, 'replace');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.imported, 2);
    assert.equal(list().length, 2);
  });

  test('returns ParseResult error when persistence fails (does not throw)', () => {
    __setScenariosStorageForTests(new ThrowingStorage());
    const text = JSON.stringify([makeDoc('x')]);
    const r = importScenariosFromJsonText(text, 'replace');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error, /failed to import scenarios/i);
      assert.match(r.error, /quota exceeded/i);
    }
  });
});
