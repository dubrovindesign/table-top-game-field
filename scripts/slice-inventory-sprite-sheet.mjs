/**
 * One-off / repeatable: slice public/itmes.jpg (7×4 grid) into public/inventory/*.jpg
 * and print inventory entry stubs. Run: node scripts/slice-inventory-sprite-sheet.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'public', 'itmes.jpg');
const outDir = path.join(root, 'public', 'inventory');

/** Row-major 7×4. Skip empty cell and card back (last row). */
const CELL_NAMES = [
  'Доспех «Благословение Опсора»',
  'Укреплённый Львиный Щит',
  'Меч «Молниеносец»',
  'Прислужник из Бездны',
  'Защитная Печать Пламени',
  'Посох «Сердце Пламени»',
  'Секира «Жатва Леса»',
  'Метка Дикой Ярости',
  'Амулет «Благословение Леса»',
  'Меч «Чемпион Десписа»',
  'Бронебойные Снаряды',
  'Укреплённый Некро-конь',
  'Зелье Исцеления Ран',
  'Печать Крыльев Бездны',
  'Зелье Мороза',
  'Противоядие',
  'Согревающее Зелье',
  'Зелье Воли',
  'Зелье Ясности',
  'Печать Истовой Веры',
  'Эфирный Компас Экспедитора',
  'Кольцо Покрова',
  'Карты Судьбы',
  'Амулет Божественного Взора',
  'Пояс Силы',
  'Граната Хаоса',
];

const COLS = 7;
const ROWS = 4;

function cellBounds(col, row, totalW, totalH) {
  const left = Math.floor((col * totalW) / COLS);
  const right = Math.floor(((col + 1) * totalW) / COLS);
  const top = Math.floor((row * totalH) / ROWS);
  const bottom = Math.floor(((row + 1) * totalH) / ROWS);
  return { left, top, width: right - left, height: bottom - top };
}

function slugId(index) {
  const n = String(index + 1).padStart(2, '0');
  return `inv-sheet-${n}`;
}

async function main() {
  if (!fs.existsSync(srcPath)) {
    console.error('Missing', srcPath);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const meta = await sharp(srcPath).metadata();
  const { width: W, height: H } = meta;
  if (!W || !H) throw new Error('No dimensions');

  const entries = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      if (idx >= CELL_NAMES.length) continue;

      const { left, top, width, height } = cellBounds(col, row, W, H);
      const id = slugId(idx);
      const filename = `${id}.jpg`;
      const dest = path.join(outDir, filename);

      await sharp(srcPath).extract({ left, top, width, height }).jpeg({ quality: 92 }).toFile(dest);

      const name = CELL_NAMES[idx];
      entries.push({
        id,
        name,
        points: 0,
        sprite: `/inventory/${filename}`,
        maxCopies: 99,
      });
    }
  }

  const jsonPath = path.join(root, 'src', 'catalog', 'inventory.json');
  fs.writeFileSync(jsonPath, JSON.stringify(Object.fromEntries(entries.map((e) => [e.id, e])), null, 2) + '\n', 'utf8');

  console.log(`Wrote ${entries.length} tiles to ${path.relative(root, outDir)}`);
  console.log(`Updated ${path.relative(root, jsonPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
