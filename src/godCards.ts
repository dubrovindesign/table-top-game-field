/**
 * God cards catalog — drag from army panel to the table; faces from sprite sheets.
 * Лист Кастилии: 7×5; лист Курош хана (Орда брумгаров): 6×2;
 * колоды богов созидания: основной лист 7×5, лист «Торгаар / Арист» 6×2.
 */

export type GodCardEffectTag = 'heal' | 'damage' | 'slow' | 'buff' | 'debuff' | 'utility';

/** One cell on a uniform grid sprite sheet (`sheet` URL under `public/`). */
export type GodCardSpriteCell = {
  sheet: string;
  col: number;
  row: number;
};

export type GodCardDef = {
  id: string;
  title: string;
  /** Rule text — not shown on card art; for reference / future rules engine. */
  text: string;
  tags?: GodCardEffectTag[];
  /**
   * Кто видит карту в панели армии. Нет поля или пустой массив — карта никому не показывается.
   * Иначе только перечисленные лидеры (`leader.id` из `leaders.json`). Патчится в редакторе каталога (localStorage).
   */
  onlyForLeaderIds?: string[];
  sprite: GodCardSpriteCell;
  /**
   * Сетка листа для `sprite`; по умолчанию 7×5 (Кастилия).
   */
  spriteGrid?: { cols: number; rows: number };
  /** Future: faith crystal cost when playing the card (not deducted yet). */
  crystalCost?: number;
};

/** On-table god card(s): single or stacked deck (`ids` bottom → top). */
export type GodTablePiece =
  | { kind: 'single'; id: string; world: { x: number; y: number }; faceUp: boolean }
  | { kind: 'deck'; ids: string[]; world: { x: number; y: number }; faceUp: boolean };

/** Grid dimensions листа Кастилии (рубашка в (6,4), пустая (5,4)). */
export const GOD_CARD_SPRITE_GRID_COLS = 7;
export const GOD_CARD_SPRITE_GRID_ROWS = 5;

const SHEET_CASTILIA_ABYSS = '/god-cards-castilia-abyss.jpg';
/** Лист способностей Курош хана (Tabletop Simulator / тот же файл, что в `public/inventory/`). */
export const SHEET_KUROSH_KHAN = '/inventory/kurosh-khan-abilities-sheet.jpg';
/** Основная колода карт богов созидания (7×5, рубашка (6,4) как у Кастилии). */
const SHEET_CREATION_MAIN = '/god-cards-creation-main.jpg';
/** Доп. лист созидания — Торгаар / Арист (6×2, рубашка правый нижний угол). */
const SHEET_CREATION_TORGAAR = '/god-cards-creation-torgaar.jpg';

const GOD_CARD_BACK_COL = 6;
const GOD_CARD_BACK_ROW = 4;

const KUROSH_GRID_COLS = 6;
const KUROSH_GRID_ROWS = 2;
/** Рубашка на листе Курош хана (нижний ряд, предпоследняя ячейка). */
const KUROSH_BACK_COL = 4;
const KUROSH_BACK_ROW = 1;

/** Сетка листа и ячейка рубашки на том же изображении (для отрисовки рубашки стопки). */
type GodSpriteSheetBack = {
  cols: number;
  rows: number;
  backCol: number;
  backRow: number;
};

const GOD_SPRITE_SHEET_BACK: Readonly<Record<string, GodSpriteSheetBack>> = {
  [SHEET_CASTILIA_ABYSS]: {
    cols: GOD_CARD_SPRITE_GRID_COLS,
    rows: GOD_CARD_SPRITE_GRID_ROWS,
    backCol: GOD_CARD_BACK_COL,
    backRow: GOD_CARD_BACK_ROW,
  },
  [SHEET_KUROSH_KHAN]: {
    cols: KUROSH_GRID_COLS,
    rows: KUROSH_GRID_ROWS,
    backCol: KUROSH_BACK_COL,
    backRow: KUROSH_BACK_ROW,
  },
  [SHEET_CREATION_MAIN]: {
    cols: GOD_CARD_SPRITE_GRID_COLS,
    rows: GOD_CARD_SPRITE_GRID_ROWS,
    backCol: GOD_CARD_BACK_COL,
    backRow: GOD_CARD_BACK_ROW,
  },
  [SHEET_CREATION_TORGAAR]: {
    cols: KUROSH_GRID_COLS,
    rows: KUROSH_GRID_ROWS,
    backCol: 5,
    backRow: 1,
  },
};

