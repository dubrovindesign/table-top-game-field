/** Canvas tilt for god table cards — must stay in sync with renderer exports. */
export const GOD_TABLE_CARD_ROT_CW_DEG = 10;

/**
 * In-plane rotation for god-card art (and flip-axis sandwich) in content space:
 * card tilt + seat correction + `contentFieldRotationDeltaDeg` from main/render config.
 * Not the raw field/board rotation alone.
 */
export function godTableCardContentVisualRotationDeg(parts: {
  oppositeSeatUnitRotationCorrectionDeg: number;
  contentFieldRotationDeltaDeg: number;
}): number {
  return (
    GOD_TABLE_CARD_ROT_CW_DEG +
    parts.oppositeSeatUnitRotationCorrectionDeg +
    parts.contentFieldRotationDeltaDeg
  );
}

export type RotationModelInput = {
  baseDeg: number;
  seatExtraDeg: number;
  orientation: 'horizontal' | 'vertical';
};

export function deriveRotationModel(
  input: RotationModelInput,
): { fieldDeg: number; contentDeg: number } {
  void input.orientation;
  const deg = input.baseDeg + input.seatExtraDeg;
  return {
    fieldDeg: deg,
    contentDeg: deg,
  };
}
