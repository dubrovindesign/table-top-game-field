import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadOfficialScenarioSeedDocuments,
  validateScenarioDocumentStrict,
} from '../src/scenarios/official.ts';
import type { ScenarioDocument, ScenarioMeta } from '../src/scenarios/types.ts';

export type OfficialScenarioCatalogOptions = {
  /**
   * When omitted, seeds from bundled static official scenario documents
   * ({@link loadOfficialScenarioSeedDocuments}).
   */
  initialDocs?: ScenarioDocument[];
  nowIso: () => string;
  /** Optional JSON file path for durable catalog persistence across server restarts. */
  storageFilePath?: string;
};

export type OfficialScenarioUpdateContext = {
  actor?: string;
};

export type OfficialScenarioCatalog = {
  list(): ScenarioDocument[];
  getById(id: string): ScenarioDocument | undefined;
  update(raw: unknown, ctx?: OfficialScenarioUpdateContext): ScenarioDocument;
  catalogUpdatedAt(): string;
};

function cloneScenarioDocument(doc: ScenarioDocument): ScenarioDocument {
  return structuredClone(doc);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      const child = (value as Record<string, unknown>)[key];
      deepFreeze(child);
    }
  }
  return value;
}

function toStoredScenarioDocument(doc: ScenarioDocument): ScenarioDocument {
  return deepFreeze(cloneScenarioDocument(doc));
}

function validateOfficialScenarioDocumentStrict(raw: unknown, label: string): ScenarioDocument {
  const validated = validateScenarioDocumentStrict(raw, label);
  if (validated.kind !== 'official') {
    throw new Error(`${label}: document kind must be "official".`);
  }
  return validated;
}

type PersistedOfficialCatalogJson = {
  catalogUpdatedAt: string;
  scenarios: unknown[];
};

function loadPersistedCatalog(
  storageFilePath: string,
): { catalogUpdatedAt: string; docs: ScenarioDocument[] } | null {
  if (!existsSync(storageFilePath)) return null;
  const text = readFileSync(storageFilePath, 'utf8');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Official catalog storage is not valid JSON: ${storageFilePath}`);
  }
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`Official catalog storage must be a JSON object: ${storageFilePath}`);
  }
  const o = raw as Partial<PersistedOfficialCatalogJson>;
  if (typeof o.catalogUpdatedAt !== 'string' || !Array.isArray(o.scenarios)) {
    throw new Error(
      `Official catalog storage must contain { catalogUpdatedAt: string, scenarios: unknown[] }: ${storageFilePath}`,
    );
  }
  const docs = o.scenarios.map((docRaw, index) =>
    validateOfficialScenarioDocumentStrict(
      docRaw,
      `Official scenario catalog persisted scenarios[${index}]`,
    ),
  );
  return { catalogUpdatedAt: o.catalogUpdatedAt, docs };
}

function persistCatalog(
  storageFilePath: string,
  catalogUpdatedAt: string,
  docs: readonly ScenarioDocument[],
): void {
  mkdirSync(dirname(storageFilePath), { recursive: true });
  const payload: PersistedOfficialCatalogJson = {
    catalogUpdatedAt,
    scenarios: docs.map(cloneScenarioDocument),
  };
  writeFileSync(storageFilePath, JSON.stringify(payload, null, 2), 'utf8');
}

function mergeMetaForUpdate(options: {
  validated: ScenarioDocument;
  previous: ScenarioDocument | undefined;
  ctx: OfficialScenarioUpdateContext;
  updatedAt: string;
}): ScenarioMeta {
  const { validated, previous, ctx, updatedAt } = options;

  const author: string | undefined =
    ctx.actor !== undefined
      ? ctx.actor
      : previous !== undefined && previous.meta.author !== undefined
        ? previous.meta.author
        : validated.meta.author;

  const meta: ScenarioMeta = {
    name: validated.meta.name,
    description: validated.meta.description,
    tags: validated.meta.tags.slice(),
    difficulty: validated.meta.difficulty,
    updatedAt,
  };
  if (author !== undefined) {
    meta.author = author;
  }
  return meta;
}

/**
 * In-memory official scenario catalog: seeds from static docs by default,
 * last-write-wins by `id`, strict validation on {@link OfficialScenarioCatalog.update}.
 */
export function createOfficialScenarioCatalog(
  options: OfficialScenarioCatalogOptions,
): OfficialScenarioCatalog {
  const { nowIso, storageFilePath } = options;
  const fallbackSeedDocs: ScenarioDocument[] =
    options.initialDocs !== undefined
      ? options.initialDocs.map((raw, index) =>
          validateOfficialScenarioDocumentStrict(
            raw,
            `Official scenario catalog initialDocs[${index}]`,
          ),
        )
      : loadOfficialScenarioSeedDocuments();
  let catalogUpdatedAt = nowIso();
  let seedDocs = fallbackSeedDocs;

  if (storageFilePath) {
    const persisted = loadPersistedCatalog(storageFilePath);
    if (persisted) {
      seedDocs = persisted.docs;
      catalogUpdatedAt = persisted.catalogUpdatedAt;
    } else {
      persistCatalog(storageFilePath, catalogUpdatedAt, seedDocs);
    }
  }

  const byId = new Map<string, ScenarioDocument>();
  for (const doc of seedDocs) {
    byId.set(doc.id, toStoredScenarioDocument(doc));
  }

  return {
    catalogUpdatedAt() {
      return catalogUpdatedAt;
    },

    list() {
      return [...byId.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(cloneScenarioDocument);
    },

    getById(id: string) {
      const stored = byId.get(id);
      return stored === undefined ? undefined : cloneScenarioDocument(stored);
    },

    update(raw: unknown, ctx: OfficialScenarioUpdateContext = {}) {
      const validated = validateOfficialScenarioDocumentStrict(
        raw,
        'Official scenario catalog update',
      );

      const previous = byId.get(validated.id);
      const updatedAt = nowIso();
      const meta = mergeMetaForUpdate({
        validated,
        previous,
        ctx,
        updatedAt,
      });

      const next: ScenarioDocument = {
        ...validated,
        meta,
      };
      const storedNext = toStoredScenarioDocument(next);
      byId.set(validated.id, storedNext);
      catalogUpdatedAt = updatedAt;
      if (storageFilePath) {
        persistCatalog(storageFilePath, catalogUpdatedAt, [...byId.values()]);
      }
      return cloneScenarioDocument(storedNext);
    },
  };
}