function godSpriteSheetBackFor(sheet: string): GodSpriteSheetBack {
  return GOD_SPRITE_SHEET_BACK[sheet] ?? GOD_SPRITE_SHEET_BACK[SHEET_CASTILIA_ABYSS]!;
}

const LEADER_KUROSH_KHAN = 'broomgar-kurosh-khan';

/**
 * Лидеры с одной и той же колодой карт богов созидания (основной 7×5 + лист Торгаар 6×2):
 * Ричард, Сердце Леогриффа; оба варианта Рикардо Феррана; Хоакин де Эсперандо (Приорат Надежды).
 */
const LEADERS_CREATION_STANDARD_GOD_DECK: readonly string[] = [
  'engeln-richard-serdtse-leogriffa',
  'priory_of_hope-ricardo-ferran-roar-of-the-sea',
  'priory_of_hope-ricardo-ferran-lighthouse-keeper',
  'priory_of_hope-khoakin-de-esperando',
];

/**
 * Id карт из `buildCreationMainGodCards` / `buildCreationTorgaarGodCards`, входящих в эту колоду.
 * Остальные ячейки тех же листов без привязки в панели армии не показываются.
 */
const CREATION_STANDARD_GOD_DECK_CARD_IDS: ReadonlySet<string> = new Set([
  'god_creation_main_r0c0',
  'god_creation_main_r0c1',
  'god_creation_main_r0c4',
  'god_creation_main_r0c5',
  'god_creation_main_r0c6',
  'god_creation_main_r1c0',
  'god_creation_main_r1c1',
  'god_creation_main_r1c2',
  'god_creation_main_r1c3',
  'god_creation_main_r1c4',
  'god_creation_main_r2c1',
  'god_creation_main_r2c3',
  'god_creation_main_r2c6',
  'god_creation_main_r3c0',
  'god_creation_main_r3c2',
  'god_creation_main_r3c5',
  'god_creation_main_r3c6',
  'god_creation_main_r4c1',
  'god_creation_main_r4c4',
  'god_creation_tor_pylevoy_kulak',
  'god_creation_tor_okovy_sveta',
  'god_creation_tor_metka_solntsa_a',
  'god_creation_tor_metka_solntsa_b',
  'god_creation_tor_molot_arista_a',
  'god_creation_tor_molot_arista_b',
  'god_creation_tor_molot_arista_c',
  'god_creation_tor_zacharovat_oruzhie_a',
  'god_creation_tor_zacharovat_oruzhie_b',
  'god_creation_tor_zacharovat_oruzhie_c',
]);

/**
 * Ячейки листа Кастилии, входящие в колоду карт богов Курош хана (вместе с листом 6×2).
 * Остальные ячейки листа в панели армии по умолчанию не показываются (`onlyForLeaderIds` пустой).
 */
const CASTILIA_GOD_CELLS_FOR_KUROSH_KHAN: readonly { row: number; col: number }[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 4 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 1, col: 4 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
  { row: 2, col: 5 },
];

const castiliaKuroshCellKeys = new Set(
  CASTILIA_GOD_CELLS_FOR_KUROSH_KHAN.map((c) => `r${c.row}c${c.col}`),
);

/**
 * Все 33 картинки на листе Кастилии (каждая ячейка — отдельная запись; дубликаты арта — свои col/row).
 * Ряд/колонка 0-based. Пропуск: (5,4) пусто, (6,4) рубашка.
 */
const SHEET_ROWS: readonly (readonly [string, number][])[] = [
  [
    ['Адское Пламя', 15],
    ['Сфера Огня', 5],
    ['Безумие', 7],
    ['Слово Войны', 5],
    ['Огненный Дождь', 10],
    ['Сломать Доспех', 2],
    ['Щит Огня', 3],
  ],
  [
    ['Слепота', 2],
    ['Разлом', 5],
    ['Пламенная Земля', 3],
    ['Сломать Доспех', 2],
    ['Щит Огня', 3],
    ['Слепота', 2],
    ['Разлом', 5],
  ],
  [
    ['Пламенная Земля', 3],
    ['Боевая Ярость', 2],
    ['Возгорание', 2],
    ['Течение Хаоса', 3],
    ['Клинки Пламени', 5],
    ['Луч Хаоса', 3],
    ['Ускорение', 2],
  ],
  [
    ['Боевая Ярость', 2],
    ['Возгорание', 2],
    ['Течение Хаоса', 3],
    ['Клинки Пламени', 5],
    ['Луч Хаоса', 3],
    ['Ускорение', 2],
    ['Боевая Ярость', 2],
  ],
  [
    ['Возгорание', 2],
    ['Течение Хаоса', 3],
    ['Клинки Пламени', 5],
    ['Луч Хаоса', 3],
    ['Ускорение', 2],
  ],
] as const;

