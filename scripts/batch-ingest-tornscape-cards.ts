#!/usr/bin/env node
/**
 * Пакетная обработка пар Tornscape (лицо + оборот) из папки: склейка, OCR, хотспоты.
 *
 * Именование файлов: <anything>_front.webp и <same>_back.webp (или .png/.jpg) в одной папке.
 *
 * 1) Сканирование → черновик манифеста (допишите unitId вручную):
 *    npx tsx scripts/batch-ingest-tornscape-cards.ts --scan "D:/Downloads/parsing/cards" --out scripts/tmp/tornscape-manifest.json
 *
 * 2) Запуск по манифесту (нужны существующие src/catalog/units/<unitId>.json):
 *    npx tsx scripts/batch-ingest-tornscape-cards.ts --root "D:/Downloads/parsing/cards" --manifest scripts/tmp/tornscape-manifest.json --ocr
 *
 * Опции: --limit N, --dry-run, --max-edge 4096, --no-hotspot-update, --no-tor-kemad-template
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestTornscapeCardPair } from './tornscapePairIngestCore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const FRONT_RE = /^(.*)_front\.(webp|png|jpe?g)$/i;

export type TornscapeManifestEntry = {
  /** Обязательно: id юнита в каталоге (файл units/<unitId>.json) */
  unitId: string;
  /** Относительно --root */
  face: string;
  back: string;
  /** Пропустить строку при пакетном прогоне */
  skip?: boolean;
};

export type TornscapeScanRow = {
  prefix: string;
  face: string;
  back: string;
  unitId: '';
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findBackInDir(dirAbs: string, prefix: string): Promise<string | null> {
  const files = await fs.readdir(dirAbs);
  const re = new RegExp(`^${escapeRegExp(prefix)}_back\\.`, 'i');
  const hit = files.find((f) => re.test(f));
  return hit ?? null;
}

/**
 * Рекурсивно ищет *_front.* и сопоставляет *_back.* в той же папке.
 */
export async function scanTornscapeCardFolder(rootAbs: string): Promise<Omit<TornscapeScanRow, 'unitId'>[]> {
  const out: Omit<TornscapeScanRow, 'unitId'>[] = [];

  async function walk(dirAbs: string) {
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dirAbs, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      const m = e.name.match(FRONT_RE);
      if (!m) continue;
      const prefix = m[1];
      const backName = await findBackInDir(dirAbs, prefix);
      if (!backName) {
        const relFace = path.relative(rootAbs, full).replace(/\\/g, '/');
        console.warn(`[batch-tornscape] Нет оборота для ${relFace}`);
        continue;
      }
      const relFace = path.relative(rootAbs, full).replace(/\\/g, '/');
      const relBack = path.relative(rootAbs, path.join(dirAbs, backName)).replace(/\\/g, '/');
      out.push({ prefix, face: relFace, back: relBack });
    }
  }

  await walk(rootAbs);
  out.sort((a, b) => a.face.localeCompare(b.face, 'en'));
  return out;
}

type BatchArgs = {
  root: string | null;
  manifest: string | null;
  scan: string | null;
  out: string | null;
  limit: number;
  ocr: boolean;
  dryRun: boolean;
  maxEdge: number;
  noHotspot: boolean;
  noTorKemadTemplate: boolean;
  help?: boolean;
};

