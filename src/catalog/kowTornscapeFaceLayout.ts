/**
 * Нормализованная сетка **полного лица** Tornscape / KoW (доли 0–1 от W×H лица до склейки).
 * Для OCR по `image.jpg` (Великий Терновник) зоны переводятся в доли скролла через `faceNormRectToScrollNormRect`.
 * Калибровка Arc II: щит + ОЗ; ШАГ/БЕГ; атака (дальность, урон, R/B/G).
 */
export const TORNSCAPE_FACE_REGIONS = {
  /** Колонна щита: два куба (белый сверху, зелёный снизу) */
  defenseBlock: { x: 0.28, y: 0.488, w: 0.22, h: 0.128 },
  /** Рубин ОЗ справа от щита */
  healthBlock: { x: 0.48, y: 0.49, w: 0.2, h: 0.108 },
  /** Левый гекс ШАГ */
  walkBlock: { x: 0.06, y: 0.588, w: 0.42, h: 0.098 },
  /** Правый гекс БЕГ */
  runBlock: { x: 0.52, y: 0.588, w: 0.42, h: 0.098 },
  /** Полоса первой атаки: баннер + иконки (fallback-текст) */
  firstAttackBlock: { x: 0.02, y: 0.658, w: 0.96, h: 0.155 },
  /** Только баннер с названием атаки (над рядом цифр) */
  firstAttackNameBand: { x: 0.04, y: 0.658, w: 0.92, h: 0.058 },
} as const;

/**
 * Пять кропов по ряду атаки (слева направо): дальность, урон, красный / чёрный / зелёный кубы.
 * Нормализация — по полному лицу, как у TORNSCAPE_FACE_REGIONS.
 */
export const TORNSCAPE_ATTACK_DIGIT_REGIONS = {
  range: { x: 0.025, y: 0.728, w: 0.14, h: 0.082 },
  damage: { x: 0.155, y: 0.728, w: 0.14, h: 0.082 },
  red: { x: 0.305, y: 0.728, w: 0.185, h: 0.082 },
  black: { x: 0.495, y: 0.728, w: 0.185, h: 0.082 },
  green: { x: 0.685, y: 0.728, w: 0.185, h: 0.082 },
} as const;

export type NormRect = { x: number; y: number; w: number; h: number };

/**
 * Прямоугольник в долях полного **лица** → доли полной склейки `image.jpg` (лицо сверху + оборот снизу).
 * Верх скролла — это верх исходного лица без нижних `faceBottomCropPx` (как в compositeScroll).
 */
export function faceNormRectToScrollNormRect(
  rect: NormRect,
  faceFullH: number,
  totalH: number,
): NormRect {
  if (faceFullH <= 0 || totalH <= 0) return rect;
  return {
    x: rect.x,
    w: rect.w,
    y: (rect.y * faceFullH) / totalH,
    h: (rect.h * faceFullH) / totalH,
  };
}

/** Подряд все цифры 0–9 из строки (для двух кубиков защиты «2» и «1») */
export function extractSingleDigitSequence(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.replace(/\s/g, '')) {
    if (ch >= '0' && ch <= '9') out.push(parseInt(ch, 10));
  }
  return out;
}

/** Первое целое 1–99 (ОЗ, шаг, бег) */
export function parseFirstSmallInt(s: string, max = 30): number | undefined {
  const m = s.match(/\d+/);
  if (!m) return undefined;
  const v = parseInt(m[0], 10);
  if (!Number.isFinite(v) || v < 0 || v > max) return undefined;
  return v;
}

/**
 * Из кропа защиты: первые две одноциферные подряд — белый, зелёный.
 * Если пришло «21» одним числом — не делим; ждём два токена.
 */
export function parseDefenseCropDigits(s: string): { white?: number; green?: number } {
  const seq = extractSingleDigitSequence(s);
  if (seq.length >= 2) {
    return { white: seq[0], green: seq[1] };
  }
  const m = s.match(/\b(\d)\D+(\d)\b/) ?? s.match(/(\d)\s+(\d)/);
  if (m) {
    return { white: parseInt(m[1], 10), green: parseInt(m[2], 10) };
  }
  if (seq.length === 1) {
    return { white: seq[0] };
  }
  return {};
}

/**
 * Первая атака: из кропа полосы — эвристика порядка чисел на Tornscape:
 * дальность в гексах, урон, красный, чёрный (серый), зелёный.
 */
export function parseFirstAttackCropNumbers(text: string): {
  range: number;
  damage: number;
  red: number;
  black: number;
  green: number;
  nameHint: string;
} | null {
  const t = text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n');
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const nameLine = lines.find((l) => /[а-яА-ЯЁёA-Za-z]{4,}/.test(l) && l.length < 80);
  const nameHint =
    nameLine?.replace(/^\W+/, '').split(/[\d]{1,2}\s*[\d]/)[0]?.trim().slice(0, 80) ?? 'Атака';

  const nums = (t.match(/\d+/g) ?? []).map((x) => parseInt(x, 10)).filter((n) => n >= 0 && n <= 20);
  if (nums.length < 4) return null;

  const slice = nums.length > 5 ? nums.slice(0, 5) : nums;
  // Типичный порядок на полосе Tornscape: дальность, урон, R, серый (чёрный), G
  const range = slice[0] ?? 1;
  const damage = slice[1] ?? 1;
  const red = slice[2] ?? 0;
  const black = slice[3] ?? 0;
  const green = slice[4] ?? 0;
  return { range, damage, red, black, green, nameHint: nameHint || 'Атака' };
}
