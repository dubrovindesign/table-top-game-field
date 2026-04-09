#!/usr/bin/env node
/**
 * Импорт одиночных пар лиц/оборотов из папки (PNG) в каталог Криг Марк.
 * Склейка как у build-krigmark-scroll-cards.mjs; если back отсутствует — только лицо (с нижним срезом).
 */
import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const BACK_TOP_CROP_RATIO = 0.255;
const BACK_TOP_CROP_LESS_PX = 30;
const FACE_BOTTOM_CROP_PX = 30;
const MINIATURE_ON_FACE = { x: 0.172, y: 0, w: 0.698, h: 0.448 };

/** Первый существующий путь используется (KRIG_IMPORT_SRC, D:\\Downloads\\…, %USERPROFILE%\\Downloads\\…) */
async function resolveImportSrc() {
  const candidates = [
    process.env.KRIG_IMPORT_SRC,
    path.join('D:', 'Downloads', 'tornscape sheets', 'krig'),
    path.join(homedir(), 'Downloads', 'tornscape sheets', 'krig'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* next */
    }
  }
  throw new Error(
    'Krig import: не найдена папка с PNG. Укажите KRIG_IMPORT_SRC или положите файлы в Downloads/tornscape sheets/krig',
  );
}

const A1 = { x: 0.045, y: 0.402, w: 0.91, h: 0.068 };
const A2 = { x: 0.045, y: 0.474, w: 0.91, h: 0.068 };

/**
 * front / back — имена файлов в папке источника.
 * back: null — только лицевая карта (в папке нет второй стороны для этой пары).
 */
