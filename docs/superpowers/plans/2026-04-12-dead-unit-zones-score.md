# Dead Unit Zones Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mirrored dead-unit zones with reversible score tracking by zone side, synced in multiplayer, and displayed near crystal wallets in the top turn panel.

**Architecture:** Introduce a dedicated dead-zone overlay (`DeadUnitDock`) parallel to blind-zone dock, plus a small pure-state module for dead-entry transitions. Keep `deadByZone` as the serialized source of truth, derive local/opponent UI mapping from `localViewPlayerSlot`, and integrate into existing full-snapshot board sync.

**Tech Stack:** TypeScript, Vite client, Node test runner via `tsx --test`, existing multiplayer snapshot/protocol pipeline.

---

## File Structure

**Create**
- `src/deadUnitState.ts` — pure data model and transition helpers (`add`, `remove`, `move`, totals, dedupe, normalization).
- `src/deadUnitState.test.ts` — unit tests for deterministic rules and score math.
- `src/deadUnitDock.ts` — DOM overlay class for two side zones, layout application, pointer hit tests, and drag hooks.
- `src/multiplayer/boardState.dead-zone.test.ts` — snapshot validation tests for `deadByZone`.

**Modify**
- `src/main.ts` — dead-zone runtime state, capture/apply snapshot integration, drag/drop transitions, top panel mounts, render-loop dock updates.
- `src/multiplayer/boardState.ts` — `SerializedBoardStateV1` extension and validator/parser for `deadByZone`.
- `src/style.css` — dead-zone visual styles and top-panel score-pill styles near wallet mounts.

**Optional (if needed during implementation)**
- `src/multiplayer/protocol.ts` — only if any explicit event schema must include dead-zone deltas (preferred: no change, rely on full snapshot sync).

---

### Task 1: Build Pure Dead-Zone State Core (TDD)

**Files:**
- Create: `src/deadUnitState.ts`
- Test: `src/deadUnitState.test.ts`

- [ ] **Step 1: Write failing tests for core transitions**

```ts
// src/deadUnitState.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDeadEntry,
  moveDeadEntryBetweenZones,
  removeDeadEntry,
  deadScoreTotal,
  normalizeDeadByZone,
} from './deadUnitState.ts';

test('addDeadEntry appends and updates total', () => {
  const state = [[], []] as const;
  const next = addDeadEntry(state, 0, { boardInstanceId: 'u1', scoredPoints: 5 });
  assert.equal(deadScoreTotal(next[0]), 5);
  assert.equal(next[0].length, 1);
});

test('duplicate boardInstanceId is idempotent in same zone', () => {
  const state = [[{ boardInstanceId: 'u1', scoredPoints: 5, order: 0 }], []] as const;
  const next = addDeadEntry(state, 0, { boardInstanceId: 'u1', scoredPoints: 5 });
  assert.equal(next[0].length, 1);
  assert.equal(deadScoreTotal(next[0]), 5);
});

test('moveDeadEntryBetweenZones keeps one entry and transfers points', () => {
  const state = [[{ boardInstanceId: 'u1', scoredPoints: 5, order: 0 }], []] as const;
  const next = moveDeadEntryBetweenZones(state, 'u1', 1);
  assert.equal(deadScoreTotal(next[0]), 0);
  assert.equal(deadScoreTotal(next[1]), 5);
  assert.equal(next[1].length, 1);
});

test('normalizeDeadByZone keeps first duplicate globally', () => {
  const raw = [
    [{ boardInstanceId: 'u1', scoredPoints: 5, order: 7 }],
    [{ boardInstanceId: 'u1', scoredPoints: 5, order: 0 }],
  ] as const;
  const next = normalizeDeadByZone(raw);
  assert.equal(next[0].length, 1);
  assert.equal(next[1].length, 0);
  assert.equal(next[0][0]?.order, 0);
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx tsx --test src/deadUnitState.test.ts`  
Expected: FAIL with missing module/symbol errors.

- [ ] **Step 3: Implement minimal pure-state helpers**

