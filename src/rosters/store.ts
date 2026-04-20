import type { RosterDocument, RosterWorld } from './types.ts';

export const ROSTERS_STORAGE_KEY = 'hexBoard_rosters_v1';

type StorageBackend = Pick<Storage, 'getItem' | 'setItem'>;

let storageOverride: StorageBackend | null = null;

export function __setRostersStorageForTests(backend: StorageBackend | null): void {
  storageOverride = backend;
}

function getStorage(): StorageBackend {
  if (storageOverride) return storageOverride;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls;
  }
  throw new Error('localStorage is not available');
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseWorld(raw: unknown): RosterWorld | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  return { x: r.x, y: r.y };
}

function parseDoc(raw: unknown): RosterDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.version !== 2) return null;
  const meta = o.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.name !== 'string') return null;

  const unitsOut: RosterDocument['units'] = [];
  for (const u of Array.isArray(o.units) ? o.units : []) {
    if (!u || typeof u !== 'object') continue;
    const r = u as Record<string, unknown>;
    if (typeof r.leaderId !== 'string' || typeof r.unitId !== 'string') continue;
    const w = parseWorld(r.world);
    if (!w) continue;
    unitsOut.push({ leaderId: r.leaderId, unitId: r.unitId, world: w });
  }

  const godPiecesOut: RosterDocument['godPieces'] = [];
  for (const p of Array.isArray(o.godPieces) ? o.godPieces : []) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (!isStringArray(r.ids) || r.ids.length === 0) continue;
    const w = parseWorld(r.world);
    if (!w) continue;
    godPiecesOut.push({ ids: r.ids, world: w, faceUp: r.faceUp === true });
  }

  const inventoryOut: RosterDocument['inventory'] = [];
  for (const it of Array.isArray(o.inventory) ? o.inventory : []) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    if (typeof r.leaderId !== 'string' || typeof r.itemId !== 'string') continue;
    const w = parseWorld(r.world);
    if (!w) continue;
    inventoryOut.push({ leaderId: r.leaderId, itemId: r.itemId, world: w });
  }

  const savedBySlot: 0 | 1 = o.savedBySlot === 1 ? 1 : 0;
  return {
    id: o.id,
    version: 2,
    savedBySlot,
    meta: {
      name: meta.name,
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : undefined,
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
    },
    units: unitsOut,
    godPieces: godPiecesOut,
    inventory: inventoryOut,
  };
}

function updatedAtRank(doc: RosterDocument): number {
  const u = doc.meta.updatedAt;
  if (!u) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(u);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function sortDocs(docs: RosterDocument[]): RosterDocument[] {
  return [...docs].sort((a, b) => {
    const diff = updatedAtRank(b) - updatedAtRank(a);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function loadAll(): RosterDocument[] {
  try {
    const raw = getStorage().getItem(ROSTERS_STORAGE_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: RosterDocument[] = [];
    for (const item of arr) {
      const d = parseDoc(item);
      if (d) out.push(d);
    }
    return out;
  } catch {
    return [];
  }
}

function saveAll(docs: RosterDocument[]): void {
  getStorage().setItem(ROSTERS_STORAGE_KEY, JSON.stringify(docs));
}

export function listRosters(): RosterDocument[] {
  return sortDocs(loadAll());
}

export function upsertRoster(doc: RosterDocument): void {
  const items = loadAll();
  const idx = items.findIndex((d) => d.id === doc.id);
  if (idx >= 0) items[idx] = doc;
  else items.push(doc);
  saveAll(items);
}

export function removeRosterById(id: string): void {
  saveAll(loadAll().filter((d) => d.id !== id));
}

export function newRosterId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `roster-${Date.now().toString(36)}-${rnd}`;
}
