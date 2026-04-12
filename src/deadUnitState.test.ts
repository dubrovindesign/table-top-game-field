import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDeadEntry,
  bigMiniRestorePlacementCollides,
  commitDeadRestoreIfLegal,
  deadScoreTotal,
  moveDeadEntryBetweenZones,
  normalizeDeadByZone,
  removeDeadEntry,
  resolveDeadZoneScoredPoints,
  upsertDeadEntry,
  type DeadByZone,
} from './deadUnitState.ts';

function empty(): DeadByZone {
  return [[], []];
}

function totalZones(state: DeadByZone): number {
  return deadScoreTotal(state[0]) + deadScoreTotal(state[1]);
}

test('add entry updates total', () => {
  const s0 = empty();
  const s1 = addDeadEntry(s0, 0, { boardInstanceId: 'u1', scoredPoints: 3 });
  assert.equal(deadScoreTotal(s1[0]), 3);
  assert.equal(totalZones(s1), 3);
  assert.equal(s1[0][0]!.order, 0);
});

test('duplicate boardInstanceId in same zone is idempotent', () => {
  const s0 = empty();
  const s1 = addDeadEntry(s0, 1, { boardInstanceId: 'a', scoredPoints: 4 });
  const s2 = addDeadEntry(s1, 1, { boardInstanceId: 'a', scoredPoints: 99 });
  assert.equal(s2, s1);
  assert.equal(deadScoreTotal(s2[1]), 4);
  assert.equal(s2[1].length, 1);
});

test('move entry between zones keeps one entry and transfers points', () => {
  let s = empty();
  s = addDeadEntry(s, 0, { boardInstanceId: 'x', scoredPoints: 7 });
  const before = totalZones(s);
  const moved = moveDeadEntryBetweenZones(s, 'x', 1);
  assert.equal(moved[0].length, 0);
  assert.equal(moved[1].length, 1);
  assert.equal(moved[1][0]!.boardInstanceId, 'x');
  assert.equal(moved[1][0]!.scoredPoints, 7);
  assert.equal(moved[1][0]!.order, 0);
  assert.equal(totalZones(moved), before);
});

test('normalize keeps first duplicate globally and rewrites order contiguously', () => {
  const raw: DeadByZone = [
    [
      { boardInstanceId: 'a', scoredPoints: 5, order: 9 },
      { boardInstanceId: 'b', scoredPoints: 3, order: 8 },
    ],
    [
      { boardInstanceId: 'a', scoredPoints: 7, order: 0 },
      { boardInstanceId: 'c', scoredPoints: 1, order: 3 },
    ],
  ];
  const n = normalizeDeadByZone(raw);
  assert.deepEqual(
    n[0].map((e) => e.boardInstanceId),
    ['a', 'b'],
  );
  assert.deepEqual(
    n[1].map((e) => e.boardInstanceId),
    ['c'],
  );
  assert.deepEqual(
    n[0].map((e) => e.order),
    [0, 1],
  );
  assert.deepEqual(
    n[1].map((e) => e.order),
    [0],
  );
  assert.equal(n[0][0]!.scoredPoints, 5);
  assert.equal(n[1][0]!.scoredPoints, 1);
  assert.equal(n[0].length, 2);
  assert.equal(n[1].length, 1);
});

test('normalize clamps negative and non-integer points to non-negative integers', () => {
  const n = normalizeDeadByZone([
    [
      { boardInstanceId: 'p', scoredPoints: -2, order: 0 },
      { boardInstanceId: 'q', scoredPoints: 2.7, order: 1 },
    ],
    [],
  ]);
  assert.equal(n[0][0]!.scoredPoints, 0);
  assert.equal(n[0][1]!.scoredPoints, 2);
  assert.deepEqual(
    n[0].map((e) => e.order),
    [0, 1],
  );
});

test('normalize drops empty boardInstanceId', () => {
  const n = normalizeDeadByZone([
    [
      { boardInstanceId: '', scoredPoints: 1, order: 0 },
      { boardInstanceId: 'ok', scoredPoints: 2, order: 1 },
    ],
    [{ boardInstanceId: '', scoredPoints: 3, order: 0 }],
  ]);
  assert.deepEqual(
    n[0].map((e) => e.boardInstanceId),
    ['ok'],
  );
  assert.equal(n[0][0]!.order, 0);
  assert.equal(n[1].length, 0);
});

