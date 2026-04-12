# Huge2 Miniature Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce first-class `huge2` miniatures (2 adjacent hexons), move siege golem to `huge2`, and auto-migrate legacy `huge` siege golems on load without breaking existing sizes.

**Architecture:** Add a new size discriminator (`huge2`) and parallel runtime lane similar to existing `huge`, but with dedicated 2-hexon geometry. Keep serialization and multiplayer contracts backward compatible by adding optional `huge2` arrays/drag kind and migration on load. Ensure renderer, placement, selection, and card defaults all consume the same canonical anchor+rotation contract.

**Tech Stack:** TypeScript, Vite client, canvas renderer, existing board snapshot (`SerializedBoardStateV1`), `node:test` + `tsx --test`.

---

## File Structure

- Modify: `src/unitCard.ts`  
  Responsibility: extend `UnitSize` and default distance-unit rules to include `huge2`.
- Modify: `src/hex.ts`  
  Responsibility: canonical `huge2` geometry helpers (centers + covered cells).
- Modify: `src/healthUi.ts`  
  Responsibility: `huge2` badge/toggle anchor helpers using 2-hexon footprint bounds.
- Modify: `src/renderer.ts`  
  Responsibility: maintain/draw `huge2` state, preview, selection, health/activation/effects.
- Modify: `src/main.ts`  
  Responsibility: runtime collections, spawn/drag/rotate/place/delete/copy behavior for `huge2`; migration wiring.
- Modify: `src/multiplayer/protocol.ts`  
  Responsibility: add `huge2` drag kind contract.
- Modify: `src/multiplayer/boardState.ts`  
  Responsibility: snapshot shape + validation support for `huge2` arrays.
- Modify: `src/catalog/units/engeln-siege_golem.json`  
  Responsibility: change `size` to `huge2`.
- Modify: `src/catalogEditorPanel.ts`  
  Responsibility: include `huge2` in size pickers/validation.
- Modify: `src/armyBuilderPanel.ts`  
  Responsibility: explicit sort order rank for `huge2`.
- Modify: `src/scenarios/schema.test.ts`  
  Responsibility: schema fixture includes new optional arrays.
- Modify: `src/scenarios/io.test.ts`, `src/scenarios/apply.test.ts`, `src/scenarios/store.test.ts`, `src/scenarios/official.test.ts`  
  Responsibility: snapshot fixtures cover `huge2` arrays.
- Create: `src/hex.huge2.test.ts`  
  Responsibility: verify canonical `huge2` geometry and 60-degree rotation behavior.
- Create: `src/multiplayer/boardState.huge2.test.ts`  
  Responsibility: verify parser accepts valid `huge2` and rejects malformed shapes.

---

### Task 1: Add Failing Geometry Tests for `huge2`

**Files:**
- Create: `src/hex.huge2.test.ts`
- Modify: `src/hex.ts`

- [ ] **Step 1: Write failing tests for canonical `huge2` footprint**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { Hex, huge2DominoHexonCentersOriented, huge2DominoAllCellsOriented } from './hex.ts';

test('huge2 centers use anchor + rotation direction neighbor', () => {
  const anchor = new Hex(10, -4);
  const r0 = huge2DominoHexonCentersOriented(anchor, 0);
  assert.equal(r0.length, 2);
  assert.equal(r0[0]!.key, anchor.key);
  assert.equal(r0[1]!.key, anchor.add(Hex.directions[0]!).key);
});

