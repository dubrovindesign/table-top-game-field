/**
 * Deck definitions for Ephirium (ether) vortex cards — narrative placeholders for tabletop use.
 */

export type EphiriumVortexIconKind =
  | 'vortex'
  | 'flame'
  | 'frost'
  | 'stone'
  | 'tide'
  | 'bolt'
  | 'void'
  | 'bloom'
  | 'chain'
  | 'mask'
  | 'bone'
  | 'star'
  | 'mire'
  | 'echo'
  | 'shard'
  | 'root';

export type EphiriumVortexCardDef = {
  id: string;
  title: string;
  positive: string;
  negative: string;
  iconKind: EphiriumVortexIconKind;
  /** Optional damage called out in the negative strip (e.g. fist + number). */
  damage?: number;
};

export const EPHIRIUM_VORTEX_CARDS: EphiriumVortexCardDef[] = [
  {
    id: 'air_vortex',
    title: 'Воздуховорот',
    positive: 'Исследователь перемещается в пределах 1 Гексона от Вихря.',
    negative: 'Исследователь получает 2 Урона',
    iconKind: 'vortex',
    damage: 2,
  },
  {
    id: 'ember_spiral',
    title: 'Угольная спираль',
    positive: 'Следующая атака исследователя наносит +1 урон.',
    negative: 'Исследователь получает 1 урон в начале своего хода.',
    iconKind: 'flame',
    damage: 1,
  },
  {
    id: 'frost_ring',
    title: 'Ледяное кольцо',
    positive: 'Исследователь игнорирует первый полученный урон до конца раунда.',
    negative: 'Скорость передвижения исследователя уменьшается на 1 до конца раунда.',
    iconKind: 'frost',
  },
  {
    id: 'stone_maw',
    title: 'Каменная пасть',
    positive: 'Исследователь получает +1 к защите до конца раунда.',
    negative: 'Исследователь получает 2 урона',
    iconKind: 'stone',
    damage: 2,
  },
  {
    id: 'tide_pull',
    title: 'Приливный откат',
    positive: 'Исследователь может сдвинуться на 1 гекс без провоцирования.',
    negative: 'В конце хода исследователь сдвигается на 1 гекс к ближайшему вихрю.',
    iconKind: 'tide',
  },
  {
    id: 'arc_split',
    title: 'Расщепление дуги',
    positive: 'Дальность следующей дальнобойной атаки +1.',
    negative: 'Исследователь получает 1 урон за каждую дальнобойную атаку в этот раунд.',
    iconKind: 'bolt',
    damage: 1,
  },
  {
    id: 'void_peel',
    title: 'Слой пустоты',
    positive: 'Исследователь может перебросить один кубик один раз.',
    negative: 'Исследователь теряет 1 очко концентрации (если есть).',
    iconKind: 'void',
  },
  {
    id: 'wild_bloom',
    title: 'Дикий цветок эфира',
    positive: 'Восстановите 2 здоровья одному союзнику в радиусе 2 гексов.',
    negative: 'Исследователь получает 2 урона',
    iconKind: 'bloom',
    damage: 2,
  },
  {
    id: 'iron_chain',
    title: 'Железная цепь',
    positive: 'Выберите врага в радиусе 2: он получает −1 к скорости до вашего следующего хода.',
    negative: 'Исследователь не может бежать до конца раунда.',
    iconKind: 'chain',
  },
  {
    id: 'mirror_mask',
    title: 'Зеркальная маска',
    positive: 'Первый раз за раунд при получении урона исследователь отражает 1 урон атакующему.',
    negative: 'Исследователь получает 1 урон при каждом входе во вражескую зону контроля.',
    iconKind: 'mask',
    damage: 1,
  },
  {
    id: 'ash_whisper',
    title: 'Ясеневый шёпот',
    positive: 'Следующая проверка навыка исследователя с бонусом +1.',
    negative: 'Враги в радиусе 1 получают преимущество на атаки по исследователю до конца раунда.',
    iconKind: 'bone',
  },
  {
    id: 'comet_trail',
    title: 'След кометы',
    positive: 'Исследователь может пройти сквозь одного врага, не останавливаясь.',
    negative: 'Исследователь получает 2 урона',
    iconKind: 'star',
    damage: 2,
  },
  {
    id: 'bog_weight',
    title: 'Трясина памяти',
    positive: 'Снимите одно негативное состояние с исследователя.',
    negative: 'Исследователь получает состояние «замедление» до конца раунда.',
    iconKind: 'mire',
  },
  {
    id: 'echo_chamber',
    title: 'Эхо-камера',
    positive: 'Повторите эффект последней сыгранной способности с половинной силой (округление вниз).',
    negative: 'Исследователь получает 1 урон каждый раз, когда объявляет способность.',
    iconKind: 'echo',
    damage: 1,
  },
  {
    id: 'glass_shard',
    title: 'Осколок стекла',
    positive: 'Следующий бросок атаки с +1 кубом того же цвета.',
    negative: 'Исследователь получает 2 урона',
    iconKind: 'shard',
    damage: 2,
  },
  {
    id: 'deep_root',
    title: 'Корень бездны',
    positive: 'Исследователь не может быть сдвинут против воли до конца раунда.',
    negative: 'Исследователь не может покинуть гекс, на котором стоит, до конца раунда.',
    iconKind: 'root',
  },
];
