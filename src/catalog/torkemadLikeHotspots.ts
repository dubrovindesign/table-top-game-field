/**
 * Две полосы как у «Торкемад Прелат Чистоты» (castilla-torkemad-prelat-chistoty):
 * первая — защита (бел/зел кубы), вторая — первая атака из карточки.
 * Координаты — нормализованные доли полной склеенной карты (image.jpg).
 */

import type { HotspotRegion } from './hotspotTypes';
import type { UnitCardData } from '../unitCard';

/** Геометрия полос с эталонной карты Кастилии */
const STRIP = {
  x: 0.045,
  w: 0.91,
  h: 0.03897092084006462,
  yDefense: 0.2303869143780291,
  yAttack0: 0.2716502423263328,
} as const;

export function buildTorKemadLikeDefenseAndAttackRegions(card: UnitCardData): HotspotRegion[] {
  const dw = card.defense?.white ?? 0;
  const dg = card.defense?.green ?? 0;
  const atk = card.attacks[0];
  const dice = atk?.dice ?? {};
  return [
    {
      x: STRIP.x,
      y: STRIP.yDefense,
      w: STRIP.w,
      h: STRIP.h,
      id: 'defense_main',
      label: 'Защита',
      red: 0,
      green: dg,
      black: 0,
      white: dw,
      range: 0,
      rangeUnit: 'hex',
      damage: 0,
    },
    {
      x: STRIP.x,
      y: STRIP.yAttack0,
      w: STRIP.w,
      h: STRIP.h,
      id: 'attack_0',
      label: atk?.name?.trim() ? atk.name : 'Атака',
      red: dice.red ?? 0,
      green: dice.green ?? 0,
      black: dice.black ?? 0,
      white: dice.white ?? 0,
      range: atk?.range ?? 1,
      rangeUnit: atk?.attackRangeUnit === 'hexon' ? 'hexon' : 'hex',
      damage: atk?.damage ?? 0,
    },
  ];
}
