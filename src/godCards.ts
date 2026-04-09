/**
 * God cards catalog — drag from army panel to the table.
 * Данные генерируются из Game Structure: `src/catalog/god-cards.json` (полные изображения, сетка 1×1).
 * Рубашка колоды — `images/spells/card_back.webp` (копируется импортом в `public/`).
 */

import godCardsJson from './catalog/god-cards.json';

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
   * Иначе только перечисленные лидеры (`leader.id` из `leaders.json`).
   */
  onlyForLeaderIds?: string[];
  /**
   * Сколько экземпляров карты в колоде у лидера по умолчанию (из Game Structure: `quantity` у заклинания).
   * Ключ — `leader.id`. Если для лидера нет ключа, используется 1. Переопределяется `godCardPatches.copiesByLeader` в localStorage.
   */
  copiesByLeader?: Record<string, number>;
  sprite: GodCardSpriteCell;
  /**
   * Сетка листа для `sprite`; по умолчанию 7×5 (старый формат).
   */
  spriteGrid?: { cols: number; rows: number };
  /** Future: faith crystal cost when playing the card (not deducted yet). */
  crystalCost?: number;
};

/** On-table god card(s): single or stacked deck (`ids` bottom → top). */
export type GodTablePiece =
  | { kind: 'single'; id: string; world: { x: number; y: number }; faceUp: boolean }
  | { kind: 'deck'; ids: string[]; world: { x: number; y: number }; faceUp: boolean };

/** Значения по умолчанию для сетки, если `spriteGrid` не задан (лист 7×5). */
export const GOD_CARD_SPRITE_GRID_COLS = 7;
export const GOD_CARD_SPRITE_GRID_ROWS = 5;

/** Общая текстура рубашки колоды (одно изображение целиком, из парсинга заклинаний). */
const GOD_DECK_BACK_TEXTURE = '/images/spells/card_back.webp';

export const GOD_CARDS: GodCardDef[] = godCardsJson as unknown as GodCardDef[];

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
  return sheetImages.get(GOD_DECK_BACK_TEXTURE);
}

/** Рубашка для стопки/карты: единая текстура `card_back.webp`. */
export function getGodCardBackSpriteImageForCard(def: GodCardDef | undefined): HTMLImageElement | undefined {
  void def;
  return getGodCardBackSpriteImage();
}

export function godCardBackSpriteSourcePixels(
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: 0, sy: 0, sw: imageWidth, sh: imageHeight };
}

export function godCardBackSpriteSourcePixelsForCard(
  def: GodCardDef | undefined,
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  void def;
  return godCardBackSpriteSourcePixels(imageWidth, imageHeight);
}

/** Load all distinct sprite sheets; safe to call multiple times. */
export function preloadGodCardSpriteSheets(): Promise<void> {
  const urls = uniqueGodCardSpriteSheetUrls();
  const withBack = [...new Set([...urls, GOD_DECK_BACK_TEXTURE])];
  return Promise.all(
    withBack.map(
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

/** Рубашка в DOM (слепая зона и т.д.). */
export function applyGodCardBackSpriteCss(el: HTMLElement, referenceDef?: GodCardDef): void {
  void referenceDef;
  const sheet = GOD_DECK_BACK_TEXTURE;
  el.style.backgroundImage = `url("${sheet}")`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = '100% 100%';
  el.style.backgroundPosition = '0 0';
}

export function godCardAriaLabel(def: GodCardDef): string {
  const cost =
    def.crystalCost !== undefined ? `, красные кристаллы ${def.crystalCost}` : '';
  return `${def.title}${cost}`;
}
