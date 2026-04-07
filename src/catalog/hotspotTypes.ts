/**
 * Hotspot regions on card images (editor + UnitCard overlay).
 */

import type { DicePool } from '../unitCard';

/** @deprecated — только для чтения старых сохранений; новые зоны используют числовые поля ниже */
export type LegacyHotspotBinding =
  | { kind: 'attack'; index: number }
  | { kind: 'defense' }
  | { kind: 'concentration' }
  | { kind: 'defenseReaction' }
  | { kind: 'exploration' }
  | { kind: 'custom'; dice: DicePool };

export interface HotspotRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Дальность (для подсветки досягаемости на поле) */
  range?: number;
  /** Урон */
  damage?: number;
  /** Кубики */
  red?: number;
  black?: number;
  green?: number;
  white?: number;
  /** @deprecated читается при отображении, при сохранении не пишется */
  binding?: LegacyHotspotBinding;
}

export interface HotspotFile {
  image: string;
  title?: string;
  referenceSize?: { w: number; h: number };
  regions: HotspotRegion[];
}
