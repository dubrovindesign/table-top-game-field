/**
 * JSON-serializable board snapshot v1 (units, terrain, god cards, etc.).
 */

import { EPHIRIUM_VORTEX_CARDS } from '../ephiriumVortexCards.ts';
import { isValidGodCardId } from '../godDeckState.ts';
import type { GodTablePiece } from '../godCards.ts';
import type { UnitCardData } from '../unitCard.ts';
import type { PlayerSlot } from './protocol.ts';

export type SerializedHex = { q: number; r: number };
export type SerializedPoint = { x: number; y: number };
export type SerializedBoardTemplateV1 = {
  id: string;
  hexes: SerializedHex[];
  backgroundImageSrc?: string | null;
  cellsSvgOverlaySrc?: string | null;
};
export type SerializedBoardInstanceV1 = {
  id: string;
  templateId: string;
  world: SerializedPoint;
  rotationDeg: number;
  scale: number;
  zIndex: number;
};

export type SerializedUnit = {
  position: SerializedHex;
  boardInstanceId?: string;
  deadPieceId?: string;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  /** Орда брумгаров: голод / нейтраль / разгул */
  broomgarHungerPhase?: 0 | 1 | 2;
};

export type SerializedBigMini = {
  center: SerializedHex;
  boardInstanceId?: string;
  deadPieceId?: string;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: 0 | 1 | 2;
};

export type SerializedLargeMini = {
  anchor: SerializedHex;
  boardInstanceId?: string;
  deadPieceId?: string;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: 0 | 1 | 2;
};

export type SerializedHugeMini = {
  anchor: SerializedHex;
  boardInstanceId?: string;
  deadPieceId?: string;
  offBoardWorld?: SerializedPoint;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: string[];
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: 0 | 1 | 2;
  /** Nudge of card art inside the huge footprint (layout units, after bbox-centering). */
  spriteOffsetLocal?: SerializedPoint;
  /** Rotation of card art inside the clip (degrees). */
  spriteRotationDeg?: number;
};

/** Inventory item token on the board (catalog `itemId`). */
export type SerializedInventoryTablePiece = {
  rosterLeaderId: string;
  itemId: string;
  world: SerializedPoint;
  spawnedFromArmyPanel?: boolean;
  armyOwnerPlayerSlot?: PlayerSlot;
};

export type SerializedEtherVortex = {
  center: SerializedHex;
  boardInstanceId?: string;
  etherCrystals: number;
  domain: 'life' | 'creation' | 'death' | 'destruction' | null;
  rotationDeg?: number;
  offBoardWorld?: SerializedPoint;
};

/** Одна кость в общей зоне броска (синхронизация между игроками). */
export type SerializedSharedDiceDieV1 = {
  color: 'red' | 'green' | 'black' | 'white' | 'state';
  value: number;
  rerolled: boolean;
};

/** Одна строка лога или активный бросок. */
export type SerializedSharedDiceRollRowV1 = {
  rollIndex: number;
  dice: SerializedSharedDiceDieV1[];
  sourceName: string | null;
  sourceSprite: string | null;
};

/**
 * Общие результаты кубиков и история (селектор до «Roll Dice» не входит).
 * @deprecated v1 — один общий лог; сервер/клиент мигрируют в v2.
 */
export type SerializedSharedDiceMergedLegacyV1 = {
  v: 1;
  rollCounter: number;
  log: SerializedSharedDiceRollRowV1[];
  active: SerializedSharedDiceRollRowV1 | null;
};

/** Состояние кубиков одного игрока (`PlayerSlot` 0 или 1). */
export type SerializedSharedDicePerSlotV1 = {
  rollCounter: number;
  log: SerializedSharedDiceRollRowV1[];
  active: SerializedSharedDiceRollRowV1 | null;
};

/** Раздельная история и активный бросок по слотам стола. */
export type SerializedSharedDiceStateV2 = {
  v: 2;
  bySlot: {
    '0': SerializedSharedDicePerSlotV1;
    '1': SerializedSharedDicePerSlotV1;
  };
};

