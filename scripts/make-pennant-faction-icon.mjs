#!/usr/bin/env node
/**
 * Собирает иконку фракции в форме вымпела как у castilla/keld: RGB из исходника,
 * альфа — с канонического шаблона (public/castilla.webp).
 *
 * Usage:
 *   node scripts/make-pennant-faction-icon.mjs --out public/engeln.webp --src public/engeln-front.jpg --left 0 --top 85 --width 165 --height 1249
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.join(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function argInt(name) {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid int for ${name}: ${v}`);
  return n;
}

export async function makePennantIcon({ templatePath, sourcePath, extract, outPath }) {
  const templateAbs = path.isAbsolute(templatePath) ? templatePath : path.join(repoRoot, templatePath);
  const sourceAbs = path.isAbsolute(sourcePath) ? sourcePath : path.join(repoRoot, sourcePath);
  const outAbs = path.isAbsolute(outPath) ? outPath : path.join(repoRoot, outPath);

  const meta = await sharp(templateAbs).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error(`Bad template dimensions: ${templateAbs}`);

  let pipeline = sharp(sourceAbs);
  if (extract && typeof extract === 'object') {
    pipeline = pipeline.extract(extract);
  }

  const rgbBuf = await pipeline.resize(W, H, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer();

  const alphaBuf = await sharp(templateAbs).extractChannel('alpha').raw().toBuffer();

  if (rgbBuf.length !== W * H * 3) {
    throw new Error(`RGB buffer size mismatch: got ${rgbBuf.length}, expected ${W * H * 3}`);
  }
  if (alphaBuf.length !== W * H) {
    throw new Error(`Alpha buffer size mismatch: got ${alphaBuf.length}, expected ${W * H}`);
  }

  await sharp(rgbBuf, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alphaBuf, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 88 })
    .toFile(outAbs);

  console.log(`[pennant-icon] ${path.relative(repoRoot, outAbs)} (${W}×${H})`);
}

async function main() {
  const out = arg('--out');
  const src = arg('--src');
  if (!out || !src) {
    console.error(
      'Usage: node scripts/make-pennant-faction-icon.mjs --out <webp> --src <image> [--left L --top T --width W --height H | --extract-json <json>] [--template public/castilla.webp]',
    );
    process.exit(1);
  }
  const ej = arg('--extract-json');
  let extract;
  if (ej) {
    extract = JSON.parse(ej);
  } else {
    const left = argInt('--left');
    const top = argInt('--top');
    const width = argInt('--width');
    const height = argInt('--height');
    if (left !== undefined && top !== undefined && width !== undefined && height !== undefined) {
      extract = { left, top, width, height };
    }
  }
  const template = arg('--template') ?? 'public/castilla.webp';
  await makePennantIcon({
    templatePath: template,
    sourcePath: src,
    extract,
    outPath: out,
  });
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedAsCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
