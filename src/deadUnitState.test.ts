import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDeadEntry,
  bigMiniRestorePlacementCollides,
  commitDeadRestoreIfLegal,
  deadScoreTotal,
  mergeDeadByZoneThreeWay,
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

// ── 3-way merge (multiplayer apply) ─────────────────────────────────────

function keySets(s: DeadByZone): [Set<string>, Set<string>] {
  return [
    new Set(s[0].map((e) => e.boardInstanceId)),
    new Set(s[1].map((e) => e.boardInstanceId)),
  ];
}

function allowedOf(...ids: string[]): Set<string> {
  return new Set(ids);
}

const emptyBaseline: [Set<string>, Set<string>] = [new Set(), new Set()];

test('3-way merge: preserves locally added entry when incoming does not yet know it', () => {
  // Our graveyard got X, remote still has nothing.
  const baseline = emptyBaseline;
  const incoming: DeadByZone = [[], []];
  const local: DeadByZone = [[{ boardInstanceId: 'x', scoredPoints: 5, order: 0 }], []];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x'),
  });
  assert.deepEqual(merged[0].map((e) => e.boardInstanceId), ['x']);
  assert.equal(merged[1].length, 0);
  assert.equal(diverged, true);
});

test('3-way merge: honors local removal even if stale incoming still has the entry', () => {
  // We just restored X; remote hasn't received the push yet.
  const baseline: [Set<string>, Set<string>] = [new Set(['x']), new Set()];
  const incoming: DeadByZone = [[{ boardInstanceId: 'x', scoredPoints: 5, order: 0 }], []];
  const local: DeadByZone = [[], []];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x'),
  });
  assert.equal(merged[0].length, 0);
  assert.equal(merged[1].length, 0);
  assert.equal(diverged, true);
});

test('3-way merge: honors local slot move even if incoming still has baseline slot', () => {
  // We just moved X from slot 0 → slot 1; remote is stale.
  const baseline: [Set<string>, Set<string>] = [new Set(['x']), new Set()];
  const incoming: DeadByZone = [[{ boardInstanceId: 'x', scoredPoints: 5, order: 0 }], []];
  const local: DeadByZone = [[], [{ boardInstanceId: 'x', scoredPoints: 5, order: 0 }]];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x'),
  });
  assert.equal(merged[0].length, 0);
  assert.deepEqual(merged[1].map((e) => e.boardInstanceId), ['x']);
  assert.equal(diverged, true);
});

test('3-way merge: accepts remote addition when local did not touch it', () => {
  // Remote added Y, we never saw it; no local conflict.
  const baseline = emptyBaseline;
  const incoming: DeadByZone = [[], [{ boardInstanceId: 'y', scoredPoints: 3, order: 0 }]];
  const local: DeadByZone = [[], []];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('y'),
  });
  assert.deepEqual(merged[1].map((e) => e.boardInstanceId), ['y']);
  assert.equal(diverged, false);
});

test('3-way merge: accepts remote removal when local did not touch it', () => {
  // Remote restored Y, we hadn't seen it either way.
  const baseline: [Set<string>, Set<string>] = [new Set(), new Set(['y'])];
  const incoming: DeadByZone = [[], []];
  const local: DeadByZone = [[], [{ boardInstanceId: 'y', scoredPoints: 3, order: 0 }]];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('y'),
  });
  assert.equal(merged[0].length, 0);
  assert.equal(merged[1].length, 0);
  assert.equal(diverged, false);
});

test('3-way merge: simultaneous additions in different slots both survive', () => {
  // Both players drop their own mini at once; neither snapshot has the other yet.
  const baseline = emptyBaseline;
  const incoming: DeadByZone = [[], [{ boardInstanceId: 'y', scoredPoints: 3, order: 0 }]];
  const local: DeadByZone = [[{ boardInstanceId: 'x', scoredPoints: 5, order: 0 }], []];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x', 'y'),
  });
  assert.deepEqual(merged[0].map((e) => e.boardInstanceId), ['x']);
  assert.deepEqual(merged[1].map((e) => e.boardInstanceId), ['y']);
  assert.equal(diverged, true);
});

test('3-way merge: local restore survives while other dead entries stay', () => {
  // We restored X, but Y and Z are still in our graveyard. Stale remote still lists X,Y,Z.
  const baseline: [Set<string>, Set<string>] = [new Set(['x', 'y', 'z']), new Set()];
  const incoming: DeadByZone = [
    [
      { boardInstanceId: 'x', scoredPoints: 2, order: 0 },
      { boardInstanceId: 'y', scoredPoints: 3, order: 1 },
      { boardInstanceId: 'z', scoredPoints: 4, order: 2 },
    ],
    [],
  ];
  const local: DeadByZone = [
    [
      { boardInstanceId: 'y', scoredPoints: 3, order: 0 },
      { boardInstanceId: 'z', scoredPoints: 4, order: 1 },
    ],
    [],
  ];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x', 'y', 'z'),
  });
  assert.deepEqual(merged[0].map((e) => e.boardInstanceId), ['y', 'z']);
  assert.equal(merged[1].length, 0);
  assert.equal(diverged, true);
});

test('3-way merge: drops entries whose id is not in allowed', () => {
  const baseline = emptyBaseline;
  const incoming: DeadByZone = [[{ boardInstanceId: 'unknown', scoredPoints: 2, order: 0 }], []];
  const local: DeadByZone = [[], []];
  const { merged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('x'),
  });
  assert.equal(merged[0].length, 0);
});

test('3-way merge: renumbers order contiguously', () => {
  const baseline: [Set<string>, Set<string>] = [new Set(['a']), new Set()];
  const incoming: DeadByZone = [[{ boardInstanceId: 'a', scoredPoints: 1, order: 5 }], []];
  const local: DeadByZone = [
    [
      { boardInstanceId: 'a', scoredPoints: 1, order: 5 },
      { boardInstanceId: 'b', scoredPoints: 2, order: 9 },
    ],
    [],
  ];
  const { merged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('a', 'b'),
  });
  assert.deepEqual(merged[0].map((e) => e.order), [0, 1]);
});

test('3-way merge: stable state → final identical to incoming, not diverged', () => {
  const base = new Set(['a', 'b']);
  const baseline: [Set<string>, Set<string>] = [base, new Set()];
  const incoming: DeadByZone = [
    [
      { boardInstanceId: 'a', scoredPoints: 1, order: 0 },
      { boardInstanceId: 'b', scoredPoints: 2, order: 1 },
    ],
    [],
  ];
  const local: DeadByZone = [
    [
      { boardInstanceId: 'a', scoredPoints: 1, order: 0 },
      { boardInstanceId: 'b', scoredPoints: 2, order: 1 },
    ],
    [],
  ];
  const { merged, diverged } = mergeDeadByZoneThreeWay({
    baseline, incoming, local, allowed: allowedOf('a', 'b'),
  });
  assert.deepEqual(merged[0].map((e) => e.boardInstanceId), ['a', 'b']);
  assert.equal(diverged, false);
  void keySets; // used in other scenarios; silence unused warning if any
});