test('huge2 covers exactly 14 cells (2 hexons * 7 cells)', () => {
  const cells = huge2DominoAllCellsOriented(new Hex(0, 0), 120);
  assert.equal(new Set(cells.map((c) => c.key)).size, 14);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test src/hex.huge2.test.ts`  
Expected: FAIL because `huge2` helpers do not exist.

- [ ] **Step 3: Implement minimal `huge2` geometry in `hex.ts`**

```ts
export function huge2DominoHexonCentersOriented(anchor: Hex, rotationDeg: number): Hex[] {
  const steps = ((Math.round(rotationDeg / 60) % 6) + 6) % 6;
  return [anchor, anchor.add(Hex.directions[steps]!)];
}

export function huge2DominoAllCellsOriented(anchor: Hex, rotationDeg: number): Hex[] {
  return huge2DominoHexonCentersOriented(anchor, rotationDeg).flatMap((hc) => [
    hc,
    ...Hex.directions.map((d) => hc.add(d)),
  ]);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/hex.huge2.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hex.ts src/hex.huge2.test.ts
git commit -m "feat(board): add huge2 canonical geometry helpers"
```

---

### Task 2: Extend Size Type + UI Size Lists

**Files:**
- Modify: `src/unitCard.ts`
- Modify: `src/catalogEditorPanel.ts`
- Modify: `src/armyBuilderPanel.ts`
- Modify: `src/catalog/units/engeln-siege_golem.json`

- [ ] **Step 1: Write failing assertions in existing tests/fixtures**

```ts
// add to a card-data-oriented test file
const size: UnitCardData['size'] = 'huge2';
assert.equal(size, 'huge2');
```

- [ ] **Step 2: Run target test command**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: FAIL in type checks or fixtures until size unions are updated.

- [ ] **Step 3: Implement size extension and defaults**

```ts
// unitCard.ts
export type UnitSize = 'small' | 'big' | 'large' | 'huge' | 'huge2';
// default distance unit checks include huge2 in hexon bucket
```

```ts
// catalogEditorPanel.ts size lists
const sizes: UnitCardData['size'][] = ['small', 'large', 'big', 'huge', 'huge2'];
```

```ts
// armyBuilderPanel.ts rank
const ROSTER_SIZE_RANK: Record<UnitSize, number> = {
  small: 0, large: 1, big: 2, huge: 3, huge2: 4,
};
```

```json
// engeln-siege_golem.json
"size": "huge2"
```

- [ ] **Step 4: Re-run schema/type tests**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/unitCard.ts src/catalogEditorPanel.ts src/armyBuilderPanel.ts src/catalog/units/engeln-siege_golem.json
git commit -m "feat(units): add huge2 size and map siege golem to huge2"
```

---

### Task 3: Snapshot + Protocol Support (`huge2` arrays and drag kind)

**Files:**
- Modify: `src/multiplayer/boardState.ts`
- Modify: `src/multiplayer/protocol.ts`
- Create: `src/multiplayer/boardState.huge2.test.ts`
- Modify: `src/scenarios/schema.test.ts`

- [ ] **Step 1: Add failing parser tests for `huge2`**

```ts
test('board state parser accepts huge2 arrays', () => {
  const raw = makeMinimalSnapshot({ huge2Miniatures: [], huge2MiniCardData: [] });
  assert.equal(isSerializedBoardStateV1(raw), true);
});

test('board state parser rejects malformed huge2 array shape', () => {
  const raw = makeMinimalSnapshot({ huge2Miniatures: [{}], huge2MiniCardData: [] });
  assert.equal(isSerializedBoardStateV1(raw), false);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test src/multiplayer/boardState.huge2.test.ts src/scenarios/schema.test.ts`  
Expected: FAIL before schema/parser updates.

- [ ] **Step 3: Implement snapshot/protocol contracts**

```ts
// boardState.ts
export type SerializedHuge2Mini = { /* mirror SerializedHugeMini fields */ };
// SerializedBoardStateV1 adds:
// huge2Miniatures: SerializedHuge2Mini[];
// huge2MiniCardData: UnitCardData[];
// validation loops over huge2Miniatures analogous to huge
```

```ts
// protocol.ts
export type TableDragKind = 'none' | 'unit' | 'big' | 'large' | 'huge' | 'huge2' | 'terrain' | 'ether' | 'godLoose';
// TABLE_DRAG_KINDS includes huge2
```

- [ ] **Step 4: Re-run parser/protocol tests**

Run: `npx tsx --test src/multiplayer/boardState.huge2.test.ts src/scenarios/schema.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/boardState.ts src/multiplayer/protocol.ts src/multiplayer/boardState.huge2.test.ts src/scenarios/schema.test.ts
git commit -m "feat(sync): add huge2 snapshot and drag protocol support"
```

---

### Task 4: Runtime `main.ts` Lane for `huge2` + Legacy Migration

**Files:**
- Modify: `src/main.ts`
- Modify: scenario fixture tests: `src/scenarios/io.test.ts`, `src/scenarios/apply.test.ts`, `src/scenarios/store.test.ts`, `src/scenarios/official.test.ts`

- [ ] **Step 1: Add failing migration + smoke tests**

```ts
test('legacy huge siege golem migrates to huge2 on load', () => {
  // fixture contains siege golem in hugeMiniatures
  // after load normalization -> removed from huge, present in huge2 with same metadata
});
```

- [ ] **Step 2: Run scenario tests to verify failure**

Run: `npx tsx --test src/scenarios/io.test.ts src/scenarios/apply.test.ts src/scenarios/store.test.ts src/scenarios/official.test.ts`  
Expected: FAIL until `huge2` arrays and migration are wired.

- [ ] **Step 3: Implement `huge2` runtime collections and actions**

```ts
// main.ts
type Huge2Mini = { /* same meta pattern as HugeMini */ };
const huge2Miniatures: Huge2Mini[] = [];
const huge2MiniCardData: UnitCardData[] = [];
// add selection/drag indices, spawn path when def.card.size === 'huge2',
// placement legality using huge2 geometry helpers, rotation/drag/drop/copy/delete support
```

- [ ] **Step 4: Implement legacy migration in board-load path**

```ts
// during snapshot import normalization:
// for each index i in huge arrays:
// if card/catalog id is engeln-siege_golem -> move pair [hugeMiniatures[i], hugeMiniCardData[i]] to huge2 arrays
// remove from huge arrays in descending index order
// if pair malformed -> keep original and warn
```

- [ ] **Step 5: Re-run scenario tests**

Run: `npx tsx --test src/scenarios/io.test.ts src/scenarios/apply.test.ts src/scenarios/store.test.ts src/scenarios/official.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/scenarios/io.test.ts src/scenarios/apply.test.ts src/scenarios/store.test.ts src/scenarios/official.test.ts
git commit -m "feat(board): add huge2 runtime behavior and legacy siege golem migration"
```

---

### Task 5: Renderer + Health UI for `huge2` Footprint

**Files:**
- Modify: `src/renderer.ts`
- Modify: `src/healthUi.ts`

- [ ] **Step 1: Add failing render behavior checks (targeted smoke assertions)**

```ts
// add assertions in existing renderer-oriented test harness (or minimal smoke helper):
// huge2 preview path must use 2-hexon contour, not huge(3) contour.
```

- [ ] **Step 2: Run relevant tests/build**

Run: `npm run build`  
Expected: FAIL or type errors before renderer wiring is complete.

- [ ] **Step 3: Implement `huge2` renderer lane**

```ts
// renderer.ts
// add huge2 state arrays + setters
// implement huge2 local centers/bounds/path helpers
// draw placed + preview + selected huge2 minis
// wire health, activation toggle, broomgar marker, effect markers for huge2
```

```ts
// healthUi.ts
// add huge2 bounds helpers and functions:
// huge2MiniHealthBadgeCenterWorld(...)
// huge2MiniActivationToggleCenterFromPivotWorld(...)
// huge2MiniBroomgarHungerCenterFromPivotWorld(...)
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run build`  
Expected: PASS.

Run: `npx tsx --test src/hex.huge2.test.ts src/multiplayer/boardState.huge2.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts src/healthUi.ts
git commit -m "feat(renderer): render huge2 miniatures with dedicated footprint UI anchors"
```

---

### Task 6: Final Regression Sweep

**Files:**
- Modify: none (unless fixes required)
- Test: all affected tests + build

- [ ] **Step 1: Run focused full suite**

Run:
`npx tsx --test src/hex.huge2.test.ts src/multiplayer/boardState.huge2.test.ts src/scenarios/schema.test.ts src/scenarios/io.test.ts src/scenarios/apply.test.ts src/scenarios/store.test.ts src/scenarios/official.test.ts`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 3: Manual smoke checklist**

```md
- Spawn siege golem from army panel -> 2-hexon footprint
- Rotate siege golem through 6 steps -> footprint follows canonical direction mapping
- Save + reload board -> siege golem remains huge2
- Load legacy board with siege golem huge -> auto-migrated to huge2
- Existing huge (3-hexon) unit still behaves unchanged
```

- [ ] **Step 4: Commit final fixes if any**

```bash
git add -A
git commit -m "test(board): complete huge2 regression sweep" # only if additional fixes were needed
```

---

## Self-Review

1. **Spec coverage:**  
   Covered first-class `huge2`, siege golem re-size, canonical anchor+rotation, migration, snapshot/protocol updates, and anti-regression tests. No uncovered mandatory requirement found.

2. **Placeholder scan:**  
   No `TODO/TBD/implement later` placeholders. Each task includes concrete files, commands, and code examples.

3. **Type consistency:**  
   Uses consistent names: `huge2Miniatures`, `huge2MiniCardData`, `SerializedHuge2Mini`, and `huge2` as `UnitSize` discriminator.

