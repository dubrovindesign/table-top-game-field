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
  /** В чем измеряется дальность зоны (гексы vs гексоны). Без поля — как у атаки на карточке (размер юнита). */
  rangeUnit?: 'hex' | 'hexon';
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

/** Геометрия зоны (доли 0–1) — только раскладка для пресетов (без дальности и кубиков). */
export type HotspotLayoutBox = { x: number; y: number; w: number; h: number };

export type HotspotLayoutPreset = {
  id: string;
  name: string;
  regions: HotspotLayoutBox[];
};

/** Встроенный пресет: одна полоса, как у «+ Зона». */
export const DEFAULT_HOTSPOT_LAYOUT_PRESET_REGIONS: HotspotLayoutBox[] = [
  { x: 0.05, y: 0.1, w: 0.9, h: 0.04 },
];

/**
 * Подставляет только x,y,w,h из пресета; поля зоны (дальность, кубики, …) сохраняются по индексу.
 * Если зон в пресете больше — новые зоны получают заглушки; если меньше — лишние зоны отбрасываются.
 */
export function applyHotspotLayoutBoxesToRegions(
  current: HotspotRegion[],
  layout: HotspotLayoutBox[],
): HotspotRegion[] {
  const out: HotspotRegion[] = [];
  for (let i = 0; i < layout.length; i++) {
    const box = layout[i]!;
    const prev = current[i];
    if (prev) {
      out.push({
        ...prev,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
      });
    } else {
      const n = out.length;
      out.push({
        id: `zone_${Date.now()}_${i}`,
        label: `Зона ${n + 1}`,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rangeUnit: 'hex',
      });
    }
  }
  return out;
}