export type SerializedSharedDiceBoardField = SerializedSharedDiceMergedLegacyV1 | SerializedSharedDiceStateV2;

/** Faith + ether crystal counts per seated player (multiplayer wallet UI). */
export type SerializedCrystalWalletsV1 = {
  '0': Record<string, number>;
  '1': Record<string, number>;
};

/** One dead-unit zone entry (per-player scoring lists), snapshot v1. */
export type SerializedDeadEntryV1 = {
  boardInstanceId: string;
  scoredPoints: number;
  order: number;
};

const CRYSTAL_WALLET_ID_SET = new Set(['yellow', 'black', 'red', 'green', 'ether']);

const DEAD_ZONE_MAX_ENTRIES_PER_SLOT = 500;
const DEAD_SCORED_POINTS_MAX = 1_000_000;
const DEAD_ORDER_MAX = 100_000;

function validSerializedDeadEntryV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const e = o as SerializedDeadEntryV1;
  if (!validBoardId(e.boardInstanceId)) return false;
  if (
    typeof e.scoredPoints !== 'number' ||
    !Number.isInteger(e.scoredPoints) ||
    e.scoredPoints < 0 ||
    e.scoredPoints > DEAD_SCORED_POINTS_MAX
  )
    return false;
  if (typeof e.order !== 'number' || !Number.isInteger(e.order) || e.order < 0 || e.order > DEAD_ORDER_MAX)
    return false;
  return true;
}

function validDeadByZoneV1(o: unknown): boolean {
  if (!Array.isArray(o) || o.length !== 2) return false;
  const a = o[0];
  const b = o[1];
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length > DEAD_ZONE_MAX_ENTRIES_PER_SLOT || b.length > DEAD_ZONE_MAX_ENTRIES_PER_SLOT) return false;
  if (!a.every(validSerializedDeadEntryV1) || !b.every(validSerializedDeadEntryV1)) return false;
  return true;
}

function validCrystalWalletSlotRecord(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const rec = o as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (!CRYSTAL_WALLET_ID_SET.has(k)) return false;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 99) return false;
  }
  return true;
}

export type SerializedBoardStateV1 = {
  v: 1;
  /** Optional scene-level board templates/instances; legacy snapshots can omit them. */
  boardTemplates?: SerializedBoardTemplateV1[];
  boardInstances?: SerializedBoardInstanceV1[];
  activeBoardInstanceId?: string;
  /** Scenario-level board orientation; optional for backward compatibility with legacy snapshots. */
  boardOrientation?: 'horizontal' | 'vertical';
  units: SerializedUnit[];
  unitCardData: UnitCardData[];
  bigMiniatures: SerializedBigMini[];
  bigMiniCardData: UnitCardData[];
  largeMiniatures: SerializedLargeMini[];
  largeMiniCardData: UnitCardData[];
  hugeMiniatures: SerializedHugeMini[];
  hugeMiniCardData: UnitCardData[];
  terrains: SerializedHex[];
  terrainOffBoardWorlds: Array<SerializedPoint | undefined>;
  /** Per-terrain hexon rotation; length must match `terrains` when present. */
  terrainRotationDegs?: number[];
  /** @deprecated If `terrainRotationDegs` is absent, applied to every terrain (load-only). */
  terrainRotationDeg?: number;
  etherVortexes: SerializedEtherVortex[];
  godTablePieces: GodTablePiece[];
  /** Предметы инвентаря на столе (опционально для старых снимков). */
  inventoryTablePieces?: SerializedInventoryTablePiece[];
  /**
   * Открытые карты эфирного вихря (индексы спрайта в `EPHIRIUM_VORTEX_CARDS`), порядок = порядок вытягивания, макс. 2.
   */
  ephiriumOpenSpriteIndices?: number[];
  /** Колоды/руки/сброс/слепая зона по слотам (опционально для старых снимков). */
  godDeckSlots?: SerializedGodDeckSlotsV1;
  /** Общая зона броска и история (мультиплеер). */
  sharedDice?: SerializedSharedDiceBoardField;
  /** Кошельки кристаллов по слотам стола (мультиплеер). */
  crystalWallets?: SerializedCrystalWalletsV1;
  /** Счётчик хода в верхней панели («Ход N»), 1…6. */
  tableTurnNumber?: number;
  /**
   * Dead-unit scoring zones by player slot ([slot0 entries], [slot1 entries]).
   * Optional for legacy snapshots.
   */
  deadByZone?: [SerializedDeadEntryV1[], SerializedDeadEntryV1[]];
};