test('removeDeadEntry removes from whichever zone', () => {
  let s = empty();
  s = addDeadEntry(s, 0, { boardInstanceId: 'r', scoredPoints: 1 });
  s = addDeadEntry(s, 1, { boardInstanceId: 's', scoredPoints: 2 });
  const r = removeDeadEntry(s, 'r');
  assert.equal(r[0].length, 0);
  assert.equal(r[1].length, 1);
  assert.equal(r[1][0]!.order, 0);
});

test('addDeadEntry no-op when id exists in other zone', () => {
  let s = empty();
  s = addDeadEntry(s, 0, { boardInstanceId: 'z', scoredPoints: 1 });
  const t = addDeadEntry(s, 1, { boardInstanceId: 'z', scoredPoints: 9 });
  assert.equal(t, s);
  assert.equal(t[1].length, 0);
});

test('moveDeadEntryBetweenZones no-op when missing id', () => {
  const s = empty();
  const t = moveDeadEntryBetweenZones(s, 'nope', 0);
  assert.equal(t, s);
});

test('moveDeadEntryBetweenZones no-op when already in target zone', () => {
  let s = empty();
  s = addDeadEntry(s, 1, { boardInstanceId: 'x', scoredPoints: 3 });
  const t = moveDeadEntryBetweenZones(s, 'x', 1);
  assert.equal(t, s);
});

test('resolveDeadZoneScoredPoints prefers roster override, then catalog', () => {
  assert.deepEqual(resolveDeadZoneScoredPoints(5, 9), { scoredPoints: 5, warned: false });
  assert.deepEqual(resolveDeadZoneScoredPoints(undefined, 9), { scoredPoints: 9, warned: false });
});

test('resolveDeadZoneScoredPoints falls back to 0 with warning when missing', () => {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(String(args[0]));
  };
  try {
    const r = resolveDeadZoneScoredPoints(undefined, undefined);
    assert.deepEqual(r, { scoredPoints: 0, warned: true });
    assert.ok(lines.some((l) => l.includes('[dead zone]')));
  } finally {
    console.warn = orig;
  }
});

test('resolveDeadZoneScoredPoints warning includes boardInstanceId when provided', () => {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(String(args[0]));
  };
  try {
    resolveDeadZoneScoredPoints(undefined, undefined, 'inst-42');
    assert.ok(lines.some((l) => l.includes('boardInstanceId=inst-42')));
  } finally {
    console.warn = orig;
  }
});

test('bigMiniRestorePlacementCollides skips excludeBigIndex (self) for footprint overlap', () => {
  const fp = ['a', 'b', 'c'];
  const other = [new Set(['a', 'x']), new Set(['z'])];
  assert.equal(bigMiniRestorePlacementCollides(fp, new Set(), other, 0), false);
  assert.equal(bigMiniRestorePlacementCollides(fp, new Set(), other, 1), true);
});

test('bigMiniRestorePlacementCollides detects unit under footprint', () => {
  assert.equal(bigMiniRestorePlacementCollides(['u1', 'u2'], new Set(['u1']), [], -1), true);
});

test('upsertDeadEntry moves id between zones and updates points', () => {
  let s = empty();
  s = upsertDeadEntry(s, 0, { boardInstanceId: 'a', scoredPoints: 2 });
  assert.equal(deadScoreTotal(s[0]), 2);
  s = upsertDeadEntry(s, 1, { boardInstanceId: 'a', scoredPoints: 6 });
  assert.equal(s[0].length, 0);
  assert.equal(s[1].length, 1);
  assert.equal(s[1][0]!.scoredPoints, 6);
});

test('commitDeadRestoreIfLegal illegal returns same state ref and unchanged totals', () => {
  let s = empty();
  s = addDeadEntry(s, 0, { boardInstanceId: 'x', scoredPoints: 3 });
  const before = deadScoreTotal(s[0]) + deadScoreTotal(s[1]);
  const out = commitDeadRestoreIfLegal(s, 'x', false);
  assert.equal(out, s);
  assert.equal(deadScoreTotal(out[0]) + deadScoreTotal(out[1]), before);
});

test('commitDeadRestoreIfLegal legal removes entry and updates totals', () => {
  let s = empty();
  s = addDeadEntry(s, 1, { boardInstanceId: 'y', scoredPoints: 4 });
  const before = deadScoreTotal(s[0]) + deadScoreTotal(s[1]);
  const out = commitDeadRestoreIfLegal(s, 'y', true);
  assert.notEqual(out, s);
  assert.equal(deadScoreTotal(out[0]) + deadScoreTotal(out[1]), before - 4);
  assert.equal(out[1].length, 0);
});
