#!/usr/bin/env node
/**
 * JSON юнитов + хотспоты для импорта engeln-tornscape (арт — через tornscape:batch / ручная склейка).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dicePool } from './engeln-units-data.mjs';
import {
  ENGELN_TORNSCAPE_PAIRS,
  ENGELN_TORNSCAPE_SINGLE,
} from './engeln-tornscape-pairs-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const FAITH = { red: 1 };
function z() {
  return { black: 0, green: 0, red: 0, white: 0 };
}

const ATTACK_ROW = { x: 0.042, w: 0.916, h: 0.058, gap: 0.016 };
const ATTACK_Y0 = 0.528;

function diceToRegionFields(dice) {
  return {
    red: dice.red ?? 0,
    green: dice.green ?? 0,
    black: dice.black ?? 0,
    white: dice.white ?? 0,
  };
}

function hotspotRegionsFromAttacks(attacks, scaleY) {
  return attacks.map((atk, i) => {
    const ru = atk.attackRangeUnit ?? 'hex';
    const y = ATTACK_Y0 + i * (ATTACK_ROW.h + ATTACK_ROW.gap);
    return {
      id: `attack_${i}`,
      label: atk.name,
      x: ATTACK_ROW.x,
      y: Math.round(y * scaleY * 10000) / 10000,
      w: ATTACK_ROW.w,
      h: Math.round(ATTACK_ROW.h * scaleY * 10000) / 10000,
      range: atk.range,
      rangeUnit: ru,
      damage: atk.damage,
      ...diceToRegionFields(atk.dice),
    };
  });
}

/** Статистика с карточек Tornscape (сокращённые пулы кубов). */
const UNIT_DEFS = {
  'engeln-braylon-osveshchayuschiy-put': {
    points: 30,
    name: 'Брэйлон, Освещающий Путь',
    size: 'small',
    health: 6,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар мечом',
        range: 1,
        attackRange: 'melee',
        damageType: 'electric',
        damage: 3,
        dice: dicePool('2/2/2'),
        modifiers: [{ kind: 'text', label: 'Молния' }],
      },
      {
        name: 'Разряд молнии',
        range: 2,
        attackRange: 'ranged',
        damageType: 'electric',
        damage: 2,
        dice: dicePool('3/0/0'),
        modifiers: [{ kind: 'text', label: 'Цепь' }],
      },
    ],
    traits: [
      { name: 'Изгнать зло', description: 'См. карточку: фокус и метка врага.' },
      { name: 'Генератор Молний', description: '' },
      { name: 'Ветеран', description: '' },
    ],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Воин', 'Персонаж', 'Клирик', 'Меч'],
  },
  'engeln-ekzo-rytsar-shchit-mech': {
    points: 24,
    name: 'Экзо-рыцарь Ангельна с щитом и мечом',
    size: 'small',
    health: 5,
    defense: { white: 3, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар мечом',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: dicePool('2/1/1'),
        modifiers: [{ kind: 'text', label: 'Парирование' }],
      },
      {
        name: 'Удар щитом',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: dicePool('2/1/0'),
        modifiers: [
          { kind: 'text', label: 'Толчок 1' },
          { kind: 'text', label: 'Быстрая атака' },
        ],
      },
    ],
    traits: [
      { name: 'Стена щитов', description: 'См. карточку.' },
      { name: 'Генератор Молний', description: '' },
      { name: 'Ветеран', description: '' },
    ],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Воин', 'Меч', 'Щит'],
  },
  'engeln-ekzo-rytsar-mechami': {
    points: 25,
    name: 'Экзо-рыцарь Ангельна с мечами',
    size: 'small',
    health: 5,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар мечом',
        range: 1,
        attackRange: 'melee',
        damageType: 'electric',
        damage: 2,
        dice: dicePool('3/1/1'),
        modifiers: [
          { kind: 'text', label: 'Парирование' },
          { kind: 'text', label: 'Мультиатака: 2' },
        ],
      },
    ],
    traits: [{ name: 'Генератор Молний', description: '' }, { name: 'Ветеран', description: '' }],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Воин', 'Меч'],
  },
  'engeln-ekzo-rytsar-dvuruchnyy-mech': {
    points: 24,
    name: 'Экзо-рыцарь Ангельна с двуручным мечом',
    size: 'small',
    health: 5,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар мечом',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 3,
        dice: dicePool('2/1/1'),
      },
      {
        name: 'Круговая атака',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 3,
        dice: dicePool('2/0/0'),
        areaAttack: true,
      },
    ],
    traits: [{ name: 'Генератор Молний', description: '' }, { name: 'Ветеран', description: '' }],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Воин', 'Меч'],
  },
  'engeln-ekzo-rytsar-kopiom': {
    points: 24,
    name: 'Экзо-рыцарь Ангельна с копьём',
    size: 'small',
    health: 5,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар копьём',
        range: 2,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 3,
        dice: dicePool('2/2/2/1'),
      },
      {
        name: 'Удар молнией',
        range: 2,
        attackRange: 'ranged',
        damageType: 'electric',
        damage: 2,
        dice: dicePool('2/1/0'),
      },
    ],
    traits: [{ name: 'Стена копий', description: 'См. карточку.' }, { name: 'Генератор Молний', description: '' }, { name: 'Ветеран', description: '' }],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Воин', 'Древковое'],
  },
  'engeln-provodnik-molniy-bashni-vozduha': {
    points: 28,
    name: 'Проводник Молний Башни Воздуха',
    size: 'small',
    health: 5,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Вызов молнии',
        range: 4,
        attackRange: 'ranged',
        damageType: 'electric',
        damage: 3,
        dice: dicePool('2/1/1'),
        modifiers: [{ kind: 'text', label: 'Цепь · большая' }],
      },
      {
        name: 'Крылья ветра',
        range: 3,
        attackRange: 'ranged',
        damageType: 'physical',
        damage: 0,
        dice: z(),
        modifiers: [{ kind: 'text', label: 'Снять дым/яд' }],
      },
    ],
    traits: [{ name: 'Генератор Молний', description: '' }, { name: 'Ветеран', description: '' }],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Ученый', 'Проводник эфира', 'Посох'],
  },
  'engeln-kondensator-molniy': {
    points: 3,
    name: 'Конденсатор Молний',
    size: 'small',
    health: 3,
    defense: { white: 2, green: 0 },
    walk: 0,
    run: 0,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Заряженное оружие',
        range: 2,
        attackRange: 'ranged',
        damageType: 'electric',
        damage: 2,
        dice: dicePool('2/0/0'),
        modifiers: [{ kind: 'text', label: 'Цепь · малая' }],
      },
    ],
    traits: [
      { name: 'Походное снаряжение', description: 'Предмет; не активируется как отряд.' },
      { name: 'Генератор Молний', description: '' },
    ],
    keywords: ['Ангельн', 'Предмет', 'Машина'],
  },
  'engeln-osadnyy-golem-angelyna': {
    points: 100,
    name: 'Осадный Голем Ангельна',
    size: 'huge',
    health: 40,
    defense: { white: 3, green: 0 },
    walk: 1,
    run: 1,
    faithMarkers: FAITH,
    concentration: z(),
    movementDistanceUnit: 'hexon',
    attacks: [
      {
        name: 'Удар кулаком',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 10,
        dice: dicePool('2/0/0'),
        modifiers: [{ kind: 'text', label: 'Бронебойный 2' }],
      },
      {
        name: 'Сломать преграду',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 3,
        dice: dicePool('3/0/0'),
      },
    ],
    traits: [
      { name: 'Высокая платформа', description: '' },
      { name: 'Исполин', description: '' },
      { name: 'Неповоротливый', description: '' },
    ],
    keywords: ['Ангельн', 'Голем', 'Машина'],
  },
  'engeln-malyy-golem-torgvara': {
    points: 6,
    name: 'Малый Голем Торгвара',
    size: 'small',
    health: 4,
    defense: { white: 2, green: 0 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Удар кулаком',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: dicePool('1/1/0'),
      },
    ],
    traits: [{ name: 'Связь с осадным големом', description: 'См. карточку.' }],
    keywords: ['Ангельн', 'Голем'],
  },
  'engeln-ekzo-rytsar-tyazhelyy-grozomet': {
    points: 50,
    name: 'Экзо-рыцарь с тяжёлым грозомётом',
    size: 'small',
    health: 5,
    defense: { white: 2, green: 1 },
    walk: 3,
    run: 5,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Залп молний',
        range: 4,
        attackRange: 'ranged',
        damageType: 'electric',
        damage: 2,
        dice: dicePool('3/1/1'),
        areaAttack: true,
        modifiers: [{ kind: 'text', label: 'По площади' }],
      },
      {
        name: 'Удар прикладом',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: dicePool('1/1/1'),
      },
    ],
    traits: [{ name: 'Генератор Молний', description: '' }, { name: 'Ветеран', description: '' }],
    keywords: ['Ангельн', 'Живой', 'Человек', 'Стрелок', 'Грозомёт'],
  },
  'engeln-devring-olverton': {
    points: 23,
    name: 'Девринг Олвертон',
    size: 'small',
    health: 6,
    defense: { white: 1, green: 1 },
    walk: 3,
    run: 6,
    faithMarkers: FAITH,
    concentration: z(),
    attacks: [
      {
        name: 'Атака',
        range: 1,
        attackRange: 'melee',
        damageType: 'fire',
        damage: 2,
        dice: dicePool('2/2/1'),
        modifiers: [{ kind: 'text', label: 'Огнемёт' }],
      },
    ],
    traits: [
      { name: 'Охотник за головами', description: '' },
      { name: 'Заклятый враг: не человек', description: '' },
      { name: 'Генератор Молний', description: '' },
    ],
    keywords: ['Ангельн', 'Кастилия', 'Персонаж', 'Воин', 'Огнемёт', 'Секира'],
  },
};

