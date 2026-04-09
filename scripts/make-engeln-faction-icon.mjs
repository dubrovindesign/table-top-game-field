#!/usr/bin/env node
/** Иконка фракции Ангельн: вымпел как у остальных (альфа с castilla), текстура с баннера первой ячейки engeln-front. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePennantIcon } from './make-pennant-faction-icon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** Левый баннер в ячейке (0,0) сетки 7×3 на public/engeln-front.jpg */
const ENGELN_BANNER_EXTRACT = { left: 0, top: 85, width: 165, height: 1249 };

async function main() {
  await makePennantIcon({
    templatePath: path.join(repoRoot, 'public', 'castilla.webp'),
    sourcePath: path.join(repoRoot, 'public', 'engeln-front.jpg'),
    extract: ENGELN_BANNER_EXTRACT,
    outPath: path.join(repoRoot, 'public', 'engeln.webp'),
  });
  console.log('[engeln-icon] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
