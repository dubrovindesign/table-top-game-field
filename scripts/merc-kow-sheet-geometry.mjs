/**
 * Лист наёмников KoW: **4×2 слота** (индекс слота 0…7, row-major: ряд×4+колонка).
 * Заполнены слоты **0–5**: первый ряд 0–3 (четыре карты), второй ряд слоты 4–5 (два юнита), слоты 6–7 пустые.
 */

/** Порядок юнитов на листе = индексы слотов слева направо, сверху вниз (только занятые). */
export const MERC_KOW_SHEET_CELL_INDICES = [0, 1, 2, 3, 4, 5];

export const MERC_KOW_UNIT_COUNT = MERC_KOW_SHEET_CELL_INDICES.length;

const COLS = 4;

/**
 * Прямоугольник по индексу слота 0…7.
 */
export function cellRectMercKowSlot(sheetSlotIndex, vLines, hLines) {
  const row = Math.floor(sheetSlotIndex / COLS);
  const col = sheetSlotIndex % COLS;
  const left = vLines[col];
  const right = vLines[col + 1];
  const top = hLines[row];
  const bottom = hLines[row + 1];
  return { left, top, width: right - left, height: bottom - top };
}

export function cellRectMercKowSheetIndex(sheetSlotIndex, vLines, hLines) {
  return cellRectMercKowSlot(sheetSlotIndex, vLines, hLines);
}

export function cellRectMercKowUnit(unitOrderIndex, vLines, hLines) {
  const sheetSlotIndex = MERC_KOW_SHEET_CELL_INDICES[unitOrderIndex];
  if (sheetSlotIndex === undefined) {
    throw new Error(`merc-kow: нет ячейки для unitOrderIndex ${unitOrderIndex}`);
  }
  return cellRectMercKowSlot(sheetSlotIndex, vLines, hLines);
}
