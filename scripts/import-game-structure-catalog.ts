/**
 * Полная миграция каталога из tools/parsing/game-structure.json + папки ассетов (--root).
 * Генерирует factions.json, leaders.json, inventory.json, units/*.json, hotspots (через ingest),
 * src/catalog/god-cards.json, копирует spells/equipment в public/images/.
 *
 * Примеры:
 *   npx tsx scripts/import-game-structure-catalog.ts --root "D:/Downloads/parsing"
 *   npx tsx scripts/import-game-structure-catalog.ts --root "D:/Downloads/parsing" --ocr
 *   Только склейка+OCR для одной фракции (без перезаписи JSON каталога):
 *   npx tsx scripts/import-game-structure-catalog.ts --ingest-only --ocr --ocr-faction blackthorn
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Domain } from '../src/unitCard';
import type { CatalogUnitDef, FactionDef, InventoryItemDef, LeaderDef, RosterSlotDef } from '../src/catalog/types';
import type { UnitCardData } from '../src/unitCard';
import { ingestTornscapeCardPair } from './tornscapePairIngestCore';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

type GameHero = {
  id: number;
  tech_name: string;
  name: string;
  name_ru: string;
  point_cost: number;
  image_path: string;
  card_image_path: string;
  card_back_image_path: string;
  available_spells: Array<{
    id: number;
    tech_name: string;
    name: string;
    name_ru: string;
    name_en?: string;
    /** Сколько копий заклинания в колоде лидера (Game Structure). Без поля — 1. */
    quantity?: number;
    image_path: string;
    domain_name?: string;
  }>;
  available_equipment: Array<{
    id: number;
    tech_name: string;
    name: string;
    name_ru: string;
    point_cost: number;
    image_path: string;
  }>;
  available_units: Array<{
    id: number;
    tech_name: string;
    name: string;
    name_ru: string;
    /** Макс. копий юнита в армии этого героя (Game Structure). Без поля — 99. */
    quantity?: number;
    point_cost: number;
    image_path: string;
    card_image_path: string;
    card_back_image_path: string;
  }>;
};

type GameStructure = {
  domains: Array<{
    id: number;
    tech_name: string;
    name: string;
    factions: Array<{
      id: number;
      tech_name: string;
      name: string;
      image_path: string;
      heroes: GameHero[];
    }>;
  }>;
};

function parseArgs(argv: string[]) {
  let assetRoot = 'D:/Downloads/parsing';
  let ocr = false;
  let skipIngest = false;
  let clear = true;
  let maxEdge = 4096;
  let onlyGodCards = false;
  let ingestOnly = false;
  let ocrFaction: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--root' && n) {
      assetRoot = n;
      i++;
    } else if (a === '--ocr') ocr = true;
    else if (a === '--skip-ingest') skipIngest = true;
    else if (a === '--no-clear') clear = false;
    else if (a === '--only-god-cards') onlyGodCards = true;
    else if (a === '--ingest-only') ingestOnly = true;
    else if (a === '--ocr-faction' && n) {
      ocrFaction = n;
      i++;
    } else if (a === '--max-edge' && n) {
      maxEdge = Number(n);
      i++;
    }
  }
  return {
    assetRoot: path.normalize(assetRoot),
    ocr,
    skipIngest,
    clear,
    maxEdge,
    onlyGodCards,
    ingestOnly,
    ocrFaction,
  };
}

function jsonPathToAbs(assetRoot: string, p: string): string {
  const rel = p.startsWith('/') ? p.slice(1) : p;
  return path.join(assetRoot, rel.split('/').join(path.sep));
}

function buildUniqueIngestList(
  gs: GameStructure,
  assetRoot: string,
): { unitId: string; front: string; back: string }[] {
  const ingestList: { unitId: string; front: string; back: string }[] = [];
  for (const domain of gs.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        const leaderId = `${faction.tech_name}-${hero.tech_name}`;
        ingestList.push({
          unitId: leaderId,
          front: jsonPathToAbs(assetRoot, hero.card_image_path),
          back: jsonPathToAbs(assetRoot, hero.card_back_image_path),
        });
        for (const u of hero.available_units) {
          const uid = `${faction.tech_name}-${u.tech_name}`;
          ingestList.push({
            unitId: uid,
            front: jsonPathToAbs(assetRoot, u.card_image_path),
            back: jsonPathToAbs(assetRoot, u.card_back_image_path),
          });
        }
      }
    }
  }
  const seen = new Set<string>();
  const uniqueIngest: typeof ingestList = [];
  for (const row of ingestList) {
    if (seen.has(row.unitId)) continue;
    seen.add(row.unitId);
    uniqueIngest.push(row);
  }
  return uniqueIngest;
}