const IMPORT = [
  {
    id: 'krigmark-hundmeister',
    name: 'Хундмейстер',
    points: 18,
    front: 'httpssteamusercontentaakamaihdnetugc11038939152239168530B420341AF258D2240FD3F003467BFE4CD7DE7D7C.png',
    back: 'httpssteamusercontentaakamaihdnetugc17906124301169145042E7078CFD24B0EF709F6BB503CFF3C47CB2C79360.png',
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-wolf-baldauf',
    name: 'Вольф Бальдауф',
    points: 45,
    front: 'httpssteamusercontentaakamaihdnetugc160969990756128631212A45A497AC41F3910CB7066F548630CA4C275AC4.png',
    back: 'httpssteamusercontentaakamaihdnetugc11924896857390083095EA7FC0A8CC96875B315C2BD9145F38D0B51AD4FF.png',
    walk: 4,
    run: 7,
    health: 7,
    defense: { white: 3, green: 0 },
    size: 'small',
  },
  {
    id: 'krigmark-verena-baldauf',
    name: 'Верена Бальдауф',
    points: 60,
    front: 'httpssteamusercontentaakamaihdnetugc12695044063190166833135505FBD28E51F3C0FE5CAE8FA0BA296F9995BA.png',
    back: 'httpssteamusercontentaakamaihdnetugc13719916070687532168E4F944601B0B85DA8EDA2F98C07A07A1BBF23316.png',
    walk: 4,
    run: 7,
    health: 7,
    defense: { white: 3, green: 0 },
    size: 'small',
  },
  {
    id: 'krigmark-stahlhund-mod-i',
    name: 'Штальхунд (модификация I)',
    points: 8,
    front: 'httpssteamusercontentaakamaihdnetugc14700842896575336863F102C576BED51EE4EE73F45DD7D5C01FF37B1523.png',
    back: null,
    walk: 3,
    run: 5,
    health: 3,
    defense: { white: 2, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-okopny-zhnets',
    name: 'Окопный жнец',
    points: 23,
    front: 'httpssteamusercontentaakamaihdnetugc179021414037917744CA95881ABFC9CAB6EA4DFE821160585CBCBE2B.png',
    back: null,
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-feldwebel-reapers',
    name: 'Фельдфебель жнецов',
    points: 27,
    front: 'httpssteamusercontentaakamaihdnetugc1790214140383019FBBA0BA57997071AF942CAD2F4DC109102F43C89.png',
    back: 'httpssteamusercontentaakamaihdnetugc17902141403832040D9C0CDE450AFDBC91C87EB4D8C739B5C66CB8EF.png',
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-stormtrooper-gubitel',
    name: 'Штурмтрупер с «губителем»',
    points: 27,
    front: 'httpssteamusercontentaakamaihdnetugc1790214140384324F9874A51A5FFD4AE818B2D0E2AD7888615D08351.png',
    back: 'httpssteamusercontentaakamaihdnetugc17902141403845114AA10948ED8A61C5DD0ADABE6CD9AA1A92327434.png',
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-feldwebel-stormtroopers',
    name: 'Фельдфебель штурмтруперов',
    points: 30,
    front: 'httpssteamusercontentaakamaihdnetugc1790214140386338C787869F5E92E47AA55402BB38F06A3AB4BBCB75.png',
    back: 'httpssteamusercontentaakamaihdnetugc179021414039066394A7BDFF09DDAD437D7BC60D2AAD404309B75C23.png',
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
  {
    id: 'krigmark-stormtrooper-assault-carbine',
    name: 'Штурмтрупер со штурмовым карабином',
    points: 26,
    front: 'httpssteamusercontentaakamaihdnetugc95806067760918186220D4728636BDE5C83856AC1FC6E286D3BF13BD54D.png',
    back: 'httpssteamusercontentaakamaihdnetugc18352533111730472425B8DE540689F65F9908BBC6A1FF4F05739DC4F527.png',
    walk: 3,
    run: 6,
    health: 5,
    defense: { white: 1, green: 1 },
    size: 'small',
  },
];

function region(base, extra) {
  return { ...base, ...extra };
}

function templateRegions() {
  return [
    region(A1, {
      id: 'attack_0',
      label: 'Атака 1',
      red: 1,
      green: 1,
      black: 1,
      white: 0,
      range: 1,
      damage: 1,
    }),
    region(A2, {
      id: 'attack_1',
      label: 'Атака 2',
      red: 1,
      green: 1,
      black: 0,
      white: 0,
      range: 1,
      damage: 1,
    }),
  ];
}

function scaleHotspotRegions(regions, scaleY) {
  return regions.map((r) => ({
    ...r,
    y: r.y * scaleY,
    h: r.h * scaleY,
  }));
}

async function writeMiniatureFromFace(faceBuf, faceW, faceFullH, outPath) {
  const { x: nx, y: ny, w: nw, h: nh } = MINIATURE_ON_FACE;
  const left = Math.min(faceW - 1, Math.max(0, Math.round(nx * faceW)));
  const top = Math.min(faceFullH - 1, Math.max(0, Math.round(ny * faceFullH)));
  let width = Math.round(nw * faceW);
  let height = Math.round(nh * faceFullH);
  width = Math.max(1, Math.min(width, faceW - left));
  height = Math.max(1, Math.min(height, faceFullH - top));
  await sharp(faceBuf)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toFile(outPath);
}

async function cropBackStrip(backPath, faceW) {
  const backBuf = await sharp(backPath).toBuffer();
  const bm0 = await sharp(backBuf).metadata();
  const bw = bm0.width ?? 0;
  const bh = bm0.height ?? 0;
  const cropTop = Math.max(0, Math.round(bh * BACK_TOP_CROP_RATIO) - BACK_TOP_CROP_LESS_PX);
  const backStripHeight = bh - cropTop;
  let out = await sharp(backBuf)
    .extract({ left: 0, top: cropTop, width: bw, height: backStripHeight })
    .jpeg({ quality: 92 })
    .toBuffer();
  let bmw = await sharp(out).metadata();
  if ((bmw.width ?? 0) !== faceW) {
    out = await sharp(out).resize(faceW, null, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer();
    bmw = await sharp(out).metadata();
  }
  return { buf: out, h: bmw.height ?? 0 };
}

async function main() {
  const srcRoot = await resolveImportSrc();
  console.log(`[import-krig] источник: ${srcRoot}`);
  const unitsDir = path.join(repoRoot, 'src', 'catalog', 'units');
  const hotDir = path.join(repoRoot, 'src', 'catalog', 'hotspots');

  for (const u of IMPORT) {
    const faceSrc = path.join(srcRoot, u.front);
    const backSrc = u.back ? path.join(srcRoot, u.back) : null;
    await fs.access(faceSrc).catch(() => {
      throw new Error(`Нет файла: ${faceSrc}`);
    });
    if (backSrc) await fs.access(backSrc);

    const dir = path.join(repoRoot, 'public', 'catalog-units', u.id);
    await fs.mkdir(dir, { recursive: true });

    const faceBuf = await sharp(faceSrc).jpeg({ quality: 92 }).toBuffer();
    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) throw new Error(`${u.id}: face too short`);

    await fs.writeFile(path.join(dir, 'face.jpg'), faceBuf);
    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, path.join(dir, 'miniature.jpg'));

    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const faceCroppedBuf = await sharp(faceBuf)
      .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
      .toBuffer();

    let totalH;
    let imageBuf;
    if (backSrc) {
      const { buf: backBuf, h: backH } = await cropBackStrip(backSrc, faceW);
      totalH = faceCropH + backH;
      imageBuf = await sharp({
        create: {
          width: faceW,
          height: totalH,
          channels: 3,
          background: { r: 24, g: 22, b: 20 },
        },
      })
        .composite([
          { input: faceCroppedBuf, top: 0, left: 0 },
          { input: backBuf, top: faceCropH, left: 0 },
        ])
        .jpeg({ quality: 92 })
        .toBuffer();
    } else {
      totalH = faceCropH;
      imageBuf = await sharp(faceCroppedBuf).jpeg({ quality: 92 }).toBuffer();
    }

    await fs.writeFile(path.join(dir, 'image.jpg'), imageBuf);

    const scaleY = faceFullH / totalH;
    const regions = scaleHotspotRegions(templateRegions(), scaleY);

    const hf = {
      image: `/catalog-units/${u.id}/image.jpg`,
      title: u.name,
      scrollLayout: { faceH: faceFullH, totalH },
      regions,
    };
    await fs.writeFile(path.join(hotDir, `${u.id}.json`), JSON.stringify(hf, null, 2), 'utf8');

    const unitJson = {
      id: u.id,
      points: u.points,
      card: {
        attacks: [],
        catalogUnitId: u.id,
        concentration: { black: 0, green: 0, red: 0, white: 0 },
        defense: u.defense,
        defenseReaction: { green: 0, white: 1 },
        domains: ['death'],
        exploration: { black: 0, green: 0, red: 0, white: 0 },
        explorationRange: 0,
        grabRange: 1,
        health: u.health,
        faithMarkers: { red: 1 },
        keywords: ['Кригмарк'],
        maxHealth: u.health,
        miniatureSprite: `/catalog-units/${u.id}/miniature.jpg`,
        name: u.name,
        run: u.run,
        size: u.size,
        sprite: `/catalog-units/${u.id}/image.jpg`,
        walk: u.walk,
        flagSprite: '/krigmark.webp',
      },
    };
    await fs.writeFile(path.join(unitsDir, `${u.id}.json`), JSON.stringify(unitJson, null, 2), 'utf8');
    console.log(`[import-krig] ${u.id} (${u.name}) scroll ${faceW}x${totalH}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
