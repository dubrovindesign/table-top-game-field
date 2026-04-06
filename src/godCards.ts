/**
 * God cards catalog — drag from army panel to the table; faces from a shared sprite sheet.
 * Лист 7×5: 33 карты в каталоге + пустая ячейка + рубашка (не в данных).
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
  /** Factions that see this card in the army panel (`faction.id` from `src/catalog/factions.json`). */
  factionIds: string[];
  sprite: GodCardSpriteCell;
  /** Future: faith crystal cost when playing the card (not deducted yet). */
  crystalCost?: number;
};

/** On-table god card(s): single or stacked deck (`ids` bottom → top). */
export type GodTablePiece =
  | { kind: 'single'; id: string; world: { x: number; y: number }; faceUp: boolean }
  | { kind: 'deck'; ids: string[]; world: { x: number; y: number }; faceUp: boolean };

/** Grid dimensions листа (рубашка в (6,4), пустая (5,4)). */
export const GOD_CARD_SPRITE_GRID_COLS = 7;
export const GOD_CARD_SPRITE_GRID_ROWS = 5;

const SHEET_CASTILIA_ABYSS = '/god-cards-castilia-abyss.jpg';

const castillaFaction = 'castilla';
const chasmFaction = 'chasm';

/** a = Бездна (Отрадье), c = Кастилия (Белая) — по подписям на листе. */
type Fc = 'a' | 'c';

function factionsFor(fc: Fc): string[] {
  return fc === 'a' ? [chasmFaction] : [castillaFaction];
}

/**
 * Все 33 картинки на листе (каждая ячейка — отдельная запись; дубликаты арта — свои col/row).
 * Ряд/колонка 0-based. Пропуск: (5,4) пусто, (6,4) рубашка.
 */
const SHEET_ROWS: readonly (readonly [string, number, Fc][])[] = [
  // row 0
  [
    ['Адское Пламя', 15, 'a'],
    ['Сфера Огня', 5, 'a'],
    ['Безумие', 7, 'c'],
    ['Слово Войны', 5, 'c'],
    ['Огненный Дождь', 10, 'a'],
    ['Сломать Доспех', 2, 'c'],
    ['Щит Огня', 3, 'c'],
  ],
  // row 1
  [
    ['Слепота', 2, 'c'],
    ['Разлом', 5, 'a'],
    ['Пламенная Земля', 3, 'a'],
    ['Сломать Доспех', 2, 'c'],
    ['Щит Огня', 3, 'c'],
    ['Слепота', 2, 'c'],
    ['Разлом', 5, 'a'],
  ],
  // row 2
  [
    ['Пламенная Земля', 3, 'a'],
    ['Боевая Ярость', 2, 'a'],
    ['Возгорание', 2, 'a'],
    ['Течение Хаоса', 3, 'a'],
    ['Клинки Пламени', 5, 'a'],
    ['Луч Хаоса', 3, 'a'],
    ['Ускорение', 2, 'a'],
  ],
  // row 3
  [
    ['Боевая Ярость', 2, 'a'],
    ['Возгорание', 2, 'a'],
    ['Течение Хаоса', 3, 'a'],
    ['Клинки Пламени', 5, 'a'],
    ['Луч Хаоса', 3, 'a'],
    ['Ускорение', 2, 'a'],
    ['Боевая Ярость', 2, 'a'],
  ],
  // row 4 — только 5 карт; (5,4) пусто, (6,4) рубашка
  [
    ['Возгорание', 2, 'a'],
    ['Течение Хаоса', 3, 'a'],
    ['Клинки Пламени', 5, 'a'],
    ['Луч Хаоса', 3, 'a'],
    ['Ускорение', 2, 'a'],
  ],
] as const;

function buildGodCardsFromSheet(): GodCardDef[] {
  const out: GodCardDef[] = [];
  for (let row = 0; row < SHEET_ROWS.length; row++) {
    const cells = SHEET_ROWS[row]!;
    for (let col = 0; col < cells.length; col++) {
      const [title, cost, fc] = cells[col]!;
      out.push({
        id: `god_sheet_r${row}c${col}`,
        title,
        text: 'Правила на карточке.',
        tags: ['utility'],
        factionIds: factionsFor(fc),
        crystalCost: cost,
        sprite: { sheet: SHEET_CASTILIA_ABYSS, col, row },
      });
    }
  }
  return out;
}

export const GOD_CARDS: GodCardDef[] = buildGodCardsFromSheet();

const byId = new Map<string, GodCardDef>(GOD_CARDS.map((c) => [c.id, c]));

const sheetImages = new Map<string, HTMLImageElement>();

export function getGodCardById(id: string): GodCardDef | undefined {
  return byId.get(id);
}

export function godCardsForFaction(factionId: string): GodCardDef[] {
  return GOD_CARDS.filter((c) => c.factionIds.includes(factionId));
}

export function uniqueGodCardSpriteSheetUrls(): string[] {
  return [...new Set(GOD_CARDS.map((c) => c.sprite.sheet))];
}

/** Source rectangle in pixels for `drawImage` (uniform grid). */
export function godCardSpriteSourcePixels(
  def: GodCardDef,
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const cols = GOD_CARD_SPRITE_GRID_COLS;
  const rows = GOD_CARD_SPRITE_GRID_ROWS;
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
  const cols = GOD_CARD_SPRITE_GRID_COLS;
  const rows = GOD_CARD_SPRITE_GRID_ROWS;
  const { col, row } = def.sprite;
  el.style.backgroundImage = `url("${def.sprite.sheet}")`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  const xPct = cols <= 1 ? 0 : (col / (cols - 1)) * 100;
  const yPct = rows <= 1 ? 0 : (row / (rows - 1)) * 100;
  el.style.backgroundPosition = `${xPct}% ${yPct}%`;
}

export function godCardAriaLabel(def: GodCardDef): string {
  const cost =
    def.crystalCost !== undefined ? `, красные кристаллы ${def.crystalCost}` : '';
  return `${def.title}${cost}`;
}
