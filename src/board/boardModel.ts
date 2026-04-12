import type { Hex } from '../hex';

export type BoardTemplate = {
  id: string;
  /** Logical playable cells in template-local space. */
  hexes: Hex[];
  backgroundImageSrc: string | null;
  cellsSvgOverlaySrc: string | null;
};

export type BoardInstance = {
  id: string;
  templateId: string;
  /** Board-local origin in world space. */
  worldX: number;
  worldY: number;
  rotationDeg: number;
  scale: number;
  zIndex: number;
};

export function defaultBoardTemplateFromHexes(
  id: string,
  hexes: Hex[],
  visuals?: {
    backgroundImageSrc?: string | null;
    cellsSvgOverlaySrc?: string | null;
  },
): BoardTemplate {
  return {
    id,
    hexes: [...hexes],
    backgroundImageSrc: visuals?.backgroundImageSrc ?? null,
    cellsSvgOverlaySrc: visuals?.cellsSvgOverlaySrc ?? null,
  };
}

export function defaultBoardInstance(templateId: string): BoardInstance {
  return {
    id: 'board-1',
    templateId,
    worldX: 0,
    worldY: 0,
    rotationDeg: 0,
    scale: 1,
    zIndex: 0,
  };
}

