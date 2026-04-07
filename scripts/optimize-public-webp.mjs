#!/usr/bin/env node
/**
 * Converts oversized PNG board/sprite assets to WebP (run after editing sources; requires `sharp`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** @type {readonly { from: string; to: string; quality?: number }[]} */
const JOBS = [
  { from: 'public/fieldwithtrees.png', to: 'public/fieldwithtrees.webp', quality: 82 },
  { from: 'public/ephyr-cards.png', to: 'public/ephyr-cards.webp', quality: 85 },
];

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Install sharp: npm i -D sharp');
    process.exit(1);
  }

  for (const { from: relFrom, to: relTo, quality = 80 } of JOBS) {
    const from = path.join(repoRoot, relFrom);
    const to = path.join(repoRoot, relTo);
    try {
      await fs.access(from);
    } catch {
      console.warn(`[optimize-webp] skip (missing): ${relFrom}`);
      continue;
    }
    const inStat = await fs.stat(from);
    await sharp(from).webp({ quality, effort: 5 }).toFile(to);
    const outStat = await fs.stat(to);
    const pct = ((1 - outStat.size / inStat.size) * 100).toFixed(1);
    console.log(
      `[optimize-webp] ${relFrom} (${(inStat.size / 1e6).toFixed(2)} MB) → ${relTo} (${(outStat.size / 1e6).toFixed(2)} MB) saved ${pct}%`,
    );
    await fs.unlink(from);
    console.log(`[optimize-webp] removed ${relFrom}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
