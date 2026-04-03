/**
 * God cards catalog — drag from army panel to the table like units (manual effects for now).
 */

export type GodCardEffectTag = 'heal' | 'damage' | 'slow' | 'buff' | 'debuff' | 'utility';

export type GodCardDef = {
  id: string;
  title: string;
  /** Rule text — executed manually until effect engine exists. */
  text: string;
  tags?: GodCardEffectTag[];
};

/** On-table god card(s): single or stacked deck (`ids` bottom → top). */
export type GodTablePiece =
  | { kind: 'single'; id: string; world: { x: number; y: number }; faceUp: boolean }
  | { kind: 'deck'; ids: string[]; world: { x: number; y: number }; faceUp: boolean };

export const GOD_CARDS: GodCardDef[] = [
  {
    id: 'god_mercy',
    title: 'Милость',
    text: 'Восстановите до 3 здоровья одному союзному юниту в пределах дальности 2.',
    tags: ['heal'],
  },
  {
    id: 'god_wrath',
    title: 'Гнев',
    text: 'Нанесите 2 урона одному видимому вражескому юниту.',
    tags: ['damage'],
  },
  {
    id: 'god_binding',
    title: 'Узы',
    text: 'До конца раунда выбранный вражеский юнит не может совершать полный бег (только шаг).',
    tags: ['slow'],
  },
  {
    id: 'god_omen',
    title: 'Знамение',
    text: 'Посмотрите верхнюю карту колоды богов оппонента и положите её под низ.',
    tags: ['utility'],
  },
  {
    id: 'god_shield',
    title: 'Эгида',
    text: 'Выбранный союзник игнорирует следующий полученный урон до конца раунда.',
    tags: ['buff'],
  },
  {
    id: 'god_plague',
    title: 'Мор',
    text: 'Каждый вражеский юнит в одном гексоне получает 1 урон.',
    tags: ['damage', 'debuff'],
  },
  {
    id: 'god_renewal',
    title: 'Обновление',
    text: 'Снимите один негативный эффект с союзника или восстановите 1 здоровье всем союзникам в одном гексоне.',
    tags: ['heal', 'utility'],
  },
  {
    id: 'god_eclipse',
    title: 'Затмение',
    text: 'До конца хода оппонента дальнобойные атаки не могут выбирать цели дальше 1 гекса.',
    tags: ['debuff'],
  },
  {
    id: 'god_charge',
    title: 'Натиск',
    text: 'Выбранный союзник может совершить одно дополнительное перемещение на шаг в этот ход.',
    tags: ['buff'],
  },
  {
    id: 'god_bargain',
    title: 'Сделка',
    text: 'Потеряйте 2 здоровья на одном своём юните; нанесите 3 урона одной цели в пределах дальности.',
    tags: ['damage', 'utility'],
  },
  {
    id: 'god_silence',
    title: 'Безмолвие',
    text: 'До конца раунда выбранный вражеский юнит не может использовать способности с текстом «активируемая».',
    tags: ['debuff'],
  },
  {
    id: 'god_tithe',
    title: 'Десятина',
    text: 'Возьмите ещё одну карту богов; в начале вашего следующего хода сбросьте случайную карту с руки.',
    tags: ['utility'],
  },
];

const byId = new Map<string, GodCardDef>(GOD_CARDS.map((c) => [c.id, c]));

export function getGodCardById(id: string): GodCardDef | undefined {
  return byId.get(id);
}
