/**
 * Обновляет только `maxCopies` в `src/catalog/leaders.json` из game structure
 * (поле `quantity` у `available_units`), без перезаписи юнитов и без полного import.
 *
 *   npx tsx scripts/sync-roster-max-copies.ts
 *   npx tsx scripts/sync-roster-max-copies.ts --game-structure "D:/Downloads/parsing/game_structure.json"
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LeaderDef } from '../src/catalog/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

type GsUnit = { tech_name: string; quantity?: number };
type GsHero = { tech_name: string; available_units: GsUnit[] };
type GsFaction = { tech_name: string; heroes: GsHero[] };
type GameStructure = { domains: Array<{ factions: GsFaction[] }> };

function parseArgs(argv: string[]) {
  let gsPath = path.join(repoRoot, 'tools', 'parsing', 'game-structure.json');
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--game-structure' && n) {
      gsPath = path.normalize(n);
      i++;
    }
  }
  return { gsPath };
}

function maxCopiesFromQuantity(qtyRaw: unknown): number {
  if (qtyRaw === undefined || qtyRaw === null) return 99;
  return Math.max(0, Math.floor(Number(qtyRaw)));
}

/** leaderId → unitId → maxCopies */
function buildRosterCaps(gs: GameStructure): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const domain of gs.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        const leaderId = `${faction.tech_name}-${hero.tech_name}`;
        const m = new Map<string, number>();
        for (const u of hero.available_units ?? []) {
          const unitId = `${faction.tech_name}-${u.tech_name}`;
          m.set(unitId, maxCopiesFromQuantity(u.quantity));
        }
        out.set(leaderId, m);
      }
    }
  }
  return out;
}

async function main() {
  const { gsPath } = parseArgs(process.argv);
  const raw = await fs.readFile(gsPath, 'utf8');
  const gs = JSON.parse(raw) as GameStructure;
  const caps = buildRosterCaps(gs);

  const leadersPath = path.join(repoRoot, 'src', 'catalog', 'leaders.json');
  const leadersRaw = await fs.readFile(leadersPath, 'utf8');
  const leaders = JSON.parse(leadersRaw) as LeaderDef[];

  let updatedSlots = 0;
  let skippedLeaders = 0;

  for (const leader of leaders) {
    const m = caps.get(leader.id);
    if (!m) {
      skippedLeaders++;
      continue;
    }
    for (const slot of leader.roster) {
      const next = m.get(slot.unitId);
      if (next !== undefined && slot.maxCopies !== next) {
        slot.maxCopies = next;
        updatedSlots++;
      }
    }
  }

  await fs.writeFile(leadersPath, JSON.stringify(leaders, null, 2) + '\n', 'utf8');
  console.log(
    `[sync-roster-max-copies] gs=${gsPath} → ${path.relative(repoRoot, leadersPath)}`,
  );
  console.log(`[sync-roster-max-copies] обновлено слотов: ${updatedSlots}, лидеров без данных в GS: ${skippedLeaders}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