```ts
// src/deadUnitState.ts
export type PlayerSlot = 0 | 1;
export type DeadEntry = { boardInstanceId: string; scoredPoints: number; order: number };
export type DeadByZone = [DeadEntry[], DeadEntry[]];

export function deadScoreTotal(entries: readonly DeadEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(0, Math.trunc(e.scoredPoints)), 0);
}

export function normalizeDeadByZone(raw: readonly [readonly DeadEntry[], readonly DeadEntry[]]): DeadByZone {
  const seen = new Set<string>();
  const out: DeadByZone = [[], []];
  for (const slot of [0, 1] as const) {
    for (const e of raw[slot]) {
      if (!e.boardInstanceId || seen.has(e.boardInstanceId)) continue;
      seen.add(e.boardInstanceId);
      out[slot].push({
        boardInstanceId: e.boardInstanceId,
        scoredPoints: Math.max(0, Math.trunc(e.scoredPoints)),
        order: out[slot].length,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Complete transition functions and re-run tests**

Run: `npx tsx --test src/deadUnitState.test.ts`  
Expected: PASS (`4 passed`).

- [ ] **Step 5: Commit**

```bash
git add src/deadUnitState.ts src/deadUnitState.test.ts
git commit -m "feat(dead-zone): add pure dead entry state transitions"
```

---

### Task 2: Extend Snapshot Schema Validation (`deadByZone`)

**Files:**
- Modify: `src/multiplayer/boardState.ts`
- Test: `src/multiplayer/boardState.dead-zone.test.ts`

- [ ] **Step 1: Write failing snapshot validator tests**

```ts
// src/multiplayer/boardState.dead-zone.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { isSerializedBoardStateV1 } from './boardState.ts';

