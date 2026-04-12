import type { SerializedBoardStateV1 } from '../multiplayer/boardState.ts';

export type ScenarioKind = 'official' | 'custom';

/** Board layout relative to the default camera / rotation baseline. */
export type ScenarioOrientation = 'horizontal' | 'vertical';

export type ScenarioMeta = {
  name: string;
  description: string;
  tags: string[];
  difficulty: 'easy' | 'normal' | 'hard';
  author?: string;
  updatedAt?: string;
};

export type ScenarioDocument = {
  id: string;
  version: 1;
  kind: ScenarioKind;
  meta: ScenarioMeta;
  boardOrientation: ScenarioOrientation;
  snapshot: SerializedBoardStateV1;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
