import type { SerializedBoardStateV1 } from '../multiplayer/boardState.ts';
import type { ScenarioDocument, ScenarioOrientation } from './types.ts';

/** Meta fields edited in the scenarios panel (custom create + official/custom edit). */
export type EditableScenarioMeta = {
  name: string;
  description: string;
  tags: string[];
  difficulty: 'easy' | 'normal' | 'hard';
};

/**
 * Builds a full official {@link ScenarioDocument} for PUT: base identity + new meta,
 * current board orientation and snapshot supplied by the caller (live board in `main`).
 */
export function mergeOfficialEditIntoDocument(
  base: ScenarioDocument,
  meta: EditableScenarioMeta,
  boardOrientation: ScenarioOrientation,
  snapshot: SerializedBoardStateV1,
): ScenarioDocument {
  return {
    ...base,
    meta: {
      ...base.meta,
      ...meta,
      updatedAt: new Date().toISOString(),
    },
    boardOrientation,
    snapshot,
  };
}

/** Stable id for new custom scenarios (browser `crypto.randomUUID` when available). */
export function newScenarioDocumentId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Split user tag input (commas, semicolons, newlines) into trimmed non-empty tags. */
export function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function scenarioOrientationLabelRu(o: ScenarioOrientation): string {
  return o === 'vertical' ? 'Вертикальная' : 'Горизонтальная';
}

export function difficultyLabelRu(d: 'easy' | 'normal' | 'hard'): string {
  switch (d) {
    case 'easy':
      return 'Лёгкий';
    case 'normal':
      return 'Нормальный';
    case 'hard':
      return 'Сложный';
    default:
      return d;
  }
}
