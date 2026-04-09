/**
 * Разбор текста Tesseract по типичным подписям карт KoW / Tornscape (рус/англ).
 * Не гарантирует 100% попадание — пользователь правит поля вручную.
 */

import type { AttackAbility, DicePool } from '../unitCard';
import { parseFirstAttackCropNumbers } from './kowTornscapeFaceLayout';

export type ParsedKowCardStats = {
  health?: number;
  maxHealth?: number;
  walk?: number;
  run?: number;
  defenseWhite?: number;
  defenseGreen?: number;
};

export type ParsedFirstAttack = {
  name: string;
  range: number;
  damage: number;
  dice: DicePool;
  melee: boolean;
};

function intOrU(n: string | undefined): number | undefined {
  if (n == null || n === '') return undefined;
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : undefined;
}

/**
 * Из полного текста OCR пытаемся вытащить ОЗ, шаг/бег, защиту (бел/зел).
 */
export function parseStatsFromOcrText(text: string): ParsedKowCardStats {
  const t = text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n');
  const out: ParsedKowCardStats = {};

  // ОЗ / HP
  const oz =
    t.match(/(?:ОЗ|О3|О[З3]|OZ|HP)[^\d\n]{0,8}(\d{1,2})\b/i) ||
    t.match(/\b(\d{1,2})\s*(?:ОЗ|OZ|HP)\b/i);
  if (oz) {
    const h = intOrU(oz[1]);
    if (h != null && h > 0 && h <= 99) {
      out.health = h;
      out.maxHealth = h;
    }
  }

  // Шаг / Бег отдельно (Tornscape: крупные «ШАГ» / «БЕГ» на карте)
  const wM =
    t.match(/[Шш]\s*а\s*г[^\d]{0,12}(\d)/i) ||
    t.match(/ША\s*Г[^\d]{0,12}(\d)/i) ||
    t.match(/[Шш]аг[^\d]{0,8}(\d)/);
  const rM =
    t.match(/[Бб]\s*е\s*г[^\d]{0,12}(\d)/i) ||
    t.match(/БЕ\s*Г[^\d]{0,12}(\d)/i) ||
    t.match(/[Бб]ег[^\d]{0,8}(\d)/);
  if (wM) out.walk = intOrU(wM[1]);
  if (rM) out.run = intOrU(rM[1]);

  // 1/2 как шаг/бег (часто в одной строке)
  if (out.walk == null || out.run == null) {
    const slash = t.match(/(\d)\s*\/\s*(\d)/);
    if (slash) {
      const a = intOrU(slash[1]);
      const b = intOrU(slash[2]);
      if (a != null && b != null && a <= 9 && b <= 9) {
        if (out.walk == null) out.walk = a;
        if (out.run == null) out.run = b;
      }
    }
  }

  // Защита: пары бел/зел или два числа рядом с «щит» / W G
  const defLine = t.split(/\n/).find((ln) => /защит|щит|defense|W\s*G/i.test(ln));
  if (defLine) {
    const nums = defLine.match(/\b(\d)\b/g);
    if (nums && nums.length >= 2) {
      out.defenseWhite = intOrU(nums[0]);
      out.defenseGreen = intOrU(nums[1]);
    }
  }
  if (out.defenseWhite == null) {
    const wm = t.match(/(?:бел|white|W)[^\d]{0,4}(\d)/i);
    if (wm) out.defenseWhite = intOrU(wm[1]);
  }
  if (out.defenseGreen == null) {
    const gm = t.match(/(?:зел|green|G)[^\d]{0,4}(\d)/i);
    if (gm) out.defenseGreen = intOrU(gm[1]);
  }

  return out;
}

