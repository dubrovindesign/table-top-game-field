/**
 * Проверка пары листов наёмников: лицо обычно темнее в верхней половине ячейки, чем оборот
 * (иллюстрация vs светлый фон правил). Имена файлов в репозитории — канон: front = лицо, back = оборот.
 * См. hex-board-faction-sheet §1 (не доверять имени слепо — при сомнении смотреть сэмплы).
 */
import sharp from 'sharp';
import { MERC_KOW_SHEET_CELL_INDICES, cellRectMercKowSheetIndex } from './merc-kow-sheet-geometry.mjs';
import { inferMercKowGridFromFrontPath } from './merc-kow-infer-grid.mjs';

function luminanceAt(data, w, x, y) {
  const i = (y * w + x) * 3;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

async function cellTopHalfMeanLum(path, sheetIndex, vLines, hLines) {
  const r = cellRectMercKowSheetIndex(sheetIndex, vLines, hLines);
  const { data, info } = await sharp(path)
    .extract(r)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const th = Math.max(4, Math.floor(h * 0.5));
  let sum = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(w / 100));
  for (let y = 0; y < th; y += 2) {
    for (let x = 0; x < w; x += step) {
      sum += luminanceAt(data, w, x, y);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Логирует статистику: в скольких ячейках верхняя половина «лица» темнее, чем у оборота.
 * Не меняет пути — split/scroll всегда используют mercenaries-kow-front / mercenaries-kow-back как канон.
 */
export async function verifyMercKowCanonicalSides(pathFront, pathBack) {
  const { vLines, hLines } = await inferMercKowGridFromFrontPath(pathFront);
  let darkerFrontCount = 0;
  const n = MERC_KOW_SHEET_CELL_INDICES.length;
  for (let i = 0; i < n; i++) {
    const idx = MERC_KOW_SHEET_CELL_INDICES[i];
    const [lumF, lumB] = await Promise.all([
      cellTopHalfMeanLum(pathFront, idx, vLines, hLines),
      cellTopHalfMeanLum(pathBack, idx, vLines, hLines),
    ]);
    if (lumF < lumB) darkerFrontCount++;
  }
  const pct = (100 * darkerFrontCount) / n;
  console.log(
    `[merc-kow-sides] верхняя половина ячеек: лицо темнее оборота в ${darkerFrontCount}/${n} (${pct.toFixed(0)}%) — ожидается большинство при верных файлах.`,
  );
  if (darkerFrontCount < n * 0.4) {
    console.warn(
      '[merc-kow-sides] Подозрение на перепутанные листы: проверьте визуально mercenaries-kow-front.jpg (портреты) и mercenaries-kow-back.jpg (правила).',
    );
  }
}