/** Снимок одного слота: у чужого слота `handIds`/`deckIds`/`blindCardIds` могут отсутствовать (скрыто). */
export type SerializedGodSlotV1 = {
  discardIds: string[];
  deckCount: number;
  deckIds?: string[];
  handCount: number;
  handIds?: string[];
  /** Число карт в слепой зоне (в новых снимках всегда; в старых может не быть). */
  blindCount?: number;
  blindCardIds?: string[];
  /** @deprecated старые снимки */
  blindHasCard?: boolean;
  blindCardId?: string | null;
};

export type SerializedGodDeckSlotsV1 = {
  '0': SerializedGodSlotV1;
  '1': SerializedGodSlotV1;
};

function isHex(o: unknown): o is SerializedHex {
  if (!o || typeof o !== 'object') return false;
  const x = o as SerializedHex;
  return typeof x.q === 'number' && typeof x.r === 'number';
}

function validOptionalArmyOwnerSlot(x: unknown): boolean {
  return x === undefined || x === 0 || x === 1;
}

const GOD_BLIND_MAX = 12;
const BOARD_ID_MAX = 80;

function validBoardId(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= BOARD_ID_MAX;
}

function validSerializedGodSlotV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const s = o as SerializedGodSlotV1;
  if (!Array.isArray(s.discardIds) || !s.discardIds.every((id) => typeof id === 'string' && isValidGodCardId(id)))
    return false;
  if (typeof s.deckCount !== 'number' || s.deckCount < 0 || s.deckCount > 32) return false;
  if (typeof s.handCount !== 'number' || s.handCount < 0 || s.handCount > 3) return false;
  const hasBlindCount = typeof s.blindCount === 'number';
  const hasLegacyBlind = typeof s.blindHasCard === 'boolean';
  if (!hasBlindCount && !hasLegacyBlind) return false;
  if (hasBlindCount) {
    const bc = s.blindCount!;
    if (bc < 0 || bc > GOD_BLIND_MAX) return false;
  }
  if (
    s.deckIds !== undefined &&
    (!Array.isArray(s.deckIds) || !s.deckIds.every((id) => typeof id === 'string' && isValidGodCardId(id)))
  )
    return false;
  if (
    s.handIds !== undefined &&
    (!Array.isArray(s.handIds) ||
      !s.handIds.every((id) => typeof id === 'string' && isValidGodCardId(id)) ||
      s.handIds.length > 3)
  )
    return false;
  if (
    s.blindCardIds !== undefined &&
    (!Array.isArray(s.blindCardIds) ||
      !s.blindCardIds.every((id) => typeof id === 'string' && isValidGodCardId(id)) ||
      s.blindCardIds.length > GOD_BLIND_MAX)
  )
    return false;
  if (
    s.blindCardId !== undefined &&
    s.blindCardId !== null &&
    (typeof s.blindCardId !== 'string' || !isValidGodCardId(s.blindCardId))
  )
    return false;
  if (hasBlindCount && s.blindCardIds !== undefined) {
    const bc = s.blindCount;
    if (bc !== undefined && s.blindCardIds.length !== bc) return false;
  }
  return true;
}

