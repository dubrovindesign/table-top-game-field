#!/usr/bin/env node
/**
 * Приорат Надежды: статы и хотспоты с карточек (лист SoE / KoW).
 * Геометрия зон — доли от полного face.jpg (склейка ряд0+ряд1); build-priory-scroll-cards пересчитает y под склейку с оборотом.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Нижняя половина склейки — блок атак KoW на лице */
const A1 = { x: 0.045, y: 0.52, w: 0.91, h: 0.038 };
const A2 = { x: 0.045, y: 0.568, w: 0.91, h: 0.038 };
const A3 = { x: 0.045, y: 0.616, w: 0.91, h: 0.038 };

function region(base, extra) {
  return { ...base, ...extra };
}

function unitJson(u) {
  const c = u.card;
  return {
    id: u.id,
    points: u.points ?? 0,
    card: {
      attacks: c.attacks ?? [],
      catalogUnitId: u.id,
      concentration: { black: 0, green: 0, red: 0, white: 0 },
      defense: c.defense,
      defenseReaction: { green: 0, white: 1 },
      domains: ['creation'],
      exploration: { black: 0, green: 0, red: 0, white: 0 },
      explorationRange: 0,
      grabRange: 1,
      health: c.health,
      keywords: c.keywords ?? ['Приорат Надежды'],
      maxHealth: c.maxHealth,
      miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
      name: c.name,
      run: c.run,
      size: c.size,
      sprite: `/catalog-units/${u.id}/image.jpg`,
      walk: c.walk,
      movementDistanceUnit: 'hex',
      ...(c.faithMarkers &&
      (c.faithMarkers.red || c.faithMarkers.green || c.faithMarkers.black || c.faithMarkers.white)
        ? { faithMarkers: c.faithMarkers }
        : {}),
      ...(c.traits?.length ? { traits: c.traits } : {}),
      flagSprite: '/priory_of_hope.webp',
    },
  };
}

function hotspotJson(u) {
  return {
    image: `/catalog-units/${u.id}/image.jpg`,
    title: u.title,
    regions: u.regions.map((r) => {
      const out = { ...r };
      if (out.white === undefined) out.white = 0;
      return out;
    }),
  };
}