function parseArgs(argv: string[]): BatchArgs {
  const out: BatchArgs = {
    root: null,
    manifest: null,
    scan: null,
    out: null,
    limit: 0,
    ocr: false,
    dryRun: false,
    maxEdge: 4096,
    noHotspot: false,
    noTorKemadTemplate: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--root' || a === '-r') {
      out.root = next ?? null;
      i++;
    } else if (a === '--manifest' || a === '-m') {
      out.manifest = next ?? null;
      i++;
    } else if (a === '--scan' || a === '-s') {
      out.scan = next ?? null;
      i++;
    } else if (a === '--out' || a === '-o') {
      out.out = next ?? null;
      i++;
    } else if (a === '--limit') {
      out.limit = Math.max(0, parseInt(next ?? '0', 10) || 0);
      i++;
    } else if (a === '--ocr') {
      out.ocr = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--max-edge') {
      out.maxEdge = parseInt(next ?? '4096', 10);
      i++;
    } else if (a === '--no-hotspot-update') {
      out.noHotspot = true;
    } else if (a === '--no-tor-kemad-template') {
      out.noTorKemadTemplate = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function resolveUnderRoot(rootAbs: string, relOrAbs: string) {
  if (path.isAbsolute(relOrAbs)) return relOrAbs;
  return path.join(rootAbs, relOrAbs);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  Сканирование (черновик манифеста с пустыми unitId):
    npx tsx scripts/batch-ingest-tornscape-cards.ts --scan <папка> --out <manifest.json>

  Пакетный ingest:
    npx tsx scripts/batch-ingest-tornscape-cards.ts --root <папка_с_картинками> --manifest <manifest.json> [--ocr]

  Манифест: JSON-массив { "unitId": "faction-slug", "face": "rel/path_front.webp", "back": "rel/path_back.webp", "skip": false }
`);
    return;
  }

  if (args.scan) {
    const scanAbs = path.isAbsolute(args.scan) ? args.scan : path.join(process.cwd(), args.scan);
    await fs.access(scanAbs).catch(() => {
      throw new Error(`[batch-tornscape] Нет папки: ${scanAbs}`);
    });
    const rows = await scanTornscapeCardFolder(scanAbs);
    const manifest: TornscapeManifestEntry[] = rows.map((r) => ({
      unitId: '',
      face: r.face,
      back: r.back,
      skip: false,
    }));
    const json = JSON.stringify(manifest, null, 2) + '\n';
    if (args.out) {
      const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, json, 'utf8');
      console.log(`[batch-tornscape] Записано ${manifest.length} пар → ${outPath}`);
      console.log('[batch-tornscape] Допишите unitId в каждой строке, затем запустите с --root и --manifest.');
    } else {
      process.stdout.write(json);
      console.error(`[batch-tornscape] Найдено пар: ${manifest.length} (используйте --out для записи в файл)`);
    }
    return;
  }

  if (!args.manifest || !args.root) {
    console.error('Укажите --root и --manifest, или --scan (см. --help).');
    process.exit(1);
  }

  const rootAbs = path.isAbsolute(args.root) ? args.root : path.join(process.cwd(), args.root);
  await fs.access(rootAbs).catch(() => {
    throw new Error(`[batch-tornscape] Нет папки: ${rootAbs}`);
  });

  const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.join(process.cwd(), args.manifest);
  const raw = await fs.readFile(manifestPath, 'utf8');
  const entries = JSON.parse(raw) as TornscapeManifestEntry[];
  if (!Array.isArray(entries)) {
    throw new Error('[batch-tornscape] Манифест должен быть JSON-массивом');
  }

  let list = entries.filter((e) => !e.skip && e.unitId && String(e.unitId).trim());
  if (args.limit > 0) {
    list = list.slice(0, args.limit);
  }

  console.log(`[batch-tornscape] К обработке: ${list.length} (из ${entries.length} в файле)`);

  let ok = 0;
  let fail = 0;
  for (const row of list) {
    const faceAbs = resolveUnderRoot(rootAbs, row.face);
    const backAbs = resolveUnderRoot(rootAbs, row.back);
    try {
      await fs.access(faceAbs);
      await fs.access(backAbs);
    } catch {
      console.error(`[batch-tornscape] Пропуск (нет файлов): ${row.unitId} ${row.face}`);
      fail++;
      continue;
    }

    try {
      await ingestTornscapeCardPair({
        repoRoot,
        frontAbs: faceAbs,
        backAbs: backAbs,
        unitId: row.unitId.trim(),
        maxEdge: Number.isFinite(args.maxEdge) ? args.maxEdge : 4096,
        ocr: args.ocr,
        noHotspot: args.noHotspot,
        noTorKemadTemplate: args.noTorKemadTemplate,
        dryRun: args.dryRun,
      });
      ok++;
    } catch (e) {
      fail++;
      console.error(`[batch-tornscape] Ошибка ${row.unitId}:`, e);
    }
  }

  console.log(`[batch-tornscape] Готово: ok=${ok}, fail=${fail}. Далее: npm run catalog:bundle && npm run build`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
