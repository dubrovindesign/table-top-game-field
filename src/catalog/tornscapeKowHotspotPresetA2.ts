/**
 * Пресет раскладки хотспотов «a 2» для склеенной вертикальной карты Tornscape / KoW
 * (доли 0–1 по **полному** image.jpg после склейки лицо+оборот).
 *
 * Чтобы совпало с пресетом, сохранённым в редакторе каталога:
 * в консоли на странице приложения:
 *   JSON.parse(localStorage.getItem('hexBoard_catalogOverrides_v1')||'{}').hotspotLayoutPresets
 *   ?.find(p => p.name === 'a 2')
 * Скопируйте `regions` (или defense + первую полосу атаки) в `TORNSCAPE_KOW_HOTSPOT_PRESET_A2` ниже.
 *
 * Режимы:
 * - `template`: защита + одна полоса атаки; 2-я и далее — копии с шагом `attackStripeGap`.
 * - `full`: явный массив — по одному прямоугольнику на защиту и каждую атаку (длина = 1 + число атак).
 */
import type { HotspotLayoutBox } from './hotspotTypes';

export type TornscapeKowHotspotPresetA2 =
  | {
      kind: 'template';
      defense: HotspotLayoutBox;
      attackStripe: HotspotLayoutBox;
      /** Вертикальный зазор между полосами атак (доли высоты карты). */
      attackStripeGap: number;
    }
  | {
      kind: 'full';
      regions: HotspotLayoutBox[];
    };

/**
 * Текущая раскладка: шаблон из двух зон (как у стандартных двухатакующих карт).
 * Сместите y/h, если арт сдвинут относительно эталона SoE.
 */
export const TORNSCAPE_KOW_HOTSPOT_PRESET_A2: TornscapeKowHotspotPresetA2 = {
  kind: 'template',
  defense: { x: 0.052, y: 0.298, w: 0.896, h: 0.056 },
  attackStripe: { x: 0.038, y: 0.366, w: 0.924, h: 0.044 },
  attackStripeGap: 0.046,
};

/** Зазор между полосами атак, если в сохранённом пресете только два прямоугольника (защита + образец атаки). */
export const TORNSCAPE_KOW_DEFAULT_ATTACK_STRIPE_GAP = 0.046;