async function runCardIngest(opts: {
  repoRoot: string;
  uniqueIngest: { unitId: string; front: string; back: string }[];
  maxEdge: number;
  ocr: boolean;
  ocrFaction?: string;
}) {
  const { repoRoot, uniqueIngest, maxEdge, ocr, ocrFaction } = opts;
  const prefix = ocrFaction && ocrFaction.trim() !== '' ? `${ocrFaction.trim()}-` : null;
  if (prefix) {
    console.log(`[import-game-structure] ingest только unitId с префиксом: ${prefix}`);
  }
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (const { unitId, front, back } of uniqueIngest) {
    if (prefix && !unitId.startsWith(prefix)) {
      skipped++;
      continue;
    }
    if (!(await pathExists(front))) {
      console.warn(`[import-game-structure] нет лица: ${unitId} → ${front}`);
      fail++;
      continue;
    }
    if (!(await pathExists(back))) {
      console.warn(`[import-game-structure] нет оборота: ${unitId} → ${back}`);
      fail++;
      continue;
    }
    try {
      await ingestTornscapeCardPair({
        repoRoot,
        frontAbs: front,
        backAbs: back,
        unitId,
        maxEdge: Number.isFinite(maxEdge) ? maxEdge : 4096,
        ocr,
        noHotspot: false,
        noTorKemadTemplate: false,
        dryRun: false,
      });
      ok++;
    } catch (e) {
      console.error(`[import-game-structure] ingest ${unitId}:`, e);
      fail++;
    }
  }
  if (prefix) {
    console.log(`[import-game-structure] Ingest: ok=${ok} fail=${fail} skipped=${skipped} ocr=${ocr}`);
  } else {
    console.log(`[import-game-structure] Ingest: ok=${ok} fail=${fail} ocr=${ocr}`);
  }
}

function domainToCanon(tech: string): Domain {
  const d = tech.trim();
  if (d === 'creation' || d === 'destruction' || d === 'life' || d === 'death') return d;
  throw new Error(`[import-game-structure] неизвестный домен: ${tech}`);
}