function buildGodCardsFromCastiliaSheet(): GodCardDef[] {
  const out: GodCardDef[] = [];
  for (let row = 0; row < SHEET_ROWS.length; row++) {
    const cells = SHEET_ROWS[row]!;
    for (let col = 0; col < cells.length; col++) {
      const [title, cost] = cells[col]!;
      const key = `r${row}c${col}`;
      const forKurosh = castiliaKuroshCellKeys.has(key);
      out.push({
        id: `god_sheet_${key}`,
        title,
        text: 'Правила на карточке.',
        tags: ['utility'],
        crystalCost: cost,
        sprite: { sheet: SHEET_CASTILIA_ABYSS, col, row },
        ...(forKurosh ? { onlyForLeaderIds: [LEADER_KUROSH_KHAN] } : {}),
      });
    }
  }
  return out;
}

/**
 * Колода способностей Курош хана: 10 карт лица + рубашка на том же листе 6×2.
 */
function buildKuroshKhanGodCards(): GodCardDef[] {
  const only = [LEADER_KUROSH_KHAN];
  const grid = { cols: KUROSH_GRID_COLS, rows: KUROSH_GRID_ROWS };
  const sheet = SHEET_KUROSH_KHAN;
  const rows: readonly {
    id: string;
    title: string;
    cost: number;
    col: number;
    row: number;
  }[] = [
    { id: 'god_kurosh_golodnyy_dvoynik', title: 'Голодный Двойник', cost: 6, col: 0, row: 0 },
    { id: 'god_kurosh_podstegnut', title: 'Подстегнуть', cost: 4, col: 1, row: 0 },
    { id: 'god_kurosh_pirshestvo_a', title: 'Пиршество', cost: 3, col: 2, row: 0 },
    { id: 'god_kurosh_pirshestvo_b', title: 'Пиршество', cost: 3, col: 3, row: 0 },
    { id: 'god_kurosh_dar_vargata_a', title: 'Дар Варгата', cost: 2, col: 4, row: 0 },
    { id: 'god_kurosh_dar_vargata_b', title: 'Дар Варгата', cost: 2, col: 5, row: 0 },
    { id: 'god_kurosh_dar_vargata_c', title: 'Дар Варгата', cost: 2, col: 0, row: 1 },
    { id: 'god_kurosh_opustoshenie_a', title: 'Опустошение Брюха', cost: 2, col: 1, row: 1 },
    { id: 'god_kurosh_opustoshenie_b', title: 'Опустошение Брюха', cost: 2, col: 2, row: 1 },
    { id: 'god_kurosh_opustoshenie_c', title: 'Опустошение Брюха', cost: 2, col: 3, row: 1 },
  ];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    text: 'Правила на карточке.',
    tags: ['utility'],
    crystalCost: r.cost,
    onlyForLeaderIds: only,
    spriteGrid: grid,
    sprite: { sheet, col: r.col, row: r.row },
  }));
}

/**
 * Основной лист карт богов созидания (7×5): (5,4) пусто, (6,4) рубашка.
 * `crystalCost` — число в ромбе на карте; привязка к лидерам — в редакторе каталога.
 */
const CREATION_MAIN_SHEET_ROWS: readonly (readonly [string, number][])[] = [
  [
    ['Кара', 15],
    ['Цепная Молния', 5],
    ['Плоть в Свет', 5],
    ['Щит Веры', 5],
    ['Воодушевление', 7],
    ['Предсказать', 1],
    ['Смерть', 3],
  ],
  [
    ['Телепорт', 3],
    ['Точность', 3],
    ['Помеха', 3],
    ['Предсказать', 1],
    ['Смерть', 3],
    ['Телепорт', 3],
    ['Точность', 3],
  ],
  [
    ['Помеха', 3],
    ['Удача', 2],
    ['Полёт', 2],
    ['Молния', 2],
    ['Воля Света', 2],
    ['Укрепить Доспех', 2],
    ['Контрудар', 2],
  ],
  [
    ['Удача', 2],
    ['Полёт', 2],
    ['Молния', 2],
    ['Воля Света', 2],
    ['Укрепить Доспех', 2],
    ['Контрудар', 2],
    ['Удача', 2],
  ],
  [['Полёт', 2], ['Молния', 2], ['Воля Света', 2], ['Укрепить Доспех', 2], ['Контрудар', 2]],
] as const;