const UNITS = [
  {
    id: 'priory_of_hope-ricardo-ferran-roar-of-the-sea',
    title: 'Рикардо Ферран, Рокот Моря',
    points: 55,
    card: {
      name: 'Рикардо Ферран «Рокот Моря»',
      health: 14,
      maxHealth: 14,
      walk: 2,
      run: 3,
      size: 'large',
      defense: { white: 3, green: 1 },
      faithMarkers: { red: 2 },
      attacks: [
        {
          name: 'Удар булавой',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Выстрел дробью',
          range: 2,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 1,
          dice: { red: 3, black: 2, green: 1 },
          areaAttack: true,
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар булавой',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел дробью',
        red: 3,
        green: 1,
        black: 2,
        white: 0,
        range: 2,
        rangeUnit: 'hex',
        damage: 1,
      }),
    ],
  },
  {
    id: 'priory_of_hope-ricardo-ferran-lighthouse-keeper',
    title: 'Рикардо Ферран, Хранитель Маяка',
    points: 30,
    card: {
      name: 'Рикардо Ферран «Хранитель Маяка»',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 3, green: 1 },
      faithMarkers: { red: 1 },
      attacks: [
        {
          name: 'Удар булавой',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Выстрел дробью',
          range: 2,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 1,
          dice: { red: 3, black: 2, green: 1 },
          areaAttack: true,
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар булавой',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел дробью',
        red: 3,
        green: 1,
        black: 2,
        white: 0,
        range: 2,
        rangeUnit: 'hex',
        damage: 1,
      }),
    ],
  },
  {
    id: 'priory_of_hope-khoakin-de-esperando',
    title: 'Хоакин де Эсперандо',
    points: 42,
    card: {
      name: 'Хоакин де Эсперандо «Мятежный Капитан»',
      health: 5,
      maxHealth: 5,
      walk: 4,
      run: 6,
      size: 'small',
      defense: { white: 1, green: 2 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Лидер', 'Капитан', 'Человек', 'Воин'],
      attacks: [
        {
          name: 'Удар мечом',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 3, black: 2, green: 2 },
        },
        {
          name: 'Круговая атака',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 2, black: 2, green: 2 },
          areaAttack: true,
        },
      ],
      traits: [
        {
          name: 'На приступ!',
          description:
            'В начале вашей активации можете объявить: до конца раунда союзные модели с ключевым словом «Гвардеец» в пределах 2 гексов получают +1 к бегу.',
        },
        {
          name: 'Мастер прорыва',
          description:
            'При движении можете проходить сквозь вражеские малые модели; каждое такое прохождение увеличивает стоимость перемещения на 1".',
        },
        {
          name: 'Ветеран',
          description: 'Бросает 2 белых куба при прохождении теста на панику.',
        },
        {
          name: 'Заклятый враг: демон',
          description:
            '+1 красный куб к броскам атаки по моделям с ключевым словом «Демон».',
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар мечом',
        red: 3,
        green: 2,
        black: 2,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 3,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Круговая атака',
        red: 2,
        green: 2,
        black: 2,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 3,
      }),
    ],
  },
  {
    id: 'priory_of_hope-strazh-poberezhya-s-kulverinoy',
    title: 'Страж Побережья с кулевриной',
    points: 24,
    card: {
      name: 'Страж Побережья с кулевриной',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Стрелок'],
      attacks: [
        {
          name: 'Выстрел книппелем',
          range: 4,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Выстрел ядром',
          range: 4,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 4,
          dice: { red: 4, black: 1, green: 1 },
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Выстрел книппелем',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 4,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел ядром',
        red: 4,
        green: 1,
        black: 1,
        white: 0,
        range: 4,
        rangeUnit: 'hex',
        damage: 4,
      }),
    ],
  },
  {
    id: 'priory_of_hope-strazh-poberezhya-s-alebardoy',
    title: 'Страж Побережья с алебардой',
    points: 22,
    card: {
      name: 'Страж Побережья с алебардой',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Древковое'],
      attacks: [
        {
          name: 'Удар алебардой',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 3, black: 1, green: 1 },
        },
      ],
      traits: [
        {
          name: 'Концентрация',
          description: 'По карточке: +1 красный куб к броску атаки.',
        },
        {
          name: 'Защита',
          description: 'По карточке: +1 белый куб к броску защиты.',
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар алебардой',
        red: 3,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 3,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Концентрация / защита',
        red: 1,
        green: 0,
        black: 0,
        white: 1,
        range: 0,
        rangeUnit: 'hex',
        damage: 0,
      }),
    ],
  },
  {
    id: 'priory_of_hope-strazh-poberezhya-so-sdvoennym-mushketom',
    title: 'Страж Побережья со сдвоенным мушкетом',
    points: 22,
    card: {
      name: 'Страж Побережья со сдвоенным мушкетом',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Стрелок', 'Мушкет'],
      attacks: [
        {
          name: 'Выстрел',
          range: 4,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Удар кинжалом',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 1, green: 1 },
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Выстрел',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 4,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Удар кинжалом',
        red: 2,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
    ],
  },
  {
    id: 'priory_of_hope-strazh-poberezhya-so-shturmovym-mushketom',
    title: 'Страж Побережья со штурмовым мушкетом',
    points: 22,
    card: {
      name: 'Страж Побережья со штурмовым мушкетом',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 3, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Стрелок', 'Мушкет', 'Щит'],
      attacks: [
        {
          name: 'Выстрел',
          range: 3,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Выстрел дробью',
          range: 2,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 1,
          dice: { red: 3, black: 1, green: 1 },
          areaAttack: true,
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Выстрел',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 3,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел дробью',
        red: 3,
        green: 1,
        black: 1,
        white: 0,
        range: 2,
        rangeUnit: 'hex',
        damage: 1,
      }),
    ],
  },
  {
    id: 'priory_of_hope-strazh-poberezhya-s-bulavoy',
    title: 'Страж Побережья с булавой',
    points: 23,
    card: {
      name: 'Страж Побережья с булавой',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 3, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Булава', 'Щит'],
      attacks: [
        {
          name: 'Удар булавой',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 3, black: 1, green: 1 },
        },
        {
          name: 'Удар щитом',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, green: 1 },
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар булавой',
        red: 3,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 3,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Удар щитом',
        red: 2,
        green: 1,
        black: 0,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
    ],
  },
];

/** Пары PNG: лицевая + вторая сторона (public/priory-pairs-png), см. build-priory-pairs-from-png.mjs */
const PRIORY_PNG_PAIR_UNITS = [
  {
    id: 'priory_of_hope-brigadir-strazhey-poberezhya',
    title: 'Бригадир Стражей Побережья',
    points: 32,
    card: {
      name: 'Бригадир Стражей Побережья',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Офицер', 'Булава', 'Пистолет'],
      attacks: [
        {
          name: 'Удар булавой',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 1, black: 2, green: 1 },
        },
        {
          name: 'Выстрел из пистоля',
          range: 3,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 1, black: 2, green: 1 },
        },
      ],
      traits: [
        {
          name: 'Лидер гвардии',
          description:
            'Если ваш лидер убит, союзники в пределах 2 гексов автоматически проходят тест на панику.',
        },
        {
          name: 'Офицер',
          description:
            'При активации может заявить совместную активацию с одним или двумя союзниками в пределах 1 гекса с ключевыми словами «Приорат Надежды» и «Гвардеец».',
        },
        {
          name: 'Атакующее звено',
          description:
            '+1 чёрный куб ко всем атакам за активацию за каждого союзника с правилом «Атакующее звено» в пределах 2 гексов (не более 2).',
        },
        {
          name: 'Ветеран',
          description: 'Бросает 2 белых куба при прохождении теста на панику.',
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Удар булавой',
        red: 1,
        green: 1,
        black: 2,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 3,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел из пистоля',
        red: 1,
        green: 1,
        black: 2,
        white: 0,
        range: 3,
        rangeUnit: 'hex',
        damage: 2,
      }),
    ],
  },
  {
    id: 'priory_of_hope-sanador-strazhey-poberezhya',
    title: 'Санадор Стражей Побережья',
    points: 28,
    card: {
      name: 'Санадор Стражей Побережья',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Целитель', 'Пистолет'],
      attacks: [
        {
          name: 'Перевязка',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 0,
          dice: { red: 3, black: 1, green: 1 },
        },
        {
          name: 'Выстрел из пистоля',
          range: 3,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 1, black: 2, green: 1 },
        },
        {
          name: 'Удар кинжалом',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 1, black: 1, green: 1 },
        },
      ],
      traits: [
        {
          name: 'Медпакет',
          description:
            'Союзник в пределах 3 гексов теряет маркер кровотечения в конце активации санадора.',
        },
        {
          name: 'Защитное звено',
          description:
            '+1 белый куб от дистанционных атак за каждого союзника с ключевыми словами «Гвардеец» и «Щит» в соседних гексах (не более 2).',
        },
        {
          name: 'Ветеран',
          description: 'Бросает 2 белых куба при прохождении теста на панику.',
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Перевязка',
        red: 3,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 0,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел из пистоля',
        red: 1,
        green: 1,
        black: 2,
        white: 0,
        range: 3,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A3, {
        id: 'attack_2',
        label: 'Удар кинжалом',
        red: 1,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
    ],
  },
  {
    id: 'priory_of_hope-iskatel-strazhey-poberezhya',
    title: 'Искатель Стражей Побережья',
    points: 26,
    card: {
      name: 'Искатель Стражей Побережья',
      health: 5,
      maxHealth: 5,
      walk: 3,
      run: 5,
      size: 'small',
      defense: { white: 2, green: 1 },
      faithMarkers: { red: 1 },
      keywords: ['Приорат Надежды', 'Гвардеец', 'Мушкет'],
      attacks: [
        {
          name: 'Выстрел',
          range: 3,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 2,
          dice: { red: 2, black: 2, green: 1 },
        },
        {
          name: 'Выстрел дробью',
          range: 2,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 1,
          dice: { red: 3, black: 1, green: 1 },
          areaAttack: true,
        },
        {
          name: 'Удар кинжалом',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 1, black: 1, green: 1 },
        },
      ],
      traits: [
        {
          name: 'Эфирный компас',
          description:
            'Один раз за активацию может перебросить 1 красный куб при действии «Исследовать».',
        },
        {
          name: 'Защитное звено',
          description:
            '+1 белый куб от дистанционных атак за каждого союзника с ключевыми словами «Гвардеец» и «Щит» в соседних гексах (не более 2).',
        },
        {
          name: 'Ветеран',
          description: 'Бросает 2 белых куба при прохождении теста на панику.',
        },
      ],
    },
    regions: [
      region(A1, {
        id: 'attack_0',
        label: 'Выстрел',
        red: 2,
        green: 1,
        black: 2,
        white: 0,
        range: 3,
        rangeUnit: 'hex',
        damage: 2,
      }),
      region(A2, {
        id: 'attack_1',
        label: 'Выстрел дробью',
        red: 3,
        green: 1,
        black: 1,
        white: 0,
        range: 2,
        rangeUnit: 'hex',
        damage: 1,
      }),
      region(A3, {
        id: 'attack_2',
        label: 'Удар кинжалом',
        red: 1,
        green: 1,
        black: 1,
        white: 0,
        range: 1,
        rangeUnit: 'hex',
        damage: 2,
      }),
    ],
  },
];

