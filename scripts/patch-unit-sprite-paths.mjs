#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');

const files = await fs.readdir(unitsDir);
let n = 0;
for (const f of files) {
  if (!f.endsWith('.json')) continue;
  const id = f.replace(/\.json$/i, '');
  const p = path.join(unitsDir, f);
  let raw = await fs.readFile(p, 'utf8');
  raw = raw.replace(/\}\s*\\n\s*$/s, '}');
  const j = JSON.parse(raw);
  if (!j.card) j.card = {};
  j.card.sprite = `/catalog-units/${id}/image.jpg`;
  j.card.miniatureSprite = `/catalog-units/${id}/miniature.jpg`;
  await fs.writeFile(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  n++;
}
console.log(`[patch-unit-sprite-paths] updated ${n} files`);