function buildCreationMainGodCards(): GodCardDef[] {
  const out: GodCardDef[] = [];
  const sheet = SHEET_CREATION_MAIN;
  for (let row = 0; row < CREATION_MAIN_SHEET_ROWS.length; row++) {
    const cells = CREATION_MAIN_SHEET_ROWS[row]!;
    for (let col = 0; col < cells.length; col++) {
      const [title, cost] = cells[col]!;
      const id = `god_creation_main_r${row}c${col}`;
      out.push({
        id,
        title,
        text: 'Правила на карточке.',
        tags: ['utility'],
        crystalCost: cost,
        sprite: { sheet, col, row },
        ...(CREATION_STANDARD_GOD_DECK_CARD_IDS.has(id)
          ? { onlyForLeaderIds: [...LEADERS_CREATION_STANDARD_GOD_DECK] }
          : {}),
      });
    }
  }
  return out;
}

/** Лист Торгаар / Арист: 10 лиц, (4,1) пусто, (5,1) рубашка. */
function buildCreationTorgaarGodCards(): GodCardDef[] {
  const sheet = SHEET_CREATION_TORGAAR;
  const grid = { cols: KUROSH_GRID_COLS, rows: KUROSH_GRID_ROWS };
  const rows: readonly {
    id: string;
    title: string;
    cost: number;
    col: number;
    row: number;
  }[] = [
    { id: 'god_creation_tor_pylevoy_kulak', title: 'Пылающий Кулак', cost: 5, col: 0, row: 0 },
    { id: 'god_creation_tor_okovy_sveta', title: 'Оковы Света', cost: 4, col: 1, row: 0 },
    { id: 'god_creation_tor_metka_solntsa_a', title: 'Метка Солнца', cost: 3, col: 2, row: 0 },
    { id: 'god_creation_tor_metka_solntsa_b', title: 'Метка Солнца', cost: 3, col: 3, row: 0 },
    { id: 'god_creation_tor_molot_arista_a', title: 'Молот Ариста', cost: 2, col: 4, row: 0 },
    { id: 'god_creation_tor_molot_arista_b', title: 'Молот Ариста', cost: 2, col: 5, row: 0 },
    { id: 'god_creation_tor_molot_arista_c', title: 'Молот Ариста', cost: 2, col: 0, row: 1 },
    { id: 'god_creation_tor_zacharovat_oruzhie_a', title: 'Зачаровать Оружие', cost: 2, col: 1, row: 1 },
    { id: 'god_creation_tor_zacharovat_oruzhie_b', title: 'Зачаровать Оружие', cost: 2, col: 2, row: 1 },
    { id: 'god_creation_tor_zacharovat_oruzhie_c', title: 'Зачаровать Оружие', cost: 2, col: 3, row: 1 },
  ];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    text: 'Правила на карточке.',
    tags: ['utility'],
    crystalCost: r.cost,
    spriteGrid: grid,
    sprite: { sheet, col: r.col, row: r.row },
    ...(CREATION_STANDARD_GOD_DECK_CARD_IDS.has(r.id)
      ? { onlyForLeaderIds: [...LEADERS_CREATION_STANDARD_GOD_DECK] }
      : {}),
  }));
}

export const GOD_CARDS: GodCardDef[] = [
  ...buildGodCardsFromCastiliaSheet(),
  ...buildKuroshKhanGodCards(),
  ...buildCreationMainGodCards(),
  ...buildCreationTorgaarGodCards(),
];

const byId = new Map<string, GodCardDef>(GOD_CARDS.map((c) => [c.id, c]));

/** Виртуальные копии в панели армии: `baseId__gc0`, `baseId__gc1`, … */
const GOD_CARD_INSTANCE_RE = /^(.+)__gc(\d+)$/;

const sheetImages = new Map<string, HTMLImageElement>();

/** Канонический id спрайта/данных (без суффикса экземпляра). */
export function godCardBaseId(id: string): string {
  const m = id.match(GOD_CARD_INSTANCE_RE);
  return m ? m[1]! : id;
}

