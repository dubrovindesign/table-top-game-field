/**
 * Per-player god card piles (deck / hand / blind / discard) for tabletop play.
 */

import { GOD_CARDS } from './godCards.ts';
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
  return VALID_IDS.has(id);
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
