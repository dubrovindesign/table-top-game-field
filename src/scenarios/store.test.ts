import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { ScenarioDocument } from './types.ts';
import {
  SCENARIOS_STORAGE_KEY,
  __setScenariosStorageForTests,
  getById,
  importMany,
  list,
  parseScenarioDocument,
  removeById,
  upsert,
} from './store.ts';

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

describe('list ordering', () => {
  test('orders by meta.updatedAt desc, then id asc', () => {
    const a = makeDoc('a', { updatedAt: '2024-01-01T00:00:00.000Z' });
    const b = makeDoc('b', { updatedAt: '2025-01-01T00:00:00.000Z' });
    const c = makeDoc('c', { updatedAt: '2025-01-01T00:00:00.000Z' });
    mem.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify([a, b, c]));
    const got = list();
    assert.deepEqual(
      got.map((d) => d.id),
      ['b', 'c', 'a'],
    );
  });

  test('tie-break: same updatedAt sorts id ascending', () => {
    const t = '2025-06-01T12:00:00.000Z';
    const z = makeDoc('z', { updatedAt: t });
    const m = makeDoc('m', { updatedAt: t });
    mem.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify([z, m]));
    assert.deepEqual(
      list().map((d) => d.id),
      ['m', 'z'],
    );
  });
});

describe('importMany replace', () => {
  test('overwrites existing id and preserves others', () => {
    const old = makeDoc('one', { updatedAt: '2020-01-01T00:00:00.000Z', name: 'old' });
    const other = makeDoc('two', { updatedAt: '2021-01-01T00:00:00.000Z' });
    upsert(old);
    upsert(other);

    const incoming = makeDoc('one', { updatedAt: '2024-01-01T00:00:00.000Z', name: 'new' });
    importMany([incoming], 'replace');

    assert.equal(getById('one')?.meta.name, 'new');
    assert.ok(getById('two'));
    assert.equal(list().length, 2);
  });
});

describe('importMany keep-both', () => {
  test('assigns deterministic copy ids when id collides', () => {
    const existing = makeDoc('s', { updatedAt: '2020-01-01T00:00:00.000Z' });
    upsert(existing);

    const incoming = makeDoc('s', { updatedAt: '2024-01-01T00:00:00.000Z', name: 'imported' });
    importMany([incoming], 'keep-both');

    const ids = new Set(list().map((d) => d.id));
    assert.ok(ids.has('s'));
    assert.ok(ids.has('s-copy-1'));
    assert.equal(getById('s-copy-1')?.meta.name, 'imported');
  });

  test('increments copy suffix until free', () => {
    upsert(makeDoc('s', { updatedAt: '2020-01-01T00:00:00.000Z' }));
    upsert(makeDoc('s-copy-1', { updatedAt: '2020-02-01T00:00:00.000Z' }));

    importMany([makeDoc('s', { updatedAt: '2024-01-01T00:00:00.000Z' })], 'keep-both');

    assert.ok(getById('s-copy-2'));
  });
});

describe('corrupted storage', () => {
  test('invalid JSON yields empty list and does not throw', () => {
    mem.setItem(SCENARIOS_STORAGE_KEY, '{ not json');
    assert.doesNotThrow(() => list());
    assert.deepEqual(list(), []);
  });

  test('non-array JSON yields empty list', () => {
    mem.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify({ foo: 1 }));
    assert.deepEqual(list(), []);
  });
});

describe('validation on load', () => {
  test('drops invalid records using parseScenarioDocument', () => {
    const good = makeDoc('good', { updatedAt: '2024-01-01T00:00:00.000Z' });
    const bad = { ...makeDoc('bad'), version: 99 };
    mem.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify([good, bad]));
    assert.deepEqual(
      list().map((d) => d.id),
      ['good'],
    );
  });

  test('deduplicates ids and keeps newest record', () => {
    const older = makeDoc('same', { updatedAt: '2024-01-01T00:00:00.000Z', name: 'older' });
    const newer = makeDoc('same', { updatedAt: '2025-01-01T00:00:00.000Z', name: 'newer' });
    mem.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify([older, newer]));

    const docs = list();
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.id, 'same');
    assert.equal(docs[0]?.meta.name, 'newer');
  });

  test('parseScenarioDocument rejects malformed input', () => {
    const parsed = parseScenarioDocument({ id: 123 });
    assert.equal(parsed.ok, false);
  });
});

describe('upsert / removeById', () => {
  test('upsert then getById', () => {
    const d = makeDoc('q');
    upsert(d);
    const got = getById('q');
    assert.ok(got);
    assert.equal(got.id, 'q');
    assert.equal(got.meta.name, 'q');
  });

  test('removeById', () => {
    upsert(makeDoc('a'));
    upsert(makeDoc('b'));
    removeById('a');
    assert.equal(getById('a'), undefined);
    assert.ok(getById('b'));
  });
});

describe('save errors', () => {
  test('surfaces clear error when localStorage.setItem fails', () => {
    __setScenariosStorageForTests(new ThrowingStorage());
    assert.throws(
      () => upsert(makeDoc('x')),
      /Failed to persist scenarios to localStorage key "hexBoard_scenarios_v1": quota exceeded/,
    );
  });
});