export function getGodCardById(id: string): GodCardDef | undefined {
  return byId.get(godCardBaseId(id));
}

export function uniqueGodCardSpriteSheetUrls(): string[] {
  return [...new Set(GOD_CARDS.map((c) => c.sprite.sheet))];
}

export function getGodCardSpriteGrid(def: GodCardDef): { cols: number; rows: number } {
  return def.spriteGrid ?? { cols: GOD_CARD_SPRITE_GRID_COLS, rows: GOD_CARD_SPRITE_GRID_ROWS };
}

/** Source rectangle in pixels for `drawImage` (uniform grid). */
export function godCardSpriteSourcePixels(
  def: GodCardDef,
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const { cols, rows } = getGodCardSpriteGrid(def);
  const cw = imageWidth / cols;
  const ch = imageHeight / rows;
  return {
    sx: def.sprite.col * cw,
    sy: def.sprite.row * ch,
    sw: cw,
    sh: ch,
  };
}

export function getGodCardSpriteImage(sheetUrl: string): HTMLImageElement | undefined {
  return sheetImages.get(sheetUrl);
}

export function getGodCardBackSpriteImage(): HTMLImageElement | undefined {
  return sheetImages.get(SHEET_CASTILIA_ABYSS);
}

/** Рубашка для стопки/карты: тот же файл, что и лицо, ячейка рубашки из `GOD_SPRITE_SHEET_BACK`. */
export function getGodCardBackSpriteImageForCard(def: GodCardDef | undefined): HTMLImageElement | undefined {
  const url = def?.sprite.sheet ?? SHEET_CASTILIA_ABYSS;
  return sheetImages.get(url);
}

export function godCardBackSpriteSourcePixels(
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const cw = imageWidth / GOD_CARD_SPRITE_GRID_COLS;
  const ch = imageHeight / GOD_CARD_SPRITE_GRID_ROWS;
  return {
    sx: GOD_CARD_BACK_COL * cw,
    sy: GOD_CARD_BACK_ROW * ch,
    sw: cw,
    sh: ch,
  };
}

export function godCardBackSpriteSourcePixelsForCard(
  def: GodCardDef | undefined,
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const { cols, rows, backCol, backRow } = godSpriteSheetBackFor(def?.sprite.sheet ?? SHEET_CASTILIA_ABYSS);
  const cw = imageWidth / cols;
  const ch = imageHeight / rows;
  return {
    sx: backCol * cw,
    sy: backRow * ch,
    sw: cw,
    sh: ch,
  };
}

/** Load all distinct sprite sheets; safe to call multiple times. */
export function preloadGodCardSpriteSheets(): Promise<void> {
  const urls = uniqueGodCardSpriteSheetUrls();
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          if (sheetImages.has(url)) {
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            sheetImages.set(url, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`[god cards] failed to load sprite: ${url}`));
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

/** CSS background for a DOM tile (army panel, blind zone). */
export function applyGodCardSpriteCss(el: HTMLElement, def: GodCardDef): void {
  const { cols, rows } = getGodCardSpriteGrid(def);
  const { col, row } = def.sprite;
  el.style.backgroundImage = `url("${def.sprite.sheet}")`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  const xPct = cols <= 1 ? 0 : (col / (cols - 1)) * 100;
  const yPct = rows <= 1 ? 0 : (row / (rows - 1)) * 100;
  el.style.backgroundPosition = `${xPct}% ${yPct}%`;
}

/**
 * Рубашка в DOM (слепая зона и т.д.). Если передана карта с листа Курош хана — та же рубашка, что на столе.
 */
export function applyGodCardBackSpriteCss(el: HTMLElement, referenceDef?: GodCardDef): void {
  const sheet = referenceDef?.sprite.sheet ?? SHEET_CASTILIA_ABYSS;
  const { cols, rows, backCol, backRow } = godSpriteSheetBackFor(sheet);
  el.style.backgroundImage = `url("${sheet}")`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  const xPct = cols <= 1 ? 0 : (backCol / (cols - 1)) * 100;
  const yPct = rows <= 1 ? 0 : (backRow / (rows - 1)) * 100;
  el.style.backgroundPosition = `${xPct}% ${yPct}%`;
}

export function godCardAriaLabel(def: GodCardDef): string {
  const cost =
    def.crystalCost !== undefined ? `, красные кристаллы ${def.crystalCost}` : '';
  return `${def.title}${cost}`;
}
