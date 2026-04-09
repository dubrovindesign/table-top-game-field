/**
 * Хотспоты для склеенной вертикальной карты Tornscape / KoW (лицо + оборот).
 * Рекомендуемая раскладка — пресет «a 2» (`buildTornscapeScrollHotspotRegionsFromA2Preset`).
 * Устаревший вариант по формуле лица×scaleY — `buildTornscapeScrollHotspotRegionsLegacy`.
 */
import type { UnitCardData } from '../unitCard';
import type { HotspotLayoutBox, HotspotRegion } from './hotspotTypes';
import { applyHotspotLayoutBoxesToRegions } from './hotspotTypes';
import { TORNSCAPE_FACE_REGIONS } from './kowTornscapeFaceLayout';
import {
  TORNSCAPE_KOW_DEFAULT_ATTACK_STRIPE_GAP,
  TORNSCAPE_KOW_HOTSPOT_PRESET_A2,
  type TornscapeKowHotspotPresetA2,
} from './tornscapeKowHotspotPresetA2';

const ATTACK_ROW = { x: 0.042, w: 0.916, h: 0.058, gap: 0.016 };
const ATTACK_Y0 = 0.528;

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function diceToRegionFields(dice: NonNullable<UnitCardData['attacks']>[0]['dice']) {
  return {
    red: dice?.red ?? 0,
    green: dice?.green ?? 0,
    black: dice?.black ?? 0,
    white: dice?.white ?? 0,
  };
}

/** Только поля зон (кубики, подписи); геометрия задаётся пресетом. */
export function buildTornscapeHotspotSemanticRegions(card: UnitCardData): HotspotRegion[] {
  const defense: HotspotRegion = {
    id: 'defense_main',
    label: 'Защита',
    x: 0,
    y: 0,
    w: 0.01,
    h: 0.01,
    range: 0,
    rangeUnit: 'hex',
    damage: 0,
    white: card.defense?.white ?? 0,
    green: card.defense?.green ?? 0,
    red: 0,
    black: 0,
  };

  const attacks: HotspotRegion[] = (card.attacks ?? []).map((atk, i) => {
    const ru = atk.attackRangeUnit === 'hexon' ? 'hexon' : 'hex';
    return {
      id: `attack_${i}`,
      label: atk.name,
      x: 0,
      y: 0,
      w: 0.01,
      h: 0.01,
      range: atk.range,
      rangeUnit: ru,
      damage: atk.damage,
      ...diceToRegionFields(atk.dice),
    };
  });

  return [defense, ...attacks];
}

/**
 * Раскладка из редактора (массив прямоугольников) + семантика карточки.
 * - Если число прямоугольников = числу зон — по порядку: защита, атака 0, …
 * - Если ровно **2** прямоугольника — первый = защита, второй = полоса атаки (повторяется вниз с зазором).
 */
export function applyHotspotLayoutPresetBoxesToSemanticRegions(
  semantic: HotspotRegion[],
  layout: HotspotLayoutBox[],
  opts?: { attackStripeGap?: number },
): HotspotRegion[] {
  const gap = opts?.attackStripeGap ?? TORNSCAPE_KOW_DEFAULT_ATTACK_STRIPE_GAP;

  if (layout.length === semantic.length) {
    return applyHotspotLayoutBoxesToRegions(semantic, layout) as HotspotRegion[];
  }

  if (layout.length === 2 && semantic.length >= 1) {
    const [defBox, atkBox] = layout;
    if (semantic.length === 1) {
      return [
        {
          ...semantic[0]!,
          x: defBox.x,
          y: defBox.y,
          w: defBox.w,
          h: defBox.h,
        },
      ];
    }
    const out: HotspotRegion[] = [];
    out.push({
      ...semantic[0]!,
      x: defBox.x,
      y: defBox.y,
      w: defBox.w,
      h: defBox.h,
    });
    for (let i = 1; i < semantic.length; i++) {
      const atkIndex = i - 1;
      const y = atkBox.y + atkIndex * (atkBox.h + gap);
      out.push({
        ...semantic[i]!,
        x: atkBox.x,
        y: round4(y),
        w: atkBox.w,
        h: atkBox.h,
      });
    }
    return out;
  }

  throw new Error(
    `В пресете ${layout.length} зон, на карточке ${semantic.length} зон (защита + атаки). Нужно совпадение или пресет из двух зон.`,
  );
}

/**
 * Пресет «a 2»: зоны на склеенной карте в долях 0–1 (как в редакторе каталога).
 * По умолчанию — шаблон «защита + полоса атаки» с шагом для 2-й, 3-й атаки.
 */
export function buildTornscapeScrollHotspotRegionsFromA2Preset(
  card: UnitCardData,
  preset: TornscapeKowHotspotPresetA2 = TORNSCAPE_KOW_HOTSPOT_PRESET_A2,
): HotspotRegion[] {
  const semantic = buildTornscapeHotspotSemanticRegions(card);
  if (preset.kind === 'full') {
    if (preset.regions.length !== semantic.length) {
      throw new Error(
        `[tornscape preset] full: в пресете ${preset.regions.length} прямоугольников, в карточке ${semantic.length} зон (защита + атаки)`,
      );
    }
    return applyHotspotLayoutBoxesToRegions(semantic, preset.regions) as HotspotRegion[];
  }

  const { defense, attackStripe, attackStripeGap } = preset;
  if (semantic.length < 2) {
    throw new Error('[tornscape preset] нужна хотя бы одна атака на карточке');
  }

  return applyHotspotLayoutPresetBoxesToSemanticRegions(semantic, [defense, attackStripe], {
    attackStripeGap: attackStripeGap,
  });
}

/**
 * @deprecated Использовать пресет a2. Формула по лицу×scaleY часто расходится с реальным артом.
 * @param scaleY — faceFullH / totalH
 */
export function buildTornscapeScrollHotspotRegionsLegacy(card: UnitCardData, scaleY: number): HotspotRegion[] {
  const db = TORNSCAPE_FACE_REGIONS.defenseBlock;
  const defense: HotspotRegion = {
    id: 'defense_main',
    label: 'Защита',
    x: db.x,
    y: round4(db.y * scaleY),
    w: db.w,
    h: round4(db.h * scaleY),
    range: 0,
    rangeUnit: 'hex',
    damage: 0,
    white: card.defense?.white ?? 0,
    green: card.defense?.green ?? 0,
    red: 0,
    black: 0,
  };

  const attacks: HotspotRegion[] = (card.attacks ?? []).map((atk, i) => {
    const ru = atk.attackRangeUnit === 'hexon' ? 'hexon' : 'hex';
    const y = ATTACK_Y0 + i * (ATTACK_ROW.h + ATTACK_ROW.gap);
    return {
      id: `attack_${i}`,
      label: atk.name,
      x: ATTACK_ROW.x,
      y: round4(y * scaleY),
      w: ATTACK_ROW.w,
      h: round4(ATTACK_ROW.h * scaleY),
      range: atk.range,
      rangeUnit: ru,
      damage: atk.damage,
      ...diceToRegionFields(atk.dice),
    };
  });

  return [defense, ...attacks];
}

/** @deprecated алиас; см. `buildTornscapeScrollHotspotRegionsLegacy` */
export function buildTornscapeScrollHotspotRegions(card: UnitCardData, scaleY: number): HotspotRegion[] {
  return buildTornscapeScrollHotspotRegionsLegacy(card, scaleY);
}
