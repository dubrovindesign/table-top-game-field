import { parseScenarioDocument } from './schema.ts';
import type { ScenarioOrientation } from './types.ts';
import type { SerializedBoardStateV1 } from '../multiplayer/boardState.ts';

export type ApplyScenarioDeps = {
  applyBoardSnapshot: (snapshot: SerializedBoardStateV1) => void;
  setBoardOrientation: (orientation: ScenarioOrientation) => void;
  notifyBoardEditLocal: () => void;
};

export type ApplyScenarioResult = { ok: true } | { ok: false; error: string };

/**
 * Atomically applies a scenario: validate first; only on success run snapshot → orientation → local notify.
 */
export function applyScenarioDocument(
  raw: unknown,
  deps: ApplyScenarioDeps,
): ApplyScenarioResult {
  const parsed = parseScenarioDocument(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const doc = parsed.value;
  deps.applyBoardSnapshot(doc.snapshot);
  deps.setBoardOrientation(doc.boardOrientation);
  deps.notifyBoardEditLocal();
  return { ok: true };
}
