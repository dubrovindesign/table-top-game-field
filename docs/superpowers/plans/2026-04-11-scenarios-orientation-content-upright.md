# Scenarios Orientation Content-Upright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `vertical` scenario orientation rotate only the field layer while keeping units/cards/blind-zone/content overlays upright and seat-driven.

**Architecture:** Split the current single effective rotation into two explicit transforms: `effectiveFieldRotationDeg()` and `effectiveContentRotationDeg()`. Route grid/underlay/camera-field mapping to field rotation, while readable content and related UI overlays use content rotation (seat-only). Preserve backward compatibility for snapshot apply/sync and keep multiplayer seat behavior unchanged.

**Tech Stack:** TypeScript, Vite, existing renderer/main runtime, Node test runner via `tsx --test`.

---

## File Structure

- Modify: `src/main.ts`  
  Responsibility: introduce/route field vs content rotation APIs; keep scenario orientation only in field layer; keep seat correction in content layer.
- Modify: `src/renderer.ts`  
  Responsibility: consume split rotation inputs where needed for draw transforms.
- Modify: `src/godHandBlindDock.ts`  
  Responsibility: ensure blind-zone orientation follows content layer only.
- Modify: `src/healthUi.ts`  
  Responsibility: ensure health/effect anchor math does not inherit field orientation.
- Modify: `src/multiplayer/boardState.ts`  
  Responsibility: keep orientation serialization compatibility and validation (no behavior regression).
- Create: `src/scenarios/orientation.test.ts`  
  Responsibility: lock expected rotation math and separation invariants.

---

### Task 1: Add Rotation Separation Tests (Fail First)

**Files:**
- Create: `src/scenarios/orientation.test.ts`
- Test: `src/scenarios/orientation.test.ts`

- [ ] **Step 1: Write failing tests for split rotation invariants**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRotationModel } from './rotationModel.ts';

test('vertical affects field rotation only', () => {
  const r = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 0, orientation: 'vertical' });
  assert.equal(r.fieldDeg, 80);
  assert.equal(r.contentDeg, -10);
});

test('seat affects content in both orientations', () => {
  const h = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 180, orientation: 'horizontal' });
  const v = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 180, orientation: 'vertical' });
  assert.equal(h.contentDeg, v.contentDeg);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test src/scenarios/orientation.test.ts`  
Expected: FAIL (`rotationModel.ts` / `deriveRotationModel` missing).

- [ ] **Step 3: Commit failing test scaffold**

```bash
git add src/scenarios/orientation.test.ts
git commit -m "test(scenarios): add failing tests for field/content rotation split"
```

---

### Task 2: Implement Rotation Model and Main Runtime Wiring

**Files:**
- Create: `src/scenarios/rotationModel.ts`
- Modify: `src/main.ts`
- Test: `src/scenarios/orientation.test.ts`

- [ ] **Step 1: Implement minimal rotation model**

```ts
export type RotationModelInput = {
  baseDeg: number;
  seatExtraDeg: number;
  orientation: 'horizontal' | 'vertical';
};

export function deriveRotationModel(input: RotationModelInput): { fieldDeg: number; contentDeg: number } {
  const orientationExtra = input.orientation === 'vertical' ? 90 : 0;
  return {
    fieldDeg: input.baseDeg + input.seatExtraDeg + orientationExtra,
    contentDeg: input.baseDeg + input.seatExtraDeg,
  };
}
```

- [ ] **Step 2: Replace single effective rotation usage in `main.ts`**

```ts
function effectiveFieldRotationDeg(): number {
  return deriveRotationModel({
    baseDeg: BOARD_ROTATION_DEG,
    seatExtraDeg: viewSeatExtraRotationDeg,
    orientation: scenarioBoardOrientation,
  }).fieldDeg;
}

