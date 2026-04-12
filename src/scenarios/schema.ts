import { isSerializedBoardStateV1 } from '../multiplayer/boardState.ts';
import type {
  ParseResult,
  ScenarioDocument,
  ScenarioKind,
  ScenarioMeta,
  ScenarioOrientation,
} from './types.ts';

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function parseMeta(raw: unknown): ParseResult<ScenarioMeta> {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Scenario "meta" must be an object.' };
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.name !== 'string') {
    return { ok: false, error: 'Scenario meta "name" must be a string.' };
  }
  if (typeof m.description !== 'string') {
    return { ok: false, error: 'Scenario meta "description" must be a string.' };
  }
  if (!Array.isArray(m.tags) || !m.tags.every((t) => typeof t === 'string')) {
    return { ok: false, error: 'Scenario meta "tags" must be an array of strings.' };
  }
  const d = m.difficulty;
  if (d !== 'easy' && d !== 'normal' && d !== 'hard') {
    return {
      ok: false,
      error: 'Scenario meta "difficulty" must be "easy", "normal", or "hard".',
    };
  }
  if (m.author !== undefined && typeof m.author !== 'string') {
    return { ok: false, error: 'Scenario meta "author" must be a string when provided.' };
  }
  if (m.updatedAt !== undefined && typeof m.updatedAt !== 'string') {
    return { ok: false, error: 'Scenario meta "updatedAt" must be a string when provided.' };
  }
  const meta: ScenarioMeta = {
    name: m.name,
    description: m.description,
    tags: m.tags.slice(),
    difficulty: d,
  };
  if (m.author !== undefined) meta.author = m.author;
  if (m.updatedAt !== undefined) meta.updatedAt = m.updatedAt;
  return { ok: true, value: meta };
}

/**
 * Parse and validate a scenario document at runtime (import/load boundary).
 */
export function parseScenarioDocument(raw: unknown): ParseResult<ScenarioDocument> {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Scenario document must be a JSON object.' };
  }
  const o = raw as Record<string, unknown>;

  if (o.version !== 1) {
    const v = o.version;
    if (v === undefined) {
      return { ok: false, error: 'Unsupported scenario document version: expected 1.' };
    }
    return {
      ok: false,
      error: `Unsupported scenario document version: ${String(v)} (expected 1).`,
    };
  }

  if (!isNonEmptyString(o.id)) {
    return { ok: false, error: 'Scenario document must include a non-empty string "id".' };
  }

  const kind = o.kind;
  if (kind !== 'official' && kind !== 'custom') {
    return { ok: false, error: 'Scenario "kind" must be "official" or "custom".' };
  }

  const boardOrientation = o.boardOrientation;
  if (boardOrientation !== 'horizontal' && boardOrientation !== 'vertical') {
    return {
      ok: false,
      error: 'Scenario "boardOrientation" must be "horizontal" or "vertical".',
    };
  }

  const metaResult = parseMeta(o.meta);
  if (!metaResult.ok) return metaResult;

  if (!isSerializedBoardStateV1(o.snapshot)) {
    return {
      ok: false,
      error: 'Scenario "snapshot" is not a valid serialized board state (v1).',
    };
  }

  const doc: ScenarioDocument = {
    id: o.id,
    version: 1,
    kind: kind as ScenarioKind,
    meta: metaResult.value,
    boardOrientation: boardOrientation as ScenarioOrientation,
    snapshot: o.snapshot,
  };

  return { ok: true, value: doc };
}