function stubCard(opts: {
  name: string;
  domain: Domain;
  factionDisplayName: string;
  flagSprite: string;
  catalogUnitId: string;
}): UnitCardData {
  return {
    name: opts.name,
    size: 'small',
    health: 1,
    maxHealth: 1,
    defense: { white: 0, green: 0 },
    defenseReaction: { white: 0, green: 0 },
    walk: 1,
    run: 2,
    domains: [opts.domain],
    concentration: { red: 0, green: 0, black: 0, white: 0 },
    exploration: { red: 0, green: 0, black: 0, white: 0 },
    explorationRange: 0,
    grabRange: 1,
    attacks: [
      {
        name: '—',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 1,
        dice: { red: 1, green: 0, black: 0, white: 0 },
      },
    ],
    keywords: [opts.factionDisplayName],
    flagSprite: opts.flagSprite,
    catalogUnitId: opts.catalogUnitId,
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function clearCatalogDirs() {
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
  for (const dir of [unitsDir, hsDir]) {
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      await fs.unlink(path.join(dir, n));
    }
  }
  console.log('[import-game-structure] Очищены src/catalog/units и hotspots');
}

async function copyTreeIfExists(from: string, to: string) {
  if (!(await pathExists(from))) {
    console.warn(`[import-game-structure] пропуск копирования (нет источника): ${from}`);
    return;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
  console.log(`[import-game-structure] Скопировано: ${from} → ${to}`);
}

async function writeGodCardsJson(gs: GameStructure) {
  const spellsByNumericId = new Map<
    number,
    { row: GameHero['available_spells'][0]; copiesByLeader: Map<string, number> }
  >();
  for (const domain of gs.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        const leaderId = `${faction.tech_name}-${hero.tech_name}`;
        for (const s of hero.available_spells) {
          const qtyRaw = s.quantity;
          const qty =
            qtyRaw === undefined || qtyRaw === null
              ? 1
              : Math.max(0, Math.floor(Number(qtyRaw)));
          let e = spellsByNumericId.get(s.id);
          if (!e) {
            e = { row: s, copiesByLeader: new Map() };
            spellsByNumericId.set(s.id, e);
          }
          const prev = e.copiesByLeader.get(leaderId) ?? 0;
          e.copiesByLeader.set(leaderId, Math.max(prev, qty));
        }
      }
    }
  }
  const godCards: Array<{
    id: string;
    title: string;
    text: string;
    tags: Array<'heal' | 'damage' | 'slow' | 'buff' | 'debuff' | 'utility'>;
    onlyForLeaderIds: string[];
    copiesByLeader?: Record<string, number>;
    sprite: { sheet: string; col: number; row: number };
    spriteGrid: { cols: number; rows: number };
  }> = [];
  for (const [sid, { row, copiesByLeader }] of spellsByNumericId) {
    const id = `god-spell-${sid}`;
    const leaderEntries = [...copiesByLeader.entries()].filter(([, n]) => n > 0);
    const copiesRecord: Record<string, number> = {};
    for (const [lid, n] of leaderEntries.sort(([a], [b]) => a.localeCompare(b))) {
      copiesRecord[lid] = n;
    }
    godCards.push({
      id,
      title: row.name_ru || row.name,
      text: row.name_en != null && row.name_en !== '' ? String(row.name_en) : '',
      tags: ['utility'],
      onlyForLeaderIds: leaderEntries.map(([lid]) => lid).sort((a, b) => a.localeCompare(b)),
      ...(Object.keys(copiesRecord).length > 0 ? { copiesByLeader: copiesRecord } : {}),
      sprite: { sheet: toPublicUrl(row.image_path), col: 0, row: 0 },
      spriteGrid: { cols: 1, rows: 1 },
    });
  }
  godCards.sort((a, b) => a.id.localeCompare(b.id));
  const outPath = path.join(repoRoot, 'src', 'catalog', 'god-cards.json');
  await fs.writeFile(outPath, JSON.stringify(godCards, null, 2) + '\n', 'utf8');
  console.log(`[import-game-structure] Карты богов (заклинания): ${godCards.length} → ${outPath}`);
}