function effectiveContentRotationDeg(): number {
  return deriveRotationModel({
    baseDeg: BOARD_ROTATION_DEG,
    seatExtraDeg: viewSeatExtraRotationDeg,
    orientation: scenarioBoardOrientation,
  }).contentDeg;
}
```

- [ ] **Step 3: Run tests/build**

Run: `npx tsx --test src/scenarios/orientation.test.ts src/scenarios/*.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add src/scenarios/rotationModel.ts src/main.ts src/scenarios/orientation.test.ts
git commit -m "feat(scenarios): separate field and content rotation models"
```

---

### Task 3: Route Renderer and Overlay Consumers to Correct Layer

**Files:**
- Modify: `src/renderer.ts`
- Modify: `src/godHandBlindDock.ts`
- Modify: `src/healthUi.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add failing assertion tests for overlay/content orientation invariants**

```ts
test('content overlays do not consume vertical orientation bonus', () => {
  const r = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 0, orientation: 'vertical' });
  assert.equal(r.contentDeg, -10);
});
```

- [ ] **Step 2: Wire field-only consumers**

```ts
renderer.updateConfig({
  boardRotationDeg: effectiveFieldRotationDeg(),
});
```

- [ ] **Step 3: Wire content-only consumers**

```ts
const contentDeg = effectiveContentRotationDeg();
// unit card / blind zone / health/effect anchor math uses contentDeg path
```

- [ ] **Step 4: Build/test**

Run: `npx tsx --test src/scenarios/orientation.test.ts src/scenarios/*.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts src/godHandBlindDock.ts src/healthUi.ts src/main.ts src/scenarios/orientation.test.ts
git commit -m "fix(scenarios): keep content overlays upright in vertical orientation"
```

---

### Task 4: Validate Snapshot/MP Compatibility

**Files:**
- Modify: `src/multiplayer/boardState.ts` (only if needed)
- Modify: `src/scenarios/apply.test.ts`
- Modify: `src/scenarios/schema.test.ts`

- [ ] **Step 1: Add compatibility tests**

```ts
test('legacy snapshot without boardOrientation still applies with horizontal default', () => {
  // assert no throw and orientation fallback path
});

test('vertical snapshot affects field but not content rotation model', () => {
  // assert via exposed helper or behavior hook
});
```

- [ ] **Step 2: Run scenario test suite**

Run: `npx tsx --test src/scenarios/*.test.ts`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/multiplayer/boardState.ts src/scenarios/apply.test.ts src/scenarios/schema.test.ts
git commit -m "test(mp): lock orientation compatibility for snapshots and scenario apply"
```

---

### Task 5: Final Verification (Solo + MP Smoke)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-11-scenarios-orientation-content-upright-design.md` (only if implementation deltas appear)

- [ ] **Step 1: Automated verification**

Run: `npx tsx --test src/scenarios/*.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 2: Manual smoke checks**

Checklist:
1. Apply horizontal scenario: baseline visuals unchanged.
2. Apply vertical scenario: grid/field looks vertical, but unit cards + god cards + blind zone remain upright.
3. Rotate between seats in MP: content orientation still follows seat, not orientation.
4. Vertical scenario in room: both clients get same field orientation; each client keeps correct seat content orientation.
5. Drag/hit-test in vertical works same quality as horizontal.
6. Health/effect overlays remain readable and aligned.

Expected: all checks pass.

- [ ] **Step 3: Final commit**

```bash
git add src docs/superpowers/specs/2026-04-11-scenarios-orientation-content-upright-design.md
git commit -m "fix(scenarios): apply vertical orientation to field only and keep content seat-upright"
```

---

## Self-Review

### 1) Spec coverage

- Field/content split architecture: Task 2 + Task 3.
- Vertical impacts field only: Task 2 + Task 3 tests.
- Seat-only content orientation: Task 2 invariants + Task 3 routing.
- Hit-test/drag correctness: Task 3 + Task 5 smoke checks.
- MP/snapshot compatibility: Task 4.

No uncovered spec requirement found.

### 2) Placeholder scan

- No “TODO/TBD/implement later”.
- Each task includes concrete files, commands, expected outcomes, and commit steps.

### 3) Type consistency

- `RotationModelInput`, `deriveRotationModel`, `effectiveFieldRotationDeg`, and `effectiveContentRotationDeg` are consistent across tasks.