const ALL_PRIORY_UNITS = [...UNITS, ...PRIORY_PNG_PAIR_UNITS];

const PRIORY_TROOP_ROSTER = [
  { unitId: 'priory_of_hope-strazh-poberezhya-s-kulverinoy', maxCopies: 4, points: 24 },
  { unitId: 'priory_of_hope-strazh-poberezhya-s-alebardoy', maxCopies: 4, points: 22 },
  { unitId: 'priory_of_hope-strazh-poberezhya-so-sdvoennym-mushketom', maxCopies: 4, points: 22 },
  { unitId: 'priory_of_hope-strazh-poberezhya-so-shturmovym-mushketom', maxCopies: 4, points: 22 },
  { unitId: 'priory_of_hope-strazh-poberezhya-s-bulavoy', maxCopies: 4, points: 23 },
  { unitId: 'priory_of_hope-brigadir-strazhey-poberezhya', maxCopies: 2, points: 32 },
  { unitId: 'priory_of_hope-sanador-strazhey-poberezhya', maxCopies: 2, points: 28 },
  { unitId: 'priory_of_hope-iskatel-strazhey-poberezhya', maxCopies: 3, points: 26 },
];

async function patchLeadersRoster() {
  const leadersPath = path.join(repoRoot, 'src', 'catalog', 'leaders.json');
  const raw = await fs.readFile(leadersPath, 'utf8');
  const list = JSON.parse(raw);
  const rosterCopy = () => JSON.parse(JSON.stringify(PRIORY_TROOP_ROSTER));
  for (const L of list) {
    if (
      L.id === 'priory_of_hope-ricardo-ferran-roar-of-the-sea' ||
      L.id === 'priory_of_hope-ricardo-ferran-lighthouse-keeper' ||
      L.id === 'priory_of_hope-khoakin-de-esperando'
    ) {
      L.roster = rosterCopy();
    }
  }
  const espId = 'priory_of_hope-khoakin-de-esperando';
  if (!list.some((L) => L.id === espId)) {
    list.push({
      id: espId,
      name: 'Хоакин де Эсперандо',
      factionId: 'priory_of_hope',
      catalogUnitId: espId,
      points: 42,
      roster: rosterCopy(),
    });
    console.log('[priory-catalog] leaders.json: добавлен лидер Хоакин де Эсперандо');
  }
  await fs.writeFile(leadersPath, JSON.stringify(list, null, 2), 'utf8');
  console.log('[priory-catalog] leaders.json: ростер приората (Рикардо ×2 + Эсперандо)');
}

async function main() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  for (const u of ALL_PRIORY_UNITS) {
    await fs.writeFile(path.join(unitsDir, `${u.id}.json`), JSON.stringify(unitJson(u), null, 2), 'utf8');
    await fs.writeFile(path.join(hotDir, `${u.id}.json`), JSON.stringify(hotspotJson(u), null, 2), 'utf8');
  }
  console.log(`[priory-catalog] wrote ${ALL_PRIORY_UNITS.length} units + hotspots`);
  await patchLeadersRoster();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
