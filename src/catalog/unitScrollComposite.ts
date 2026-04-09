/**
 * Склейка «лицо + оборот» для карточки юнита в браузере — та же геометрия, что
 * scripts/ingest-unit-card-pair.ts (вертикальный скролл, кроп шапки оборота).
 */

import type { HotspotRegion } from './hotspotTypes';

/** Как в build-priory-pairs-from-png.mjs */
export const UNIT_SCROLL_BACK_TOP_CROP_RATIO = 0.255;
export const UNIT_SCROLL_BACK_TOP_CROP_LESS_PX = 30;
export const UNIT_SCROLL_FACE_BOTTOM_CROP_PX = 30;

export const UNIT_SCROLL_MINIATURE_ON_FACE = {
  x: 0.172,
  y: 0,
  w: 0.698,
  h: 0.448,
} as const;

export type UnitScrollCompositeResult = {
  compositeDataUrl: string;
  faceFullDataUrl: string;
  miniatureDataUrl: string;
  faceFullH: number;
  totalH: number;
  scaleY: number;
  faceW: number;
};

async function loadBitmapCapped(file: File, maxEdge: number): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file);
  const w = bmp.width;
  const h = bmp.height;
  const m = Math.max(w, h);
  if (maxEdge > 0 && m > maxEdge) {
    const scale = maxEdge / m;
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = nw;
    c.height = nh;
    const ctx = c.getContext('2d');
    if (!ctx) {
      bmp.close();
      throw new Error('[unitScrollComposite] canvas 2d');
    }
    ctx.drawImage(bmp, 0, 0, nw, nh);
    bmp.close();
    return createImageBitmap(c);
  }
  return bmp;
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const q = Math.min(1, Math.max(0.5, quality));
  return canvas.toDataURL('image/jpeg', q);
}

/**
 * Пересчёт нормализованных y/h зон при смене склейки (как в ingest-unit-card-pair.ts).
 */
export function rescaleHotspotRegionsForScroll(
  regions: HotspotRegion[],
  oldLayout: { faceH: number; totalH: number } | undefined,
  newFaceFullH: number,
  newTotalH: number,
): HotspotRegion[] {
  const newScaleY = newFaceFullH / newTotalH;
  let r = regions.map((reg) => ({ ...reg }));
  if (oldLayout?.faceH && oldLayout?.totalH) {
    const oldS = oldLayout.faceH / oldLayout.totalH;
    if (oldS > 0 && oldS !== 1) {
      r = r.map((reg) => ({ ...reg, y: reg.y / oldS, h: reg.h / oldS }));
    }
  }
  return r.map((reg) => ({ ...reg, y: reg.y * newScaleY, h: reg.h * newScaleY }));
}

/**
 * Собирает длинную карту + полное лицо + миниатюру из двух файлов (лицо, оборот).
 */
export async function compositeUnitScrollFromFaceBackFiles(
  faceFile: File,
  backFile: File,
  opts?: { maxEdge?: number },
): Promise<UnitScrollCompositeResult> {
  const maxEdge = opts?.maxEdge ?? 4096;
  const faceBmp = await loadBitmapCapped(faceFile, maxEdge);
  const backBmp = await loadBitmapCapped(backFile, maxEdge);

  const faceW = faceBmp.width;
  const faceFullH = faceBmp.height;
  if (faceFullH <= UNIT_SCROLL_FACE_BOTTOM_CROP_PX) {
    faceBmp.close();
    backBmp.close();
    throw new Error('[unitScrollComposite] Лицевая сторона слишком низкая');
  }

  const backFullW = backBmp.width;
  const backFullH = backBmp.height;
  const cropTop = Math.max(
    0,
    Math.round(backFullH * UNIT_SCROLL_BACK_TOP_CROP_RATIO) - UNIT_SCROLL_BACK_TOP_CROP_LESS_PX,
  );
  const stripH = backFullH - cropTop;
  if (stripH < 1) {
    faceBmp.close();
    backBmp.close();
    throw new Error('[unitScrollComposite] Оборот после обрезки пустой');
  }

  const faceCropH = faceFullH - UNIT_SCROLL_FACE_BOTTOM_CROP_PX;

  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = faceW;
  stripCanvas.height = Math.max(1, Math.round(stripH * (faceW / backFullW)));
  const sctx = stripCanvas.getContext('2d');
  if (!sctx) {
    faceBmp.close();
    backBmp.close();
    throw new Error('[unitScrollComposite] canvas 2d');
  }
  sctx.drawImage(backBmp, 0, cropTop, backFullW, stripH, 0, 0, stripCanvas.width, stripCanvas.height);
  backBmp.close();

  const backDrawH = stripCanvas.height;
  const totalH = faceCropH + backDrawH;

  const composite = document.createElement('canvas');
  composite.width = faceW;
  composite.height = totalH;
  const cctx = composite.getContext('2d');
  if (!cctx) {
    faceBmp.close();
    throw new Error('[unitScrollComposite] canvas 2d');
  }
  cctx.fillStyle = 'rgb(24,22,20)';
  cctx.fillRect(0, 0, faceW, totalH);
  cctx.drawImage(faceBmp, 0, 0, faceW, faceCropH, 0, 0, faceW, faceCropH);
  cctx.drawImage(stripCanvas, 0, faceCropH);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceW;
  faceCanvas.height = faceFullH;
  const fctx = faceCanvas.getContext('2d');
  if (!fctx) {
    faceBmp.close();
    throw new Error('[unitScrollComposite] canvas 2d');
  }
  fctx.drawImage(faceBmp, 0, 0);
  faceBmp.close();

  const { x: nx, y: ny, w: nw, h: nh } = UNIT_SCROLL_MINIATURE_ON_FACE;
  const left = Math.min(faceW - 1, Math.max(0, Math.round(nx * faceW)));
  const top = Math.min(faceFullH - 1, Math.max(0, Math.round(ny * faceFullH)));
  let mw = Math.round(nw * faceW);
  let mh = Math.round(nh * faceFullH);
  mw = Math.max(1, Math.min(mw, faceW - left));
  mh = Math.max(1, Math.min(mh, faceFullH - top));

  const mini = document.createElement('canvas');
  mini.width = mw;
  mini.height = mh;
  const mctx = mini.getContext('2d');
  if (!mctx) throw new Error('[unitScrollComposite] canvas 2d');
  mctx.drawImage(faceCanvas, left, top, mw, mh, 0, 0, mw, mh);

  const scaleY = faceFullH / totalH;

  return {
    compositeDataUrl: canvasToJpegDataUrl(composite, 0.92),
    faceFullDataUrl: canvasToJpegDataUrl(faceCanvas, 0.92),
    miniatureDataUrl: canvasToJpegDataUrl(mini, 0.9),
    faceFullH,
    totalH,
    scaleY,
    faceW,
  };
}
