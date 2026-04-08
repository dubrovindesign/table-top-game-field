/**
 * Default canvas / board visual settings shared by renderer and boot preload.
 */

export interface RenderConfig {
  strokeColor: string;
  strokeWidth: number;
  showGrid: boolean;
  hexonGapColor: string;
  hexonBorderWidth: number;
  boardRotationDeg: number;
  /**
   * Added to model rotation when placing/drawing miniature sprites, HP, toggles, markers (not hex silhouettes).
   * Use -180 with boardRotationDeg +180 (opposite seat) so art stays upright on screen; hex positions unchanged.
   */
  oppositeSeatUnitRotationCorrectionDeg: number;
  backgroundImageSrc: string | null;
  backgroundImageOpacity: number;
  /** `cover` / `contain` — равномерный масштаб. `stretch` в рендерере обрабатывается как `contain` (без перекоса). */
  backgroundImageFit: 'cover' | 'contain' | 'stretch';
  backgroundImageOffsetX: number;
  backgroundImageOffsetY: number;
  backgroundImageScale: number;
  backgroundImageRotationDeg: number;
  /**
   * Optional full-board grid art (e.g. public/cellscontrast.svg), drawn in screen space after hex underlay
   * so it sits above miniatures. When null, no SVG overlay is drawn.
   */
  cellsSvgOverlaySrc: string | null;
  hoverFillColor: string;
  hoverStrokeColor: string;
  backgroundColor: string;
  showCoordinates: boolean;
  coordinateColor: string;
  coordinateFont: string;
  defaultHexFillColor: string;
  walkRangeFillColor: string;
  runRangeFillColor: string;
  /** Attack range overlay (drawn on top of walk/run for selected unit). */
  attackRangeFillColor: string;
  unitFillColor: string;
  unitStrokeColor: string;
  dragHoverFillColor: string;
  dragHoverStrokeColor: string;
  terrainFillColor: string;
  /** PNG for placed terrain hexon; clipped to outer contour, no per-cell borders. */
  terrainImageSrc: string | null;
  /** PNG for ether vortex hexon (defaults to terrain image if null). */
  etherVortexImageSrc: string | null;
  /** Clockwise rotation (°) of the terrain bitmap only; scale stays the same as unrotated cover. */
  terrainTextureRotationDeg: number;
  terrainPreviewValidColor: string;
  terrainPreviewInvalidColor: string;
  bigMiniFillColor: string;
  bigMiniStrokeColor: string;
  bigMiniSymbolColor: string;
  bigMiniPreviewColor: string;
  largeMiniFillColor: string;
  largeMiniPreviewColor: string;
  hugeMiniFillColor: string;
  hugeMiniPreviewColor: string;
}

export const defaultRenderConfig: RenderConfig = {
  strokeColor: '#999999',
  strokeWidth: 1,
  showGrid: true,
  hexonGapColor: '#1a1a1a',
  hexonBorderWidth: 8,
  boardRotationDeg: 0,
  oppositeSeatUnitRotationCorrectionDeg: 0,
  backgroundImageSrc: null,
  backgroundImageOpacity: 1,
  backgroundImageFit: 'cover',
  backgroundImageOffsetX: 0,
  backgroundImageOffsetY: 0,
  backgroundImageScale: 1,
  backgroundImageRotationDeg: 0,
  cellsSvgOverlaySrc: null,
  hoverFillColor: 'rgba(33, 150, 243, 0.5)',
  hoverStrokeColor: 'rgba(33, 150, 243, 0.5)',
  backgroundColor: '#1a1a1a',
  showCoordinates: false,
  coordinateColor: '#555555',
  coordinateFont: '10px monospace',
  defaultHexFillColor: '#d4d4d4',
  walkRangeFillColor: 'rgba(76, 175, 80, 0.3)',
  runRangeFillColor: 'rgba(255, 193, 7, 0.25)',
  attackRangeFillColor: 'rgba(233, 30, 99, 0.35)',
  unitFillColor: '#2b2b2b',
  unitStrokeColor: '#fafafa',
  dragHoverFillColor: 'rgba(33, 150, 243, 0.5)',
  dragHoverStrokeColor: 'rgba(33, 150, 243, 0.5)',
  terrainFillColor: 'rgba(121, 85, 72, 0.35)',
  terrainImageSrc: '/terrain3.jpg',
  etherVortexImageSrc: '/terrain2.png',
  terrainTextureRotationDeg: 30,
  terrainPreviewValidColor: 'rgba(76, 175, 80, 0.35)',
  terrainPreviewInvalidColor: 'rgba(244, 67, 54, 0.35)',
  bigMiniFillColor: 'rgba(63, 81, 181, 0.40)',
  bigMiniStrokeColor: '#283593',
  bigMiniSymbolColor: '#c5cae9',
  bigMiniPreviewColor: 'rgba(63, 81, 181, 0.25)',
  largeMiniFillColor: 'rgba(156, 39, 176, 0.40)',
  largeMiniPreviewColor: 'rgba(156, 39, 176, 0.25)',
  hugeMiniFillColor: 'rgba(233, 30, 99, 0.40)',
  hugeMiniPreviewColor: 'rgba(233, 30, 99, 0.25)',
};
