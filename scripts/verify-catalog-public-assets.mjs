#!/usr/bin/env node
/**
 * Ensures every `/catalog-units/...` URL in `public/generated/catalog-data.json`
 * resolves to a file under `public/`. Run after `build-catalog-bundle.mjs`.
 *
 *   node scripts/verify-catalog-public-assets.mjs
 *   SKIP_CATALOG_ASSET_CHECK=1 npm run build   — skip (not recommended for prod deploy)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const catalogPath = path.join(repoRoot, 'public', 'generated', 'catalog-data.json');
const publicDir = path.join(repoRoot, 'public');

const CATALOG_UNITS_PREFIX = /^\/catalog-units\/[^?#]+$/i;

function collectUrls(value, out) {
  if (typeof value === 'string') {
    const t = value.trim();
    if (CATALOG_UNITS_PREFIX.test(t)) out.add(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const x of value) collectUrls(x, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value)) collectUrls(value[k], out);
  }
}

async function main() {
  if (process.env.SKIP_CATALOG_ASSET_CHECK === '1') {
    console.log('[verify-catalog-assets] skipped (SKIP_CATALOG_ASSET_CHECK=1)');
    return;
  }
  let raw;
  try {
    raw = await fs.readFile(catalogPath, 'utf8');
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
      console.error('[verify-catalog-assets] missing bundle:', catalogPath);
      process.exit(1);
    }
    throw e;
  }
  const data = JSON.parse(raw);
  const urls = new Set();
  collectUrls(data, urls);
  const missing = [];
  for (const url of [...urls].sort()) {
    let rel = url.slice(1);
    try {
      rel = decodeURIComponent(rel);
    } catch {
      /* keep raw */
    }
    const abs = path.join(publicDir, ...rel.split('/'));
    try {
      await fs.access(abs);
    } catch {
      missing.push({ url, abs });
    }
  }
  if (missing.length === 0) {
    console.log(`[verify-catalog-assets] OK (${urls.size} /catalog-units/… URL(s) on disk)`);
    return;
  }
  console.error(`[verify-catalog-assets] ${missing.length} missing file(s):`);
  for (const m of missing.slice(0, 40)) {
    console.error(`  ${m.url}`);
    console.error(`    expected: ${path.relative(repoRoot, m.abs)}`);
  }
  if (missing.length > 40) console.error(`  … and ${missing.length - 40} more`);
  console.error(
    '\nFix: add JPEG/PNG under public/catalog-units/<id>/ or run npm run catalog:extract-images after applying export with base64 art.',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
