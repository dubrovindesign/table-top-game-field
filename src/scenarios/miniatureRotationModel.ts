const STEP_DEG = 60;

export function normalizeDeg360(deg: number): number {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

export function snapLogicalMiniRotationDeg(inputDeg: number): number {
  const norm = normalizeDeg360(inputDeg);
  return (Math.round(norm / STEP_DEG) * STEP_DEG) % 360;
}

export function stepLogicalMiniRotationDeg(currentDeg: number, deltaSteps: number): number {
  return normalizeDeg360(currentDeg + deltaSteps * STEP_DEG);
}

export function deriveMiniVisualFacingDeg(input: {
  logicalDeg: number;
  seatExtraDeg: number;
  scenarioOrientation: 'horizontal' | 'vertical';
}): number {
  void input.scenarioOrientation;
  return normalizeDeg360(input.logicalDeg + input.seatExtraDeg);
}
