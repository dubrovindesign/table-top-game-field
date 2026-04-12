import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMiniVisualFacingDeg } from './miniatureRotationModel.ts';
import {
  GOD_TABLE_CARD_ROT_CW_DEG,
  deriveRotationModel,
  godTableCardContentVisualRotationDeg,
} from './rotationModel.ts';

test('vertical orientation affects field rotation', () => {
  const r = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 0, orientation: 'vertical' });
  assert.equal(r.fieldDeg, 80);
  assert.equal(r.contentDeg, -10);
});

test('content overlays do not consume vertical orientation bonus', () => {
  const r = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 0, orientation: 'vertical' });
  assert.equal(r.contentDeg, -10);
});

test('content rotation is seat-driven and independent of scenario orientation', () => {
  const seat0 = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 0, orientation: 'horizontal' });
  const seat180 = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 180, orientation: 'horizontal' });
  assert.equal(seat0.contentDeg, -10);
  assert.equal(seat180.contentDeg, 170);
  assert.equal(seat180.contentDeg > seat0.contentDeg, true);

  const h = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 180, orientation: 'horizontal' });
  const v = deriveRotationModel({ baseDeg: -10, seatExtraDeg: 180, orientation: 'vertical' });
  assert.equal(h.contentDeg, v.contentDeg);
});

test('miniature visual facing matches seat combination and ignores scenario orientation', () => {
  const h = deriveMiniVisualFacingDeg({
    logicalDeg: 45,
    seatExtraDeg: 90,
    scenarioOrientation: 'horizontal',
  });
  const v = deriveMiniVisualFacingDeg({
    logicalDeg: 45,
    seatExtraDeg: 90,
    scenarioOrientation: 'vertical',
  });
  assert.equal(h, v);
});

test('god card flip sandwich rotation follows content visual basis, not raw field rotation', () => {
  const baseDeg = -10;
  const seatExtraDeg = 0;
  const h = deriveRotationModel({ baseDeg, seatExtraDeg, orientation: 'horizontal' });
  const v = deriveRotationModel({ baseDeg, seatExtraDeg, orientation: 'vertical' });
  const deltaH = h.contentDeg - h.fieldDeg;
  const deltaV = v.contentDeg - v.fieldDeg;

  const flipH = godTableCardContentVisualRotationDeg({
    oppositeSeatUnitRotationCorrectionDeg: 0,
    contentFieldRotationDeltaDeg: deltaH,
  });
  const flipV = godTableCardContentVisualRotationDeg({
    oppositeSeatUnitRotationCorrectionDeg: 0,
    contentFieldRotationDeltaDeg: deltaV,
  });

  assert.equal(flipH, GOD_TABLE_CARD_ROT_CW_DEG + deltaH);
  assert.equal(flipV, GOD_TABLE_CARD_ROT_CW_DEG + deltaV);
  assert.notEqual(h.fieldDeg, v.fieldDeg);
  const fieldCoupledVertical = GOD_TABLE_CARD_ROT_CW_DEG + v.fieldDeg;
  assert.notEqual(flipV, fieldCoupledVertical);
});