function isSharedDiceColor(x: unknown): x is SerializedSharedDiceDieV1['color'] {
  return x === 'red' || x === 'green' || x === 'black' || x === 'white' || x === 'state';
}

function validSharedDiceDieV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const d = o as SerializedSharedDiceDieV1;
  if (!isSharedDiceColor(d.color)) return false;
  if (typeof d.value !== 'number' || !Number.isInteger(d.value) || d.value < 1 || d.value > 6)
    return false;
  if (typeof d.rerolled !== 'boolean') return false;
  return true;
}

function validSharedDiceRollRowV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const r = o as SerializedSharedDiceRollRowV1;
  if (typeof r.rollIndex !== 'number' || !Number.isInteger(r.rollIndex) || r.rollIndex < 0 || r.rollIndex > 100_000)
    return false;
  if (!Array.isArray(r.dice) || r.dice.length > 80) return false;
  if (!r.dice.every(validSharedDiceDieV1)) return false;
  if (r.sourceName !== null && typeof r.sourceName !== 'string') return false;
  if (r.sourceSprite !== null && typeof r.sourceSprite !== 'string') return false;
  return true;
}

function validSharedDicePerSlotV1(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const p = o as SerializedSharedDicePerSlotV1;
  if (
    typeof p.rollCounter !== 'number' ||
    !Number.isInteger(p.rollCounter) ||
    p.rollCounter < 0 ||
    p.rollCounter > 100_000
  )
    return false;
  if (!Array.isArray(p.log) || p.log.length > 500) return false;
  if (!p.log.every(validSharedDiceRollRowV1)) return false;
  if (p.active !== null && !validSharedDiceRollRowV1(p.active)) return false;
  return true;
}

function migrateMergedLegacyV1ToV2(legacy: SerializedSharedDiceMergedLegacyV1): SerializedSharedDiceStateV2 {
  return {
    v: 2,
    bySlot: {
      '0': {
        rollCounter: legacy.rollCounter,
        log: legacy.log.slice(),
        active: legacy.active,
      },
      '1': { rollCounter: 0, log: [], active: null },
    },
  };
}

/**
 * Разбор `sharedDice` в нормализованный v2; `undefined` если поля нет или формат невалиден.
 */
export function parseSharedDiceState(raw: unknown): SerializedSharedDiceStateV2 | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as { v?: unknown };
  if (s.v === 1) {
    const leg = raw as SerializedSharedDiceMergedLegacyV1;
    if (
      typeof leg.rollCounter !== 'number' ||
      !Number.isInteger(leg.rollCounter) ||
      leg.rollCounter < 0 ||
      leg.rollCounter > 100_000
    )
      return undefined;
    if (!Array.isArray(leg.log) || leg.log.length > 500) return undefined;
    if (!leg.log.every(validSharedDiceRollRowV1)) return undefined;
    if (leg.active !== null && !validSharedDiceRollRowV1(leg.active)) return undefined;
    return migrateMergedLegacyV1ToV2(leg);
  }
  if (s.v === 2) {
    const x = raw as SerializedSharedDiceStateV2;
    if (!x.bySlot || typeof x.bySlot !== 'object') return undefined;
    const z = x.bySlot as Record<string, unknown>;
    if (!validSharedDicePerSlotV1(z['0']) || !validSharedDicePerSlotV1(z['1'])) return undefined;
    return x;
  }
  return undefined;
}

/** @deprecated используйте `parseSharedDiceState` */
export function parseSharedDiceStateV1(raw: unknown): SerializedSharedDiceStateV2 | undefined {
  return parseSharedDiceState(raw);
}