async function main() {
  const { assetRoot, ocr, skipIngest, clear, maxEdge, onlyGodCards, ingestOnly, ocrFaction } =
    parseArgs(process.argv);
  const gsPath = path.join(repoRoot, 'tools', 'parsing', 'game-structure.json');
  const raw = await fs.readFile(gsPath, 'utf8');
  const gs = JSON.parse(raw) as GameStructure;

  if (onlyGodCards) {
    await writeGodCardsJson(gs);
    return;
  }

  if (ingestOnly) {
    const uniqueIngest = buildUniqueIngestList(gs, assetRoot);
    await runCardIngest({ repoRoot, uniqueIngest, maxEdge, ocr, ocrFaction });
    return;
  }

  if (clear) await clearCatalogDirs();

  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');

  /** troop / leader unit id → CatalogUnitDef */
  const unitDefs = new Map<string, CatalogUnitDef>();
  /** equipment id → inventory + leaders */
  const equipByNumericId = new Map<
    number,
    { row: GameHero['available_equipment'][0]; leaders: Set<string> }
  >();

  const leadersOut: LeaderDef[] = [];
  const factionsSeen = new Map<string, FactionDef>();

  for (const domain of gs.domains) {
    const dom = domainToCanon(domain.tech_name);
    for (const faction of domain.factions) {
      const flagSprite = `/${faction.tech_name}.webp`;
      factionsSeen.set(faction.tech_name, {
        id: faction.tech_name,
        name: faction.name,
        domain: dom,
        panelIconSrc: flagSprite,
      });

      for (const hero of faction.heroes) {
        const leaderId = `${faction.tech_name}-${hero.tech_name}`;
        const leaderUnitId = leaderId;

        const leaderCard = stubCard({
          name: hero.name_ru || hero.name,
          domain: dom,
          factionDisplayName: faction.name,
          flagSprite,
          catalogUnitId: leaderUnitId,
        });
        unitDefs.set(leaderUnitId, {
          id: leaderUnitId,
          points: hero.point_cost,
          card: leaderCard,
        });

        const roster: RosterSlotDef[] = hero.available_units.map((u) => {
          const qtyRaw = u.quantity;
          const maxCopies =
            qtyRaw === undefined || qtyRaw === null
              ? 99
              : Math.max(0, Math.floor(Number(qtyRaw)));
          return {
            unitId: `${faction.tech_name}-${u.tech_name}`,
            maxCopies,
            points: u.point_cost,
          };
        });

        leadersOut.push({
          id: leaderId,
          name: hero.name_ru || hero.name,
          factionId: faction.tech_name,
          catalogUnitId: leaderUnitId,
          points: hero.point_cost,
          roster,
        });

        for (const u of hero.available_units) {
          const uid = `${faction.tech_name}-${u.tech_name}`;
          const existing = unitDefs.get(uid);
          if (existing && existing.points !== u.point_cost) {
            console.warn(
              `[import-game-structure] расхождение point_cost для ${uid}: было ${existing.points}, встретилось ${u.point_cost} — оставляю первое`,
            );
          }
          if (!existing) {
            unitDefs.set(uid, {
              id: uid,
              points: u.point_cost,
              card: stubCard({
                name: u.name_ru || u.name,
                domain: dom,
                factionDisplayName: faction.name,
                flagSprite,
                catalogUnitId: uid,
              }),
            });
          }
        }

        for (const e of hero.available_equipment) {
          let x = equipByNumericId.get(e.id);
          if (!x) {
            x = { row: e, leaders: new Set() };
            equipByNumericId.set(e.id, x);
          }
          x.leaders.add(leaderId);
        }
      }
    }
  }

  const factionsList: FactionDef[] = [
    ...Array.from(factionsSeen.values()).sort((a, b) => a.id.localeCompare(b.id)),
    {
      id: 'mercenaries',
      name: 'Наёмники',
      domain: 'life',
      panelIconSrc: '/mercenaries.webp',
    },
  ];

  await fs.writeFile(
    path.join(repoRoot, 'src', 'catalog', 'factions.json'),
    JSON.stringify(factionsList, null, 2) + '\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(repoRoot, 'src', 'catalog', 'leaders.json'),
    JSON.stringify(leadersOut, null, 2) + '\n',
    'utf8',
  );

  for (const [, def] of unitDefs) {
    await fs.writeFile(
      path.join(unitsDir, `${def.id}.json`),
      JSON.stringify(def, null, 2) + '\n',
      'utf8',
    );
  }
  console.log(`[import-game-structure] Записано юнитов: ${unitDefs.size}`);

  const inventory: Record<string, InventoryItemDef> = {};
  for (const [eqId, { row, leaders }] of equipByNumericId) {
    const id = `eq-${eqId}-${slugify(row.tech_name)}`;
    inventory[id] = {
      id,
      name: row.name_ru || row.name,
      points: row.point_cost,
      sprite: toPublicUrl(row.image_path),
      onlyForLeaderIds: [...leaders].sort((a, b) => a.localeCompare(b)),
      maxCopies: 99,
    };
  }
  await fs.writeFile(
    path.join(repoRoot, 'src', 'catalog', 'inventory.json'),
    JSON.stringify(inventory, null, 2) + '\n',
    'utf8',
  );
  console.log(`[import-game-structure] Предметы: ${Object.keys(inventory).length}`);

  await writeGodCardsJson(gs);

  const pubSpells = path.join(repoRoot, 'public', 'images', 'spells');
  const pubEq = path.join(repoRoot, 'public', 'images', 'equipment');
  await copyTreeIfExists(path.join(assetRoot, 'images', 'spells'), pubSpells);
  await copyTreeIfExists(path.join(assetRoot, 'images', 'equipment'), pubEq);

  const uniqueIngest = buildUniqueIngestList(gs, assetRoot);

  if (skipIngest) {
    console.log('[import-game-structure] --skip-ingest: без склейки и OCR');
    console.log('[import-game-structure] Готово (stub + JSON). Запустите без --skip-ingest для картинок.');
    return;
  }

  await runCardIngest({ repoRoot, uniqueIngest, maxEdge, ocr, ocrFaction });
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
}

/** JSON пути вида /images/... → те же URL в public */
function toPublicUrl(p: string): string {
  if (!p.startsWith('/')) return `/${p}`;
  return p;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