/** Грубый разбор первой атаки: ищем строку с «урон» / damage и кубы R G B W */
export function parseFirstAttackFromOcrText(text: string): ParsedFirstAttack | null {
  const t = text.replace(/\u00a0/g, ' ');
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let name = 'Атака';
  const nameLine = lines.find((l) => l.length > 3 && !/^\d+$/.test(l) && /[а-яА-Яa-zA-Z]/.test(l));
  if (nameLine && nameLine.length < 80) name = nameLine.slice(0, 120);

  let damage = 1;
  const dmgM = t.match(/(?:урон|damage|DMG)[^\d]{0,6}(\d)/i) || t.match(/\b(?:У|u)[^\d]{0,4}(\d)\b/i);
  if (dmgM) damage = intOrU(dmgM[1]) ?? 1;

  let range = 1;
  const rngM = t.match(/(?:дальн|range|R)[^\d]{0,6}(\d)/i);
  if (rngM) range = intOrU(rngM[1]) ?? 1;

  const dice: DicePool = {};
  const rm = t.match(/(?:R|Кр|крас)[^\d]{0,4}(\d)/i);
  const gm = t.match(/(?:G|Зел|зел)[^\d]{0,4}(\d)/i);
  const bm = t.match(/(?:B|Черн|черн)[^\d]{0,4}(\d)/i);
  const wm = t.match(/(?:W|Бел|бел)[^\d]{0,4}(\d)/i);
  if (rm) dice.red = intOrU(rm[1]);
  if (gm) dice.green = intOrU(gm[1]);
  if (bm) dice.black = intOrU(bm[1]);
  if (wm) dice.white = intOrU(wm[1]);

  const melee = /ближ|melee/i.test(t) || range <= 1;

  return {
    name,
    range,
    damage,
    dice,
    melee,
  };
}

export function parsedAttackToAbility(p: ParsedFirstAttack): AttackAbility {
  return {
    name: p.name,
    range: p.range,
    attackRange: p.melee ? 'melee' : 'ranged',
    damageType: 'physical',
    damage: p.damage,
    dice: p.dice,
  };
}

/** Разбор первой атаки из кропа полосы (см. kowTornscapeFaceLayout). */
export function parsedFirstAttackFromAttackCrop(text: string): ParsedFirstAttack | null {
  const p = parseFirstAttackCropNumbers(text);
  if (!p) return null;
  return {
    name: p.nameHint.trim() || 'Атака',
    range: p.range,
    damage: p.damage,
    dice: { red: p.red, black: p.black, green: p.green },
    melee: p.range <= 1,
  };
}

/** Сборка первой атаки из отдельных OCR-кропов дальность / урон / R / B / G. */
export function parsedFirstAttackFromDigitFields(opts: {
  nameHint: string;
  range?: number;
  damage?: number;
  red?: number;
  black?: number;
  green?: number;
}): ParsedFirstAttack | null {
  const {
    nameHint,
    range: rng,
    damage: dmg,
    red: r,
    black: b,
    green: g,
  } = opts;
  if (rng == null || dmg == null) return null;
  const name = nameHint.trim().slice(0, 100) || 'Атака';
  return {
    name,
    range: rng,
    damage: dmg,
    dice: { red: r ?? 0, black: b ?? 0, green: g ?? 0 },
    melee: rng <= 1,
  };
}

/** Значения из кропов перекрывают fallback (в т.ч. 0 для кубов). */
export function mergeKowStatsPreferCrops(
  crops: ParsedKowCardStats,
  fallback: ParsedKowCardStats,
): ParsedKowCardStats {
  const out: ParsedKowCardStats = { ...fallback };

  const hp = crops.health;
  if (hp !== undefined) {
    const fh = fallback.health;
    // Кроп ОЗ часто ловит шум «1»; если из полного текста уже есть ОЗ > 1 — не затирать.
    if (hp === 1 && fh != null && fh > 1) {
      out.health = fh;
      out.maxHealth = fallback.maxHealth ?? fh;
    } else {
      out.health = hp;
      out.maxHealth = crops.maxHealth ?? hp;
    }
  }

  (Object.keys(crops) as (keyof ParsedKowCardStats)[]).forEach((k) => {
    if (k === 'health' || k === 'maxHealth') return;
    const v = crops[k];
    if (v !== undefined) out[k] = v;
  });
  return out;
}
