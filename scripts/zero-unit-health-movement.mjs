#!/usr/bin/env node
/**
 * Sets card.health, card.maxHealth, card.walk, card.run to 0 for every unit in src/catalog/units.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unitsDir = path.join(__dirname, '..', 'src', 'catalog', 'units');

async function main() {
  const names = await fs.readdir(unitsDir);
  let n = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const fp = path.join(unitsDir, name);
    const data = JSON.parse(await fs.readFile(fp, 'utf8'));
    if (!data.card || typeof data.card !== 'object') {
      console.warn(`[zero-unit-health-movement] skip (no card): ${name}`);
      continue;
    }
    data.card.health = 0;
    data.card.maxHealth = 0;
    data.card.walk = 0;
    data.card.run = 0;
    await fs.writeFile(fp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    n += 1;
  }
  console.log(`[zero-unit-health-movement] updated ${n} unit file(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
