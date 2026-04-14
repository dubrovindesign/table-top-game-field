/**
 * Army catalog types (shared by JSON-backed data and `armyCatalog` helpers).
 */

import type { Domain, UnitCardData } from '../unitCard';

export type FactionDef = {
  id: string;
  name: string;
  domain: Domain;
  /** Faction emblem in the army panel filter row (`public/` path). */
  panelIconSrc: string;
};

export type RosterSlotDef = {
  unitId: string;
  maxCopies: number;
  /**
   * Points for this unit toward the army cap when taken under this leader's roster slot.
   * If omitted, `CATALOG_UNITS[unitId].points` is used.
   */
  points?: number;
  /**
   * If set, this roster slot is available only while at least one model of `requiresUnitId`
   * is already in the army for the same leader (spawned from the army panel).
   */
  requiresUnitId?: string;
};

export type LeaderDef = {
  id: string;
  name: string;
  factionId: string;
  /** Placeable leader miniature in `CATALOG_UNITS` (same stats row as troops in the panel). */
  catalogUnitId: string;
  /**
   * Points charged for the leader miniature toward the army cap.
   * If omitted, `CATALOG_UNITS[catalogUnitId].points` is used.
   */
  points?: number;
  roster: RosterSlotDef[];
};

export type CatalogUnitDef = {
  id: string;
  points: number;
  /**
   * Наёмник: учёт в «фракции» наёмников в панели армии и редакторе.
   * Доступность и лимиты по-прежнему задаются слотами ростера у лидеров.
   */
  mercenary?: boolean;
  /**
   * Другой юнит, чья миниатюра должна быть в армии до этого (как `requiresUnitId` у слота ростера).
   * Можно переопределить на уровне слота у лидера; если в слоте `requiresUnitId` нет — используется это поле.
   * @deprecated Используй `requiresCommanderUnitIds` — поддерживается для обратной совместимости.
   */
  requiresCommanderUnitId?: string;
  /**
   * Список альтернативных командиров: юнит доступен, если в армии присутствует ХОТЯ БЫ ОДИН из них (OR-семантика).
   * Если массив пустой/отсутствует, используется legacy-поле `requiresCommanderUnitId` (если есть).
   */
  requiresCommanderUnitIds?: string[];
  card: UnitCardData;
};

/** Gear / items taken to the table; points count toward the army cap. */
export type InventoryItemDef = {
  id: string;
  name: string;
  points: number;
  /** Path under site root (`public/`), e.g. `/inventory/foo.png`. */
  sprite: string;
  /**
   * If non-empty, only these leaders may take the item; if absent or empty, all leaders.
   */
  onlyForLeaderIds?: string[];
  /** Max copies per leader in army loadout (default applied in merge helpers). */
  maxCopies?: number;
};
