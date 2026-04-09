#!/usr/bin/env node
/**
 * Импорт отдельных PNG лицевых карт (Tornscape) в public/catalog-units/<id>/.
 * Без оборота: image.jpg = лицо (нижний срез как у castilla-scroll для согласованности), miniature.jpg — кроп с лица.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const FACE_BOTTOM_CROP_PX = 30;

const MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
};

/** { unitId: absolutePathToPng } */
const PAIRS = [
  ['castilla-monakh-gabrielit', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc12759234983265948654AD5A0398699FBDB6B59FADAC064FC647D90CF9F8.png'],
  ['chasm-abgorr-neotrazimyy-istyazatel', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc128680498209917084234CDF4DF8D6D64F95AC9A64C9CE16CB0B135E3C28.png'],
  ['castilla-leader-carlos-torres', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc1290877171855464679811BD40BD7FD9088A878D4E95CDD9FBF094522AAD.png'],
  ['engeln-devring-olverton', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc13181813880249167789F8F625FDF941BB76BA74AC7BF06ED79FCCDA7363.png'],
  ['ab-ns-chasm-valafar', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc175265921724218000335F1D2E46A7B665BA985FD6A01949CFE053815CF6.png'],
  ['ab-ns-chasm-inkubus_raider_sword', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc13546676401886769084DAACA1E7E5E6EBEC2C59B40F09722EFAB17AAF94.png'],
  ['ab-ns-castilla-torres_unit', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc1363118540411483074287B8A819DEF3D282DA26CD5AF3EF119028E70E5D.png'],
  ['castilla-gvardeets-mushketer', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc114065394387134149350CD857732574048C970FA38915FC58839FDF9700.png'],
  ['castilla-ochistitel', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc140972342674393888654A19652A7E1D82E154F27D5656646D10B99ED9D2.png'],
  ['castilla-kattimp', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc150281648471927825930D58E71307209CE24EDBC3CE6411636FD751A075.png'],
  ['castilla-leader-salvador-yerro', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc16991416199267822817F8A8F74882A370512638E9B59B76ED08676CCDCA.png'],
  ['castilla-torkemad-revnitel-chistoty', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc1244101644203356370143967E2A2ADD5F1E62F026A391B73FA950AFE4C6.png'],
  ['chasm-chazz-otpriysk-neotrazimogo', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc114862473293034265498495AE165F0BF94113E96276119220CA7E360106.png'],
  ['castilla-gvardeets-alebardist', 'D:/Downloads/tornscape sheets/kastilia and bezdna units/httpssteamusercontentaakamaihdnetugc127285736919885608604A8EDE26643FBBDA416391B0FED27DCD6CCE3820.png'],
];

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

async function main() {
  for (const [id, srcPng] of PAIRS) {
    await fs.access(srcPng).catch(() => {
      throw new Error(`Нет файла: ${srcPng}`);
    });

    const dir = path.join(repoRoot, 'public', 'catalog-units', id);
    await fs.mkdir(dir, { recursive: true });

    const faceJpg = path.join(dir, 'face.jpg');
    const imageJpg = path.join(dir, 'image.jpg');
    const miniJpg = path.join(dir, 'miniature.jpg');

    const faceBuf = await sharp(srcPng).jpeg({ quality: 92 }).toBuffer();
    await sharp(faceBuf).toFile(faceJpg);

    const fm = await sharp(faceBuf).metadata();
    const faceFullH = fm.height ?? 0;
    const faceW = fm.width ?? 0;
    if (faceFullH <= FACE_BOTTOM_CROP_PX) {
      throw new Error(`[ingest] ${id}: слишком низкое лицо`);
    }

    await writeMiniatureFromFace(faceBuf, faceW, faceFullH, miniJpg);

    const faceCropH = faceFullH - FACE_BOTTOM_CROP_PX;
    const imageBuf = await sharp(faceBuf)
      .extract({ left: 0, top: 0, width: faceW, height: faceCropH })
      .jpeg({ quality: 92 })
      .toBuffer();
    await sharp(imageBuf).toFile(imageJpg);

    console.log(`[ingest] ${id}: OK -> ${imageJpg} (face ${faceW}x${faceFullH}, image h=${faceCropH})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
