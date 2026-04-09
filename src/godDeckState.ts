/**
 * Per-player god card piles (deck / hand / blind / discard) for tabletop play.
 */

import type { GodTablePiece } from './godCards.ts';
import { GOD_CARDS, godCardBaseId } from './godCards.ts';
import type { PlayerSlot } from './multiplayer/protocol.ts';

export type GodSlotPile = {
  deckIds: string[];
  handIds: string[];
  discardIds: string[];
  /** Порядок слева направо; для себя — лица, для чужого слота на клиенте пусто при скрытии. */
  blindCardIds: string[];
  /**
   * Чужой слот: сколько карт в слепой зоне без раскрытия id (только рубашки в UI).
   */
  remoteBlindCount: number;
  /** Чужой слот: сколько карт в руке (если handIds пусты). Свой слот: игнор. */
  remoteHandCount: number;
  remoteDeckCount: number;
};

export const EMPTY_GOD_PILE: GodSlotPile = {
  deckIds: [],
  handIds: [],
  discardIds: [],
  blindCardIds: [],
  remoteBlindCount: 0,
  remoteHandCount: 0,
  remoteDeckCount: 0,
};

const VALID_IDS = new Set(GOD_CARDS.map((c) => c.id));

export function isValidGodCardId(id: string): boolean {
  return VALID_IDS.has(godCardBaseId(id));
}

export function shuffleIds(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function clonePile(p: GodSlotPile): GodSlotPile {
  return {
    deckIds: [...p.deckIds],
    handIds: [...p.handIds],
    discardIds: [...p.discardIds],
    blindCardIds: [...p.blindCardIds],
    remoteBlindCount: p.remoteBlindCount,
    remoteHandCount: p.remoteHandCount,
    remoteDeckCount: p.remoteDeckCount,
  };
}

export function createInitialGodPiles(): [GodSlotPile, GodSlotPile] {
  return [clonePile(EMPTY_GOD_PILE), clonePile(EMPTY_GOD_PILE)];
}

/** Id всех карт богов, которые уже «вышли» из каталога армии (стол + оба слота колод/руки/сброса/слепой). */
export function godCardIdsInPlay(
  pieces: readonly GodTablePiece[],
  piles: readonly [GodSlotPile, GodSlotPile],
): Set<string> {
  const s = new Set<string>();
  for (const p of pieces) {
    if (p.kind === 'single') s.add(p.id);
    else for (const id of p.ids) s.add(id);
  }
  for (const pile of piles) {
    for (const id of pile.deckIds) s.add(id);
    for (const id of pile.handIds) s.add(id);
    for (const id of pile.discardIds) s.add(id);
    for (const id of pile.blindCardIds) s.add(id);
  }
  return s;
}

/**
 * Панель армии читает id «занятых» карт через регистратор.
 * Храним ссылку на `globalThis`: при разбиении бандла Vite может продублировать этот модуль,
 * и тогда модульный `let` в одной копии не совпадает с регистрацией из `main`.
 */
const ARMY_ROSTER_GOD_IN_PLAY_KEY = '__hexArmyRosterGodCardIdsInPlay';

export function registerArmyRosterGodCardIdsInPlay(fn: () => Set<string>): void {
  (globalThis as unknown as Record<string, () => Set<string>>)[ARMY_ROSTER_GOD_IN_PLAY_KEY] = fn;
}

export function getArmyRosterGodCardIdsInPlay(): Set<string> {
  const fn = (globalThis as unknown as Record<string, unknown>)[ARMY_ROSTER_GOD_IN_PLAY_KEY] as
    | (() => Set<string>)
    | undefined;
  return fn ? fn() : new Set();
}

const ARMY_ROSTER_INVENTORY_IN_PLAY_KEY = '__hexArmyRosterInventoryItemIdsInPlay';

export function registerArmyRosterInventoryItemIdsInPlay(fn: () => Set<string>): void {
  (globalThis as unknown as Record<string, () => Set<string>>)[ARMY_ROSTER_INVENTORY_IN_PLAY_KEY] = fn;
}

/** Id предметов инвентаря, уже на столе (панель армии скрывает их из списка, как карты богов). */
export function getArmyRosterInventoryItemIdsInPlay(): Set<string> {
  const fn = (globalThis as unknown as Record<string, unknown>)[ARMY_ROSTER_INVENTORY_IN_PLAY_KEY] as
    | (() => Set<string>)
    | undefined;
  return fn ? fn() : new Set();
}

/** Draw one card from top of deck (end of array) into hand. */
export function drawOneToHand(pile: GodSlotPile): boolean {
  if (pile.deckIds.length === 0 || pile.handIds.length >= 3) return false;
  const id = pile.deckIds.pop();
  if (!id) return false;
  pile.handIds.push(id);
  return true;
}

/** Максимум карт в слепой зоне (не размер колоды). Совпадает с потолком `deckCount` в boardState. */
export const GOD_BLIND_ZONE_MAX_CARDS = 32;

export const GOD_HAND_START_SIZE = 3;

export const GOD_SLOTS: readonly PlayerSlot[] = [0, 1];
