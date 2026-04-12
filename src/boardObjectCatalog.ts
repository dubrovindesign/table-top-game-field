import boardObjectsJson from './catalog/board-objects.json';

export type BoardObjectFootprint = 'hex' | 'hexon';
export type BoardObjectSpawnAs = 'boardObject' | 'terrain' | 'etherVortex';

export type BoardObjectCatalogItem = {
  id: string;
  name: string;
  category: string;
  sprite: string;
  footprint: BoardObjectFootprint;
  spawnAs: BoardObjectSpawnAs;
  imageRotationDeg?: number;
  keepImagePlayerFacing?: boolean;
  defaultHealth?: number;
};

type BoardObjectCatalogRaw = Partial<BoardObjectCatalogItem> & Record<string, unknown>;

const CATEGORY_ORDER = ['domain-badges', 'smoke', 'prisoners', 'terrain', 'ether-vortex'] as const;

function isFootprint(value: unknown): value is BoardObjectFootprint {
  return value === 'hex' || value === 'hexon';
}

function isSpawnAs(value: unknown): value is BoardObjectSpawnAs {
  return value === 'boardObject' || value === 'terrain' || value === 'etherVortex';
}

function normalizeItem(raw: BoardObjectCatalogRaw): BoardObjectCatalogItem | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  const sprite = typeof raw.sprite === 'string' ? raw.sprite.trim() : '';
  const footprint = raw.footprint;
  const spawnAsRaw = raw.spawnAs;
  const imageRotationDegRaw = raw.imageRotationDeg;
  const keepImagePlayerFacingRaw = raw.keepImagePlayerFacing;
  const defaultHealthRaw = raw.defaultHealth;
  if (!id || !name || !category || !sprite || !isFootprint(footprint)) return null;
  const spawnAs: BoardObjectSpawnAs =
    spawnAsRaw === undefined ? 'boardObject' : isSpawnAs(spawnAsRaw) ? spawnAsRaw : 'boardObject';
  const imageRotationDeg =
    typeof imageRotationDegRaw === 'number' && Number.isFinite(imageRotationDegRaw)
      ? imageRotationDegRaw
      : undefined;
  const keepImagePlayerFacing =
    typeof keepImagePlayerFacingRaw === 'boolean' ? keepImagePlayerFacingRaw : undefined;
  const defaultHealth =
    typeof defaultHealthRaw === 'number' &&
    Number.isFinite(defaultHealthRaw) &&
    defaultHealthRaw >= 1
      ? Math.floor(defaultHealthRaw)
      : undefined;
  if (!sprite.startsWith('/')) return null;
  return {
    id,
    name,
    category,
    sprite,
    footprint,
    spawnAs,
    imageRotationDeg,
    keepImagePlayerFacing,
    defaultHealth,
  };
}

function categoryRank(category: string): number {
  const idx = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function buildCatalog(): BoardObjectCatalogItem[] {
  if (!Array.isArray(boardObjectsJson)) {
    console.warn('[board-objects] catalog JSON is not an array');
    return [];
  }
  const seen = new Set<string>();
  const out: BoardObjectCatalogItem[] = [];
  for (const raw of boardObjectsJson as unknown[]) {
    const item = normalizeItem((raw ?? {}) as BoardObjectCatalogRaw);
    if (!item) {
      console.warn('[board-objects] skipped invalid entry', raw);
      continue;
    }
    if (seen.has(item.id)) {
      console.warn(`[board-objects] duplicate id "${item.id}" skipped`);
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  out.sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name));
  return out;
}

export const BOARD_OBJECT_CATALOG: readonly BoardObjectCatalogItem[] = buildCatalog();

export const BOARD_OBJECT_BY_ID: ReadonlyMap<string, BoardObjectCatalogItem> = new Map(
  BOARD_OBJECT_CATALOG.map((item) => [item.id, item]),
);

export function getBoardObjectCatalogItem(id: string): BoardObjectCatalogItem | undefined {
  return BOARD_OBJECT_BY_ID.get(id);
}

export function listBoardObjectCategories(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of BOARD_OBJECT_CATALOG) {
    if (seen.has(item.category)) continue;
    seen.add(item.category);
    out.push(item.category);
  }
  return out;
}
