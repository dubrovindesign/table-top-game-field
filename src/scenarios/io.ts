import { parseScenarioDocument } from './schema.ts';
import type { ImportConflictStrategy } from './store.ts';
import { importMany } from './store.ts';
import type { ParseResult, ScenarioDocument } from './types.ts';

export type { ImportConflictStrategy };
export { importMany };

/**
 * Parse a single scenario from JSON text (e.g. file contents or paste).
 * Uses the canonical `parseScenarioDocument` validator.
 */
export function parseScenarioJsonText(text: string): ParseResult<ScenarioDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON: could not parse scenario text.' };
  }
  return parseScenarioDocument(raw);
}

/**
 * Parse JSON that is either one scenario object or an array of scenario objects.
 * Every object must validate; the first validation error is returned.
 */
export function parseScenariosBundleJsonText(text: string): ParseResult<ScenarioDocument[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON: could not parse scenario text.' };
  }
  if (Array.isArray(raw)) {
    const out: ScenarioDocument[] = [];
    for (const item of raw) {
      const r = parseScenarioDocument(item);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out };
  }
  const single = parseScenarioDocument(raw);
  if (!single.ok) return single;
  return { ok: true, value: [single.value] };
}

/** Serialize a validated document for export (stable key order is not guaranteed; content is canonical JSON). */
export function scenarioDocumentToJsonString(doc: ScenarioDocument, pretty = false): string {
  const space = pretty ? 2 : undefined;
  return JSON.stringify(doc, null, space);
}

/** Build a `Blob` suitable for `URL.createObjectURL` + download in the browser. */
export function createScenarioJsonBlob(doc: ScenarioDocument, options?: { pretty?: boolean }): Blob {
  const pretty = options?.pretty ?? false;
  return new Blob([scenarioDocumentToJsonString(doc, pretty)], {
    type: 'application/json;charset=utf-8',
  });
}

/**
 * Trigger a file download in the browser. No-op environments should use `createScenarioJsonBlob` instead.
 */
export function downloadScenarioJson(doc: ScenarioDocument, filename: string, options?: { pretty?: boolean }): void {
  if (typeof globalThis.document === 'undefined' || !globalThis.document.body) {
    throw new Error('downloadScenarioJson is only available in a browser with a document.');
  }
  const blob = createScenarioJsonBlob(doc, options);
  const url = URL.createObjectURL(blob);
  try {
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = filename.toLowerCase().endsWith('.json') ? filename : `${filename}.json`;
    a.rel = 'noopener';
    globalThis.document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Parse bundle text and merge into storage using the store’s conflict rules (`replace` overwrites by id;
 * `keep-both` assigns deterministic `id-copy-n` ids when needed).
 */
export function importScenariosFromJsonText(
  text: string,
  conflict: ImportConflictStrategy,
): ParseResult<{ imported: number }> {
  const parsed = parseScenariosBundleJsonText(text);
  if (!parsed.ok) return parsed;
  try {
    importMany(parsed.value, conflict);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to import scenarios: ${reason}` };
  }
  return { ok: true, value: { imported: parsed.value.length } };
}