function base(): Record<string, unknown> {
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

test('accepts legacy snapshot without deadByZone', () => {
  assert.equal(isSerializedBoardStateV1(base()), true);
});

test('accepts valid deadByZone tuple', () => {
  const raw = {
    ...base(),
    deadByZone: [
      [{ boardInstanceId: 'u1', scoredPoints: 5, order: 0 }],
      [{ boardInstanceId: 'u2', scoredPoints: 3, order: 0 }],
    ],
  };
  assert.equal(isSerializedBoardStateV1(raw), true);
});

test('rejects malformed deadByZone item', () => {
  const raw = { ...base(), deadByZone: [[{ boardInstanceId: '', scoredPoints: -1, order: 'x' }], []] };
  assert.equal(isSerializedBoardStateV1(raw), false);
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx tsx --test src/multiplayer/boardState.dead-zone.test.ts`  
Expected: FAIL until schema is added.

- [ ] **Step 3: Add types and validator**

```ts
// src/multiplayer/boardState.ts (shape)
export type SerializedDeadEntryV1 = {
  boardInstanceId: string;
  scoredPoints: number;
  order: number;
};

export type SerializedBoardStateV1 = {
  // ...
  deadByZone?: [SerializedDeadEntryV1[], SerializedDeadEntryV1[]];
};

function validDeadEntryV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const e = o as SerializedDeadEntryV1;
  return (
    typeof e.boardInstanceId === 'string' &&
    e.boardInstanceId.length > 0 &&
    typeof e.scoredPoints === 'number' &&
    Number.isInteger(e.scoredPoints) &&
    e.scoredPoints >= 0 &&
    typeof e.order === 'number' &&
    Number.isInteger(e.order) &&
    e.order >= 0
  );
}
```

- [ ] **Step 4: Wire into `isSerializedBoardStateV1` and run tests**

Run:  
- `npx tsx --test src/multiplayer/boardState.dead-zone.test.ts`  
- `npx tsx --test src/multiplayer/boardState.huge2.test.ts`  
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/boardState.ts src/multiplayer/boardState.dead-zone.test.ts
git commit -m "feat(mp): validate deadByZone in board snapshots"
```

---

### Task 3: Add Dead-Zone Dock UI Module

**Files:**
- Create: `src/deadUnitDock.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add dock skeleton and layout API**

```ts
// src/deadUnitDock.ts
export type DeadZoneLayout = {
  container: { left: number; top: number; width: number; height: number };
  cards: Array<{ left: number; top: number; width: number; height: number }>;
  borderScreenPx: number;
  zoom: number;
};

export type DeadZoneViewModel = {
  interactive: boolean;
  myEntries: Array<{ boardInstanceId: string; label: string; points: number }>;
  opponentEntries: Array<{ boardInstanceId: string; label: string; points: number }>;
};
```

- [ ] **Step 2: Implement dual-wrap DOM behavior (parallel to blind dock)**

```ts
// essential public API
export class DeadUnitDock {
  applyDualLayouts(mine: DeadZoneLayout, opp: DeadZoneLayout): void { /* ... */ }
  refresh(vm: DeadZoneViewModel): void { /* ... */ }
  isPointOverDeadZoneChrome(clientX: number, clientY: number): boolean { /* ... */ }
}
```

- [ ] **Step 3: Add dead-zone CSS with zoom-aware variables**

```css
.dead-zone-table-wrap { position: fixed; z-index: 61; pointer-events: none; --dead-zone-zoom: 1; }
.dead-zone--on-table { width: 100%; height: 100%; pointer-events: none; border: none; background: transparent; }
.dead-zone-inner { position: relative; width: 100%; height: 100%; pointer-events: none; }
.dead-zone-entry { pointer-events: auto; box-sizing: border-box; border-radius: var(--dead-entry-radius); }
```

- [ ] **Step 4: Verify build does not regress style/module imports**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/deadUnitDock.ts src/style.css
git commit -m "feat(ui): add dead unit dock overlay component"
```

---

### Task 4: Integrate Runtime State + Top Panel Score Mounts

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Add score mounts in top panel contract**

```ts
// mountTopTurnPanel return shape extension
return {
  localWalletMount,
  opponentWalletMount,
  localDeadScoreMount,
  opponentDeadScoreMount,
  getTableTurnNumber,
  setTableTurnNumber,
};
```

- [ ] **Step 2: Add dead score renderer function in `main.ts`**

```ts
function renderDeadScorePill(mount: HTMLElement, points: number): void {
  mount.textContent = '';
  const pill = document.createElement('div');
  pill.className = 'dead-score-pill';
  pill.textContent = `☠ ${points}`;
  mount.appendChild(pill);
}
```

- [ ] **Step 3: Add dead runtime collections + derived totals**

```ts
type DeadByZone = [DeadEntry[], DeadEntry[]];
let deadByZone: DeadByZone = [[], []];

function deadScoreSlotsForUi(): { local: PlayerSlot; opponent: PlayerSlot } {
  if (localViewPlayerSlot === null) return { local: 0, opponent: 1 };
  return { local: localViewPlayerSlot, opponent: (1 - localViewPlayerSlot) as PlayerSlot };
}
```

- [ ] **Step 4: Wire UI refresh into existing render/update points**

Run: `npm run build`  
Expected: PASS and no TS errors for new panel mounts.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/style.css
git commit -m "feat(ui): show dead score totals near top wallet mounts"
```

---

### Task 5: Capture/Apply Snapshot Integration for Dead Zones

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add capture payload field**

```ts
function captureBoardSnapshot(): SerializedBoardStateV1 {
  return {
    // ...
    deadByZone: [
      deadByZone[0].map((e) => ({ ...e })),
      deadByZone[1].map((e) => ({ ...e })),
    ],
  };
}
```

- [ ] **Step 2: Add apply path with normalization and warnings**

```ts
const rawDead = Array.isArray(s.deadByZone) ? s.deadByZone : [[], []];
deadByZone = normalizeDeadByZone([rawDead[0] ?? [], rawDead[1] ?? []]);
```

- [ ] **Step 3: Recompute dead-zone flags in unit lanes by `boardInstanceId`**

```ts
const deadIndex = new Map<string, PlayerSlot>();
for (const slot of [0, 1] as const) for (const e of deadByZone[slot]) deadIndex.set(e.boardInstanceId, slot);
// then mark / gate interactions in each lane based on deadIndex.has(boardInstanceId)
```

- [ ] **Step 4: Run focused test + build**

Run:  
- `npx tsx --test src/multiplayer/boardState.dead-zone.test.ts`  
- `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(sync): persist dead zones in board snapshot capture/apply"
```

---

### Task 6: Drag/Drop Rules for Board <-> Dead Zones

**Files:**
- Modify: `src/main.ts`
- Modify: `src/deadUnitDock.ts`
- Modify: `src/deadUnitState.ts`
- Test: `src/deadUnitState.test.ts`

- [ ] **Step 1: Add failing tests for illegal drag-out and cross-zone move idempotency**

```ts
test('illegal drop out of dead zone keeps entry and score', () => {
  // simulate transition helper result contract: no-op on invalid board target
});
```

- [ ] **Step 2: Implement points source resolver**

```ts
function resolveDeadScoredPoints(boardInstanceId: string): number {
  const rosterPoints = findRosterPointsForPlacedUnit(boardInstanceId);
  if (Number.isInteger(rosterPoints) && rosterPoints! >= 0) return rosterPoints!;
  const catalogPoints = findCatalogPointsForPlacedUnit(boardInstanceId);
  if (Number.isInteger(catalogPoints) && catalogPoints! >= 0) return catalogPoints!;
  console.warn('[dead-zone] fallback points=0', { boardInstanceId });
  return 0;
}
```

- [ ] **Step 3: Gate board interactions for dead-zoned minis and hook dock drop targets**

```ts
// pattern in pointer-up handlers
if (deadUnitDock?.isPointInsideZoneForSlot(clientX, clientY, targetSlot)) {
  deadByZone = addDeadEntry(deadByZone, targetSlot, { boardInstanceId, scoredPoints });
  scheduleRender();
  return;
}
```

- [ ] **Step 4: Run tests/build**

Run:  
- `npx tsx --test src/deadUnitState.test.ts`  
- `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/deadUnitDock.ts src/deadUnitState.ts src/deadUnitState.test.ts
git commit -m "feat(dead-zone): wire reversible drag transitions and score updates"
```

---

### Task 7: Rotation/Zoom + Manual Multiplayer Verification

**Files:**
- Modify (if needed): `src/main.ts`, `src/style.css`, `src/deadUnitDock.ts`

- [ ] **Step 1: Ensure render-loop applies dead-zone layouts every frame alongside blind dock**

```ts
deadUnitDock?.applyDualLayouts(
  computeDeadZoneLayoutForSlot(effectiveMyGodSlot()),
  computeDeadZoneLayoutForSlot(effectiveOpponentGodSlot()),
);
```

- [ ] **Step 2: Run production build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 3: Run multiplayer preview smoke**

Run: `npm run preview:mp`  
Expected: room server on `3333`, preview on `4173`.

- [ ] **Step 4: Execute manual checklist**

```text
1) Drag unit to local dead zone => local pill increments.
2) Drag same unit to opponent dead zone => local decrements, opponent increments.
3) Drag out to illegal board target => no score change.
4) Rotate field / zoom in/out => zones stay non-rotating, anchored by side.
5) Open second client => dead entries and pills are identical on both clients.
```

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/style.css src/deadUnitDock.ts
git commit -m "fix(dead-zone): finalize layout stability and multiplayer parity"
```

---

## Self-Review Checklist (completed before execution)

- [ ] **Spec coverage check:** every requirement in `docs/superpowers/specs/2026-04-12-dead-unit-zones-score-design.md` maps to at least one task above.
- [ ] **No-placeholder scan:** no `TODO/TBD/implement later` text remains in this plan.
- [ ] **Type consistency pass:** `DeadEntry`, `DeadByZone`, and slot naming are consistent across all tasks.
- [ ] **Command sanity check:** all listed commands exist in this repo (`npx tsx --test`, `npm run build`, `npm run preview:mp`).

