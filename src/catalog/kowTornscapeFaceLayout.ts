/**
 * Нормализованная сетка лица карты Tornscape / KoW (доли 0–1 от ширины/высоты лица).
 * Вертикаль: арт и имя сверху → блок защиты (слева кубы) + ОЗ (справа) → шаг слева / бег справа → атаки.
 * Подгоняется под типичный портретный лист (~соотношение как у склеенного face.jpg).
 */
export const TORNSCAPE_FACE_REGIONS = {
  /** Слева: белый и зелёный куб защиты (две цифры рядом или столбиком) */
  defenseBlock: { x: 0.05, y: 0.43, w: 0.38, h: 0.12 },
  /** Справа от защиты: одно число ОЗ */
  healthBlock: { x: 0.56, y: 0.44, w: 0.38, h: 0.1 },
  /** Ниже: ШАГ (левая колонка) */
  walkBlock: { x: 0.05, y: 0.55, w: 0.44, h: 0.1 },
  /** БЕГ (правая колонка) */
  runBlock: { x: 0.51, y: 0.55, w: 0.44, h: 0.1 },
  /** Первая полоса атаки (название + иконки + кубы) */
  firstAttackBlock: { x: 0.03, y: 0.66, w: 0.94, h: 0.12 },
} as const;

export type NormRect = { x: number; y: number; w: number; h: number };

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