function unitToJson(id, def) {
  const card = {
    attacks: def.attacks,
    catalogUnitId: id,
    concentration: def.concentration,
    defense: def.defense,
    defenseReaction: { green: 0, white: 1 },
    domains: ['creation'],
    exploration: def.exploration ?? { black: 0, green: 0, red: 0, white: 0 },
    explorationRange: def.explorationRange ?? 0,
    grabRange: 1,
    health: def.health,
    keywords: def.keywords,
    maxHealth: def.health,
    miniatureSprite: `/catalog-units/${id}/miniature.jpg`,
    name: def.name,
    run: def.run,
    size: def.size,
    sprite: `/catalog-units/${id}/image.jpg`,
    walk: def.walk,
    flagSprite: '/engeln.webp',
  };
  if (def.movementDistanceUnit) card.movementDistanceUnit = def.movementDistanceUnit;
  if (def.faithMarkers) card.faithMarkers = def.faithMarkers;
  if (def.traits && def.traits.length > 0) card.traits = def.traits;
  return {
    id,
    points: def.points,
    card,
  };
}

async function readScaleY(id) {
  const metaPath = path.join(repoRoot, 'public', 'catalog-units', id, 'scroll-meta.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const j = JSON.parse(raw);
    return j.scaleY ?? 1;
  } catch {
    return 1;
  }
}

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  const ids = [...ENGELN_TORNSCAPE_PAIRS.map((p) => p.id), ENGELN_TORNSCAPE_SINGLE.id];

  for (const id of ids) {
    const def = UNIT_DEFS[id];
    if (!def) throw new Error(`Нет UNIT_DEFS для ${id}`);

    const j = unitToJson(id, def);
    await fs.writeFile(path.join(unitsDir, `${id}.json`), JSON.stringify(j, null, 2), 'utf8');

    const scaleY = await readScaleY(id);
    const hf = {
      image: `/catalog-units/${id}/image.jpg`,
      title: def.name,
      regions: hotspotRegionsFromAttacks(def.attacks, scaleY),
      scrollLayout: { scaleY },
    };
    await fs.writeFile(path.join(hotspotsDir, `${id}.json`), JSON.stringify(hf, null, 2), 'utf8');
    console.log(`[engeln-tornscape-catalog] ${id}`);
  }
  console.log('[engeln-tornscape-catalog] Готово.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
