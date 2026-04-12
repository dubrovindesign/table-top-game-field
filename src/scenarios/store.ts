import { parseScenarioDocument as parseScenarioDocumentFromSchema } from './schema.ts';
import type { ScenarioDocument, ScenarioMeta } from './types.ts';

export const SCENARIOS_STORAGE_KEY = 'hexBoard_scenarios_v1';

export type ImportConflictStrategy = 'replace' | 'keep-both';
export { parseScenarioDocument } from './schema.ts';

type StorageBackend = Pick<Storage, 'getItem' | 'setItem'>;

let storageOverride: StorageBackend | null = null;

/** In tests, inject an in-memory backend; pass `null` to clear. */
export function __setScenariosStorageForTests(backend: StorageBackend | null): void {
  storageOverride = backend;
}

function getStorage(): StorageBackend {
  if (storageOverride) return storageOverride;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls;
  }
  throw new Error('localStorage is not available; call __setScenariosStorageForTests in Node tests');
}

function updatedAtRank(meta: ScenarioMeta): number {
  const u = meta.updatedAt;
  if (u === undefined || u === '') return Number.NEGATIVE_INFINITY;
  const t = Date.parse(u);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Deterministic: `meta.updatedAt` descending (newer first), then `id` ascending. */
function sortScenarios(docs: ScenarioDocument[]): ScenarioDocument[] {
  return [...docs].sort((a, b) => {
    const tb = updatedAtRank(b.meta);
    const ta = updatedAtRank(a.meta);
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function dedupeByIdKeepingNewest(docs: ScenarioDocument[]): ScenarioDocument[] {
  const deduped: ScenarioDocument[] = [];
  const seen = new Set<string>();
  for (const doc of sortScenarios(docs)) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    deduped.push(doc);
  }
  return deduped;
}

function loadUnsafe(): ScenarioDocument[] {
  try {
    const raw = getStorage().getItem(SCENARIOS_STORAGE_KEY);
    if (raw == null || raw === '') return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ScenarioDocument[] = [];
    for (const item of parsed) {
      const parsedDoc = parseScenarioDocumentFromSchema(item);
      if (parsedDoc.ok) out.push(parsedDoc.value);
    }
    return dedupeByIdKeepingNewest(out);
  } catch {
    return [];
  }
}

function save(docs: ScenarioDocument[]): void {
  const sorted = dedupeByIdKeepingNewest(docs);
  try {
    getStorage().setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(sorted));
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Failed to persist scenarios to localStorage key "${SCENARIOS_STORAGE_KEY}"${reason}`);
  }
}

export function list(): ScenarioDocument[] {
  return sortScenarios(loadUnsafe());
}

export function getById(id: string): ScenarioDocument | undefined {
  return loadUnsafe().find((d) => d.id === id);
}

export function upsert(doc: ScenarioDocument): void {
  const items = loadUnsafe();
  const idx = items.findIndex((d) => d.id === doc.id);
  if (idx >= 0) items[idx] = doc;
  else items.push(doc);
  save(items);
}

export function removeById(id: string): void {
  save(loadUnsafe().filter((d) => d.id !== id));
}

function nextFreeId(desiredId: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(desiredId)) return desiredId;
  let n = 1;
  for (;;) {
    const candidate = `${desiredId}-copy-${n}`;
    if (!occupied.has(candidate)) return candidate;
    n += 1;
  }
}

export function importMany(docs: ScenarioDocument[], conflict: ImportConflictStrategy): void {
  if (conflict === 'replace') {
    const map = new Map<string, ScenarioDocument>();
    for (const d of loadUnsafe()) map.set(d.id, d);
    for (const d of docs) map.set(d.id, d);
    save([...map.values()]);
    return;
  }

  const items = loadUnsafe().slice();
  const occupied = new Set(items.map((d) => d.id));
  for (const doc of docs) {
    const id = nextFreeId(doc.id, occupied);
    occupied.add(id);
    const toAdd = id === doc.id ? doc : { ...doc, id };
    items.push(toAdd);
  }
  save(items);
}