export function isSerializedBoardStateV1(raw: unknown): raw is SerializedBoardStateV1 {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as SerializedBoardStateV1;
  if (o.v !== 1) return false;
  const boardOrientation = (o as { boardOrientation?: unknown }).boardOrientation;
  if (
    boardOrientation !== undefined &&
    boardOrientation !== 'horizontal' &&
    boardOrientation !== 'vertical'
  ) {
    return false;
  }
  if (!Array.isArray(o.units) || !Array.isArray(o.unitCardData)) return false;
  if (!Array.isArray(o.bigMiniatures) || !Array.isArray(o.bigMiniCardData)) return false;
  if (!Array.isArray(o.largeMiniatures) || !Array.isArray(o.largeMiniCardData)) return false;
  if (!Array.isArray(o.hugeMiniatures) || !Array.isArray(o.hugeMiniCardData)) return false;
  if (!Array.isArray(o.terrains) || !Array.isArray(o.terrainOffBoardWorlds)) return false;
  const trs = (o as SerializedBoardStateV1).terrainRotationDegs;
  const trLegacy = (o as SerializedBoardStateV1).terrainRotationDeg;
  if (Array.isArray(trs)) {
    if (trs.length !== o.terrains.length || !trs.every((x) => typeof x === 'number')) return false;
  } else if (typeof trLegacy !== 'number') {
    return false;
  }
  if (!Array.isArray(o.etherVortexes) || !Array.isArray(o.godTablePieces)) return false;
  if (o.activeBoardInstanceId !== undefined && !validBoardId(o.activeBoardInstanceId)) return false;
  if (o.boardTemplates !== undefined) {
    if (!Array.isArray(o.boardTemplates)) return false;
    for (const t of o.boardTemplates) {
      if (!t || typeof t !== 'object') return false;
      if (!validBoardId(t.id)) return false;
      if (!Array.isArray(t.hexes) || !t.hexes.every(isHex)) return false;
      if (
        t.backgroundImageSrc !== undefined &&
        t.backgroundImageSrc !== null &&
        typeof t.backgroundImageSrc !== 'string'
      )
        return false;
      if (
        t.cellsSvgOverlaySrc !== undefined &&
        t.cellsSvgOverlaySrc !== null &&
        typeof t.cellsSvgOverlaySrc !== 'string'
      )
        return false;
    }
  }
  if (o.boardInstances !== undefined) {
    if (!Array.isArray(o.boardInstances)) return false;
    for (const b of o.boardInstances) {
      if (!b || typeof b !== 'object') return false;
      if (!validBoardId(b.id) || !validBoardId(b.templateId)) return false;
      if (!b.world || typeof b.world !== 'object') return false;
      const w = b.world as { x?: unknown; y?: unknown };
      if (typeof w.x !== 'number' || typeof w.y !== 'number') return false;
      if (typeof b.rotationDeg !== 'number') return false;
      if (typeof b.scale !== 'number' || b.scale <= 0) return false;
      if (typeof b.zIndex !== 'number') return false;
    }
  }
  const ephIdx = (o as { ephiriumOpenSpriteIndices?: unknown }).ephiriumOpenSpriteIndices;
  if (ephIdx !== undefined) {
    if (!Array.isArray(ephIdx) || ephIdx.length > 2) return false;
    const n = EPHIRIUM_VORTEX_CARDS.length;
    for (const x of ephIdx) {
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= n) return false;
    }
  }
  for (const u of o.units) {
    if (!u || typeof u !== 'object') return false;
    if (!isHex(u.position)) return false;
    const em = (u as { effectMarkers?: unknown }).effectMarkers;
    if (em != null && !Array.isArray(em)) return false;
    const aos = (u as { armyOwnerPlayerSlot?: unknown }).armyOwnerPlayerSlot;
    if (!validOptionalArmyOwnerSlot(aos)) return false;
    const bid = (u as { boardInstanceId?: unknown }).boardInstanceId;
    if (bid !== undefined && !validBoardId(bid)) return false;
    const did = (u as { deadPieceId?: unknown }).deadPieceId;
    if (did !== undefined && !validBoardId(did)) return false;
  }
  for (const m of o.bigMiniatures) {
    if (!m || typeof m !== 'object') return false;
    const aos = (m as { armyOwnerPlayerSlot?: unknown }).armyOwnerPlayerSlot;
    if (!validOptionalArmyOwnerSlot(aos)) return false;
    const bid = (m as { boardInstanceId?: unknown }).boardInstanceId;
    if (bid !== undefined && !validBoardId(bid)) return false;
    const did = (m as { deadPieceId?: unknown }).deadPieceId;
    if (did !== undefined && !validBoardId(did)) return false;
  }
  for (const m of o.largeMiniatures) {
    if (!m || typeof m !== 'object') return false;
    const aos = (m as { armyOwnerPlayerSlot?: unknown }).armyOwnerPlayerSlot;
    if (!validOptionalArmyOwnerSlot(aos)) return false;
    const bid = (m as { boardInstanceId?: unknown }).boardInstanceId;
    if (bid !== undefined && !validBoardId(bid)) return false;
    const did = (m as { deadPieceId?: unknown }).deadPieceId;
    if (did !== undefined && !validBoardId(did)) return false;
  }
  for (const m of o.hugeMiniatures) {
    if (!m || typeof m !== 'object') return false;
    const aos = (m as { armyOwnerPlayerSlot?: unknown }).armyOwnerPlayerSlot;
    if (!validOptionalArmyOwnerSlot(aos)) return false;
    const bid = (m as { boardInstanceId?: unknown }).boardInstanceId;
    if (bid !== undefined && !validBoardId(bid)) return false;
    const did = (m as { deadPieceId?: unknown }).deadPieceId;
    if (did !== undefined && !validBoardId(did)) return false;
  }
  for (const t of o.terrains) {
    if (!isHex(t)) return false;
  }
  for (const v of o.etherVortexes) {
    if (!v || typeof v !== 'object') return false;
    const bid = (v as { boardInstanceId?: unknown }).boardInstanceId;
    if (bid !== undefined && !validBoardId(bid)) return false;
  }
  const gds = (o as { godDeckSlots?: unknown }).godDeckSlots;
  if (gds !== undefined) {
    if (!gds || typeof gds !== 'object') return false;
    const z = gds as Record<string, unknown>;
    if (!validSerializedGodSlotV1(z['0']) || !validSerializedGodSlotV1(z['1'])) return false;
  }
  const sh = (o as { sharedDice?: unknown }).sharedDice;
  if (sh !== undefined && parseSharedDiceState(sh) === undefined) return false;
  const inv = (o as { inventoryTablePieces?: unknown }).inventoryTablePieces;
  if (inv !== undefined) {
    if (!Array.isArray(inv)) return false;
    for (const p of inv) {
      if (!p || typeof p !== 'object') return false;
      const q = p as Record<string, unknown>;
      if (typeof q.rosterLeaderId !== 'string' || typeof q.itemId !== 'string') return false;
      if (!q.world || typeof q.world !== 'object') return false;
      const w = q.world as { x?: unknown; y?: unknown };
      if (typeof w.x !== 'number' || typeof w.y !== 'number') return false;
      if (!validOptionalArmyOwnerSlot(q.armyOwnerPlayerSlot)) return false;
    }
  }
  const cw = (o as { crystalWallets?: unknown }).crystalWallets;
  if (cw !== undefined) {
    if (!cw || typeof cw !== 'object') return false;
    const z = cw as Record<string, unknown>;
    if (!validCrystalWalletSlotRecord(z['0']) || !validCrystalWalletSlotRecord(z['1'])) return false;
  }
  const ttn = (o as { tableTurnNumber?: unknown }).tableTurnNumber;
  if (ttn !== undefined) {
    if (typeof ttn !== 'number' || !Number.isInteger(ttn) || ttn < 1 || ttn > 6) return false;
  }
  const dbz = (o as { deadByZone?: unknown }).deadByZone;
  if (dbz !== undefined && !validDeadByZoneV1(dbz)) return false;
  return true;
}
