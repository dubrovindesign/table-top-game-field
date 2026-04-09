#!/usr/bin/env node
/**
 * Одиночная пара «лицо + оборот» → public/catalog-units/<id>/
 * Склейка как у build-priory-pairs-from-png.mjs / ingest-engeln-tornscape-pairs.mjs
 *
 * --ocr  Распознать ОЗ, шаг/бег, защиту и грубо первую атаку (Tesseract), записать в
 *        src/catalog/units/<id>.json и выставить два хотспота «как Торкемад Прелат»:
 *        защита + первая атака из карточки.
 *
 * Примеры:
 *   npx tsx scripts/ingest-unit-card-pair.ts -f ./face.png -b ./back.jpg -i castilla-foo --ocr
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestTornscapeCardPair } from './tornscapePairIngestCore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

type Args = {
  front: string | null;
  back: string | null;
  unitId: string | null;
  name: string | null;
  list: string | null;
  maxEdge: number;
  noHotspot: boolean;
  dryRun: boolean;
  help?: boolean;
  ocr: boolean;
  noTorKemadTemplate: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    front: null,
    back: null,
    unitId: null,
    name: null,
    list: null,
    maxEdge: 4096,
    noHotspot: false,
    dryRun: false,
    ocr: false,
    noTorKemadTemplate: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--front' || a === '-f') {
      out.front = next ?? null;
      i++;
    } else if (a === '--back' || a === '-b') {
      out.back = next ?? null;
      i++;
    } else if (a === '--unit-id' || a === '-i') {
      out.unitId = next ?? null;
      i++;
    } else if (a === '--name' || a === '-n') {
      out.name = next ?? null;
      i++;
    } else if (a === '--list' || a === '-l') {
      out.list = next ?? null;
      i++;
    } else if (a === '--max-edge') {
      out.maxEdge = Number(next);
      i++;
    } else if (a === '--no-hotspot-update') {
      out.noHotspot = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--ocr') {
      out.ocr = true;
    } else if (a === '--no-tor-kemad-template') {
      out.noTorKemadTemplate = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function normalizeCardName(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

async function loadAllUnitsCardNames() {
  const dir = path.join(repoRoot, 'src', 'catalog', 'units');
  const names: { id: string; name: string; rawName: string }[] = [];
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    const raw = await fs.readFile(path.join(dir, f), 'utf8');
    try {
      const j = JSON.parse(raw) as { card?: { name?: string } };
      const cn = j?.card?.name;
      if (typeof cn === 'string') {
        names.push({ id, name: normalizeCardName(cn), rawName: cn });
      }
    } catch {
      /* skip */
    }
  }
  return names;
}

export function findUnitIdByName(entries: { id: string; name: string }[], query: string) {
  const q = normalizeCardName(query);
  const exact = entries.filter((e) => e.name === q);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) {
    throw new Error(
      `[ingest-unit-card-pair] Несколько юнитов с card.name «${q}»: ${exact.map((e) => e.id).join(', ')}`,
    );
  }
  const sub = entries.filter((e) => e.name.includes(q) || q.includes(e.name));
  if (sub.length === 1) return sub[0].id;
  if (sub.length > 1) {
    throw new Error(
      `[ingest-unit-card-pair] Неоднозначно по подстроке «${q}»: ${sub.map((e) => `${e.id} («${e.name}»)`).join('; ')}.`,
    );
  }
  throw new Error(`[ingest-unit-card-pair] Нет юнита с card.name «${q}».`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  npx tsx scripts/ingest-unit-card-pair.ts --front <path> --back <path> (--unit-id <slug> | --name "<card.name>")
  Options:
    --ocr              Распознать статы с картинок (Tesseract), обновить units JSON и хотспоты
    --no-tor-kemad-template  При --ocr: не ставить две полосы «Торкемад», а только пересчитать старые зоны
    --max-edge <px>    Даунскейл (по умолчанию 4096; 0 = не ограничивать)
    --no-hotspot-update
    --dry-run
    --list <substring>
`);
    return;
  }

  const catalog = await loadAllUnitsCardNames();

  if (args.list != null) {
    const q = args.list.toLowerCase();
    const hits = catalog.filter((e) => e.name.toLowerCase().includes(q));
    hits.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    for (const e of hits) {
      console.log(`${e.id}\t${e.name}`);
    }
    console.log(`[ingest-unit-card-pair] Найдено: ${hits.length}`);
    return;
  }

  if (!args.front || !args.back) {
    console.error('Задайте --front и --back (или --help).');
    process.exit(1);
  }

  let unitId = args.unitId;
  if (!unitId && args.name) {
    unitId = findUnitIdByName(catalog, args.name);
    console.log(`[ingest-unit-card-pair] unit-id по имени: ${unitId}`);
  }
  if (!unitId) {
    console.error('Укажите --unit-id или --name.');
    process.exit(1);
  }

  const unitJsonPath = path.join(repoRoot, 'src', 'catalog', 'units', `${unitId}.json`);
  try {
    await fs.access(unitJsonPath);
  } catch {
    console.error(`Нет файла каталога: ${unitJsonPath}`);
    process.exit(1);
  }

  const frontAbs = path.isAbsolute(args.front) ? args.front : path.join(process.cwd(), args.front);
  const backAbs = path.isAbsolute(args.back) ? args.back : path.join(process.cwd(), args.back);
  await fs.access(frontAbs).catch(() => {
    throw new Error(`Нет файла лица: ${frontAbs}`);
  });
  await fs.access(backAbs).catch(() => {
    throw new Error(`Нет файла оборота: ${backAbs}`);
  });

  if (args.dryRun) {
    await ingestTornscapeCardPair({
      repoRoot,
      frontAbs,
      backAbs,
      unitId,
      maxEdge: Number.isFinite(args.maxEdge) ? args.maxEdge : 4096,
      ocr: args.ocr,
      noHotspot: args.noHotspot,
      noTorKemadTemplate: args.noTorKemadTemplate,
      dryRun: true,
    });
    return;
  }

  const maxEdge = Number.isFinite(args.maxEdge) ? args.maxEdge : 4096;

  await ingestTornscapeCardPair({
    repoRoot,
    frontAbs,
    backAbs,
    unitId,
    maxEdge,
    ocr: args.ocr,
    noHotspot: args.noHotspot,
    noTorKemadTemplate: args.noTorKemadTemplate,
    dryRun: false,
  });

  console.log('[ingest-unit-card-pair] Готово. npm run catalog:bundle && npm run build');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
