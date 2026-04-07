#!/usr/bin/env node
/**
 * Finds `data:image/...;base64,...` strings in `src/catalog/units/*.json` and
 * `src/catalog/hotspots/*.json` (e.g. HotspotFile.image), writes decoded bytes under
 * `public/catalog-units/<unitId>/<fieldPath>.<ext>`, replaces values with root-relative URLs.
 *
 * Usage:
 *   node scripts/extract-catalog-base64-images.mjs
 *   node scripts/extract-catalog-base64-images.mjs --dry-run
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
const hotspotsDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');
const publicDir = path.join(repoRoot, 'public');

const DATA_URL_RE = /^data:image\/([^;]+);base64,(.+)$/s;

/** `data:image/<subtype>;base64` — we only get the subtype (e.g. png, jpeg). */
function mimeToExt(subtype) {
  const m = subtype.toLowerCase().split('+')[0].trim();
  if (m === 'jpeg' || m === 'jpg') return 'jpg';
  if (m === 'png') return 'png';
  if (m === 'webp') return 'webp';
  if (m === 'gif') return 'gif';
  if (m === 'svg+xml' || m === 'svg') return 'svg';
  return 'bin';
}

function fieldSlug(parts) {
  return parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function walkReplaceSync(obj, unitId, pathParts, dryRun, writes) {
  if (typeof obj === 'string') {
    const m = obj.match(DATA_URL_RE);
    if (!m) return obj;
    const mime = m[1];
    const b64 = m[2];
    const ext = mimeToExt(mime);
    const slug = fieldSlug(pathParts);
    const relPosix = `catalog-units/${unitId}/${slug}.${ext}`;
    const outAbs = path.join(publicDir, relPosix);
    const url = `/${relPosix.split(path.sep).join('/')}`;
    const buf = Buffer.from(b64, 'base64');
    const size = buf.length;
    if (!dryRun) {
      fsSync.mkdirSync(path.dirname(outAbs), { recursive: true });
      fsSync.writeFileSync(outAbs, buf);
    }
    writes.push({ unitId, slug, url, size });
    return url;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = walkReplaceSync(obj[i], unitId, [...pathParts, String(i)], dryRun, writes);
    }
    return obj;
  }
  if (obj !== null && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      obj[k] = walkReplaceSync(obj[k], unitId, [...pathParts, k], dryRun, writes);
    }
    return obj;
  }
  return obj;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = (await fs.readdir(unitsDir)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No unit JSON files in src/catalog/units');
    return;
  }
  const allWrites = [];
  for (const f of files.sort()) {
    const filePath = path.join(unitsDir, f);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const unitId = data.id;
    if (typeof unitId !== 'string' || !unitId) {
      console.warn(`Skip ${f}: missing id`);
      continue;
    }
    const writes = [];
    walkReplaceSync(data, unitId, [], dryRun, writes);
    if (writes.length === 0) {
      console.log(`${f}: no data:image base64 fields`);
      continue;
    }
    for (const w of writes) {
      console.log(`${dryRun ? '[dry-run] ' : ''}${unitId} ${w.slug} -> ${w.url} (${(w.size / 1024).toFixed(1)} KiB)`);
    }
    allWrites.push(...writes);
    if (!dryRun) {
      const out = JSON.stringify(data, null, 2) + '\n';
      await fs.writeFile(filePath, out, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
  /** Hotspot JSON: base64 in `image` (and rarely elsewhere). */
  let hotspotFiles = [];
  try {
    hotspotFiles = (await fs.readdir(hotspotsDir)).filter((f) => f.endsWith('.json'));
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code !== 'ENOENT') throw e;
  }
  for (const f of hotspotFiles.sort()) {
    const unitId = f.replace(/\.json$/i, '');
    const filePath = path.join(hotspotsDir, f);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const writes = [];
    walkReplaceSync(data, unitId, [], dryRun, writes);
    if (writes.length === 0) {
      console.log(`hotspots/${f}: no data:image base64 fields`);
      continue;
    }
    for (const w of writes) {
      console.log(`${dryRun ? '[dry-run] ' : ''}hotspot ${unitId} ${w.slug} -> ${w.url} (${(w.size / 1024).toFixed(1)} KiB)`);
    }
    allWrites.push(...writes);
    if (!dryRun) {
      const out = JSON.stringify(data, null, 2) + '\n';
      await fs.writeFile(filePath, out, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }

  const totalKb = allWrites.reduce((s, w) => s + w.size, 0) / 1024;
  console.log(
    dryRun
      ? `\nDry run: ${allWrites.length} image(s), ~${totalKb.toFixed(0)} KiB would be written.`
      : `\nDone: ${allWrites.length} image(s), ~${totalKb.toFixed(0)} KiB extracted.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
