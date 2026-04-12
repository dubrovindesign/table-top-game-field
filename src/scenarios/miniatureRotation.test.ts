import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveMiniVisualFacingDeg,
  snapLogicalMiniRotationDeg,
  stepLogicalMiniRotationDeg,
} from './miniatureRotationModel.ts';

const SIXTY_LATTICE = new Set([0, 60, 120, 180, 240, 300]);

function assertNormalizedOnSixtyLattice(deg: number, message?: string) {
  const n = ((deg % 360) + 360) % 360;
  assert.equal(n % 60, 0, message ?? `expected 60° lattice angle, got ${deg} (norm ${n})`);
}

test('small mini drop snaps logical rotation to nearest valid 60-degree direction', () => {
  assert.equal(snapLogicalMiniRotationDeg(73), 60);
  assert.equal(snapLogicalMiniRotationDeg(119), 120);
  assert.equal(snapLogicalMiniRotationDeg(0), 0);
  assert.equal(snapLogicalMiniRotationDeg(360), 0);
});

test('mini visual facing depends on seat, not scenario orientation', () => {
  const seat0 = deriveMiniVisualFacingDeg({
    logicalDeg: 120,
    seatExtraDeg: 0,
    scenarioOrientation: 'vertical',
  });
  const seat1 = deriveMiniVisualFacingDeg({
    logicalDeg: 120,
    seatExtraDeg: 180,
    scenarioOrientation: 'vertical',
  });
  assert.notEqual(seat0, seat1);

  const horizontal = deriveMiniVisualFacingDeg({
    logicalDeg: 120,
    seatExtraDeg: 90,
    scenarioOrientation: 'horizontal',
  });
  const vertical = deriveMiniVisualFacingDeg({
    logicalDeg: 120,
    seatExtraDeg: 90,
    scenarioOrientation: 'vertical',
  });
  assert.equal(
    horizontal,
    vertical,
    'visual facing must not change when only scenario orientation changes',
  );
});

test('big mini rotates in 60-degree steps with consistent wrap', () => {
  assert.equal(stepLogicalMiniRotationDeg(0, 1), 60);
  assert.equal(stepLogicalMiniRotationDeg(300, 1), 0);
  assert.equal(stepLogicalMiniRotationDeg(0, -1), 300);
  assert.equal(stepLogicalMiniRotationDeg(180, 2), 300);
  assert.equal(stepLogicalMiniRotationDeg(120, -2), 0);
});

test('large and huge mini logical rotation remains on the 60-degree lattice after step operations', () => {
  let logical = 240;
  for (let i = 0; i < 24; i++) {
    assert.ok(SIXTY_LATTICE.has(logical), `start or intermediate ${logical} must be lattice-valid`);
    const delta = i % 3 === 0 ? 1 : i % 3 === 1 ? -2 : 3;
    logical = stepLogicalMiniRotationDeg(logical, delta);
    assertNormalizedOnSixtyLattice(logical, `after step ${i} with delta ${delta}`);
  }
});

/** Mirrors `main.ts` interactive Q/E threshold: normal vs Shift-fast step count. */
function interactiveMiniRotationDeltaStepsFromKeyboardDelta(deltaDeg: number): number {
  const ELEMENT_ROT_STEP_FAST = 15;
  const stepCount = Math.abs(deltaDeg) >= ELEMENT_ROT_STEP_FAST - 1 ? 2 : 1;
  return deltaDeg > 0 ? stepCount : -stepCount;
}

test('big mini interactive path: snap base then 60° lattice steps (normal vs fast)', () => {
  const ELEMENT_ROT_STEP = 5;
  const ELEMENT_ROT_STEP_FAST = 15;
  let logical = snapLogicalMiniRotationDeg(73);
  assert.equal(logical, 60);
  logical = stepLogicalMiniRotationDeg(logical, interactiveMiniRotationDeltaStepsFromKeyboardDelta(ELEMENT_ROT_STEP));
  assert.equal(logical, 120);
  logical = stepLogicalMiniRotationDeg(logical, interactiveMiniRotationDeltaStepsFromKeyboardDelta(ELEMENT_ROT_STEP_FAST));
  assert.equal(logical, 240);
});

test('large mini interactive stepping matches pivot + stepLogicalMiniRotationDeg', () => {
  const pivotRot = 180;
  const next = stepLogicalMiniRotationDeg(pivotRot, interactiveMiniRotationDeltaStepsFromKeyboardDelta(5));
  assert.equal(next, 240);
  const prev = stepLogicalMiniRotationDeg(pivotRot, interactiveMiniRotationDeltaStepsFromKeyboardDelta(-15));
  assert.equal(prev, 60);
});

test('huge mini interactive stepping snaps off-lattice state then steps on lattice', () => {
  const prevRot = 89;
  const base = snapLogicalMiniRotationDeg(prevRot);
  assert.equal(base, 60);
  const stepped = stepLogicalMiniRotationDeg(base, interactiveMiniRotationDeltaStepsFromKeyboardDelta(-5));
  assertNormalizedOnSixtyLattice(stepped);
  assert.equal(stepped, 0);
});
