/**
 * Canvas renderer for the hex grid with hexon visualisation.
 */

import { Hex, Layout, type Point } from './hex';
import { type HexGrid } from './grid';
import {
  BIG_UNIT_HEALTH_UI_SCALE,
  SMALL_UNIT_HEALTH_BADGE_OFFSET_Y_FRAC,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
} from './healthUi';

// ── Visual config ──────────────────────────────────────────────

export interface RenderConfig {
  strokeColor: string;
  strokeWidth: number;
  showGrid: boolean;
  hexonGapColor: string;
  hexonBorderWidth: number;
  boardRotationDeg: number;
  backgroundImageSrc: string | null;
  backgroundImageOpacity: number;
  backgroundImageFit: 'cover' | 'contain' | 'stretch';
  backgroundImageOffsetX: number;
  backgroundImageOffsetY: number;
  backgroundImageScale: number;
  backgroundImageRotationDeg: number;
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
  /** Clockwise rotation (°) of the terrain bitmap only; scale stays the same as unrotated cover. */
  terrainTextureRotationDeg: number;
  terrainPreviewValidColor: string;
  terrainPreviewInvalidColor: string;
  bigMiniFillColor: string;
  bigMiniStrokeColor: string;
  bigMiniSymbolColor: string;
  bigMiniPreviewColor: string;
}

export const defaultRenderConfig: RenderConfig = {
  strokeColor: '#999999',
  strokeWidth: 1,
  showGrid: true,
  hexonGapColor: '#1a1a1a',
  hexonBorderWidth: 8,
  boardRotationDeg: 0,
  backgroundImageSrc: null,
  backgroundImageOpacity: 1,
  backgroundImageFit: 'cover',
  backgroundImageOffsetX: 0,
  backgroundImageOffsetY: 0,
  backgroundImageScale: 1,
  backgroundImageRotationDeg: 0,
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
  terrainImageSrc: '/terrain2.png',
  terrainTextureRotationDeg: 30,
  terrainPreviewValidColor: 'rgba(76, 175, 80, 0.35)',
  terrainPreviewInvalidColor: 'rgba(244, 67, 54, 0.35)',
  bigMiniFillColor: 'rgba(63, 81, 181, 0.40)',
  bigMiniStrokeColor: '#283593',
  bigMiniSymbolColor: '#c5cae9',
  bigMiniPreviewColor: 'rgba(63, 81, 181, 0.25)',
};

// ── Camera ─────────────────────────────────────────────────────

export class Camera {
  offsetX = 0;
  offsetY = 0;
  zoom = 1;

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.offsetX) / this.zoom,
      y: (sy - this.offsetY) / this.zoom,
    };
  }
}

// ── Renderer ───────────────────────────────────────────────────

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private layout: Layout;
  private grid: HexGrid;
  private camera: Camera;
  private config: RenderConfig;
  private hoveredHex: Hex | null = null;
  private highlightedHexonCenter: Hex = new Hex(2, 0);
  private unitHexes: Hex[] = [];
  private selectedUnitIndex: number | null = null;
  private draggingUnitIndex: number | null = null;
  private dragOverHex: Hex | null = null;
  private dragPreviewPosition: Point | null = null;
  private selectedUnitHex: Hex | null = null;
  private walkReachableHexes: Hex[] = [];
  private runReachableHexes: Hex[] = [];
  private attackRangeHexes: Hex[] = [];
  private attackRangeBigHexonCenters: Hex[] = [];
  private terrainCenterHexes: Hex[] = [];
  private terrainPreviewWorld: Point | null = null;
  private terrainDragging = false;
  private draggingTerrainIndex: number | null = null;
  private terrainDragOverCenter: Hex | null = null;
  private selectedTerrainIndex: number | null = null;
  private bigMiniCenters: Hex[] = [];
  private bigMiniPreviewPosition: Point | null = null;
  private draggingBigMiniIndex: number | null = null;
  private bigMiniDragOverCenter: Hex | null = null;
  private bigMiniWalkHexonCenters: Hex[] = [];
  private bigMiniRunHexonCenters: Hex[] = [];
  private selectedBigMiniIndex: number | null = null;
  private unitRotationDeg: number[] = [];
  private unitHealthValues: number[] = [];
  private openHealthControlsUnitIndex: number | null = null;
  private bigMiniHealthValues: number[] = [];
  private openHealthControlsBigMiniIndex: number | null = null;
  private unitSpriteSrcs: (string | null)[] = [];
  private bigMiniSpriteSrc: string | null = null;
  private terrainRotationDeg = 0;
  private bigMiniRotationDeg: number[] = [];
  private healthBadgeImage: HTMLImageElement | null = null;
  private healthBadgeLoaded = false;
  private healthBadgeFailed = false;
  private spriteImageCache = new Map<string, HTMLImageElement>();
  private spriteImageLoading = new Set<string>();
  private spriteImageFailed = new Set<string>();
  private backgroundImage: HTMLImageElement | null = null;
  private backgroundImageSrcLoaded: string | null = null;
  private backgroundImageSrcFailed: string | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    layout: Layout,
    grid: HexGrid,
    camera: Camera,
    config: RenderConfig = { ...defaultRenderConfig },
  ) {
    this.canvas = canvas;
    this.layout = layout;
    this.grid = grid;
    this.camera = camera;
    this.config = config;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');
    this.ctx = ctx;
  }

  setHoveredHex(hex: Hex | null): void {
    this.hoveredHex = hex;
  }

  setHighlightedHexonCenter(center: Hex): void {
    this.highlightedHexonCenter = center;
  }

  setMovementHighlights(
    selectedUnitHex: Hex | null,
    walkReachableHexes: Hex[],
    runReachableHexes: Hex[],
  ): void {
    this.selectedUnitHex = selectedUnitHex;
    this.walkReachableHexes = [...walkReachableHexes];
    this.runReachableHexes = [...runReachableHexes];
  }

  /** Small-unit hex cells + big-mini hexon footprints for attack range preview (on top of movement). */
  setAttackRangeOverlay(smallHexes: Hex[], bigHexonCenters: Hex[]): void {
    this.attackRangeHexes = [...smallHexes];
    this.attackRangeBigHexonCenters = [...bigHexonCenters];
  }

  setUnits(unitHexes: Hex[], selectedUnitIndex: number | null): void {
    this.unitHexes = [...unitHexes];
    this.selectedUnitIndex = selectedUnitIndex;
  }

  setDragState(
    draggingUnitIndex: number | null,
    dragOverHex: Hex | null,
    dragPreviewPosition: Point | null,
  ): void {
    this.draggingUnitIndex = draggingUnitIndex;
    this.dragOverHex = dragOverHex;
    this.dragPreviewPosition = dragPreviewPosition;
  }

  setTerrain(
    terrainCenterHexes: Hex[],
    terrainPreviewWorld: Point | null,
    isTerrainDragging: boolean,
    draggingTerrainIndex: number | null,
    dragOverCenter: Hex | null,
    selectedTerrainIndex: number | null,
  ): void {
    this.terrainCenterHexes = [...terrainCenterHexes];
    this.terrainPreviewWorld = terrainPreviewWorld;
    this.terrainDragging = isTerrainDragging;
    this.draggingTerrainIndex = draggingTerrainIndex;
    this.terrainDragOverCenter = dragOverCenter;
    this.selectedTerrainIndex = selectedTerrainIndex;
  }

  setBigMiniatures(
    centers: Hex[],
    previewPosition: Point | null,
    draggingIndex: number | null,
    dragOverCenter: Hex | null,
  ): void {
    this.bigMiniCenters = [...centers];
    this.bigMiniPreviewPosition = previewPosition;
    this.draggingBigMiniIndex = draggingIndex;
    this.bigMiniDragOverCenter = dragOverCenter;
  }

  setBigMiniMovement(
    selectedIndex: number | null,
    walkHexonCenters: Hex[],
    runHexonCenters: Hex[],
  ): void {
    this.selectedBigMiniIndex = selectedIndex;
    this.bigMiniWalkHexonCenters = [...walkHexonCenters];
    this.bigMiniRunHexonCenters = [...runHexonCenters];
  }

  /** Per-unit facing angle in degrees (canvas: 0° = east, CCW positive). */
  setUnitRotations(degrees: number[]): void {
    this.unitRotationDeg = [...degrees];
  }

  setUnitHealth(values: number[], openControlsUnitIndex: number | null): void {
    this.unitHealthValues = [...values];
    this.openHealthControlsUnitIndex = openControlsUnitIndex;
  }

  setBigMiniHealth(values: number[], openControlsBigMiniIndex: number | null): void {
    this.bigMiniHealthValues = [...values];
    this.openHealthControlsBigMiniIndex = openControlsBigMiniIndex;
  }

  setUnitSpriteSources(srcs: (string | null)[]): void {
    this.unitSpriteSrcs = [...srcs];
  }

  setBigMiniSpriteSource(src: string | null): void {
    this.bigMiniSpriteSrc = src;
  }

  /** Terrain flower rotation around its center hex (degrees). */
  setTerrainRotation(deg: number): void {
    this.terrainRotationDeg = deg;
  }

  setBigMiniRotations(degrees: number[]): void {
    this.bigMiniRotationDeg = [...degrees];
  }

  updateConfig(patch: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  render(): void {
    const { ctx, canvas, config } = this;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    this.camera.apply(ctx);
    const gridBounds = this.getGridWorldBounds();
    if (config.boardRotationDeg !== 0) {
      // Rotate around current board center in world space.
      const centerX = (gridBounds.minX + gridBounds.maxX) / 2;
      const centerY = (gridBounds.minY + gridBounds.maxY) / 2;
      const angleRad = (config.boardRotationDeg * Math.PI) / 180;
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);
      ctx.translate(-centerX, -centerY);
    }

    this.drawBackgroundImage(gridBounds);

    // Pass 1: fill all hexes
    for (const hex of this.grid.allHexes()) {
      this.drawHexFill(hex);
    }

    // Pass 2: thin inner borders (within hexons)
    if (config.showGrid) {
      for (const hex of this.grid.allHexes()) {
        this.drawHexStroke(hex, config.strokeColor, config.strokeWidth);
      }
    }

    // Pass 3: movement range overlay for selected unit
    this.drawMovementHighlights();

    // Pass 3b: attack range for small units (on top of walk/run)
    this.drawAttackRangeSmallHighlights();

    // Pass 4: terrain feature (one big hexon)
    this.drawTerrain();

    // Pass 5: drag target highlight
    this.drawDragHoverHex();

    // Pass 6: optional thick border for a highlighted hexon
    if (config.hexonBorderWidth > 0) {
      this.drawHexonBorders();
    }

    // Pass 7: big mini movement range (hexon-level)
    this.drawBigMiniMovement();

    // Pass 7b: attack range for big miniatures (on top of walk/run rings)
    this.drawAttackRangeBigHighlights();

    // Pass 8: big miniatures (hexon-sized)
    this.drawBigMiniatures();

    // Pass 8b: terrain selection (on top of big minis that share hexes with terrain)
    this.drawTerrainSelectionRing();

    // Pass 9: unit miniature (small)
    this.drawUnits();

    // Pass 10: coordinate labels
    if (config.showCoordinates) {
      for (const hex of this.grid.allHexes()) {
        this.drawCoordinates(hex);
      }
    }

    ctx.restore();
  }

  private getGridWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    const allHexes = this.grid.allHexes();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const hex of allHexes) {
      const p = this.layout.hexToPixel(hex);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const width = Math.max(1, maxX - minX + this.layout.size.x * 2.8);
    const height = Math.max(1, maxY - minY + this.layout.size.y * 2.8);
    return { minX, minY, maxX, maxY, width, height };
  }

  private ensureBackgroundImageLoaded(): void {
    const src = this.config.backgroundImageSrc;
    if (!src) return;
    if (this.backgroundImageSrcLoaded === src || this.backgroundImageSrcFailed === src) return;
    const image = new Image();
    image.onload = () => {
      this.backgroundImage = image;
      this.backgroundImageSrcLoaded = src;
      this.backgroundImageSrcFailed = null;
    };
    image.onerror = () => {
      this.backgroundImage = null;
      this.backgroundImageSrcLoaded = null;
      this.backgroundImageSrcFailed = src;
    };
    image.src = src;
  }

  private drawBackgroundImage(bounds: { minX: number; minY: number; width: number; height: number }): void {
    this.ensureBackgroundImageLoaded();
    if (!this.backgroundImage) return;
    const { ctx, config } = this;
    const image = this.backgroundImage;
    const targetX = bounds.minX - this.layout.size.x * 1.4;
    const targetY = bounds.minY - this.layout.size.y * 1.4;
    const targetW = bounds.width;
    const targetH = bounds.height;

    let drawX = targetX;
    let drawY = targetY;
    let drawW = targetW;
    let drawH = targetH;

    if (config.backgroundImageFit !== 'stretch') {
      const scale = config.backgroundImageFit === 'cover'
        ? Math.max(targetW / image.width, targetH / image.height)
        : Math.min(targetW / image.width, targetH / image.height);
      drawW = image.width * scale;
      drawH = image.height * scale;
      drawX = targetX + (targetW - drawW) / 2;
      drawY = targetY + (targetH - drawH) / 2;
    }

    const scale = Math.max(0.05, config.backgroundImageScale);
    drawW *= scale;
    drawH *= scale;
    drawX += config.backgroundImageOffsetX + (targetW - drawW) / 2;
    drawY += config.backgroundImageOffsetY + (targetH - drawH) / 2;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, config.backgroundImageOpacity));
    const centerX = drawX + drawW / 2;
    const centerY = drawY + drawH / 2;
    const rot = (config.backgroundImageRotationDeg * Math.PI) / 180;
    ctx.translate(centerX, centerY);
    ctx.rotate(rot);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  // ── Fill ──

  private drawHexFill(hex: Hex): void {
    const { ctx, config, layout } = this;
    const corners = layout.hexCorners(hex);
    const showBaseHover =
      this.draggingUnitIndex === null &&
      this.draggingBigMiniIndex === null &&
      !this.terrainDragging;
    const isHovered = showBaseHover && this.hoveredHex !== null && hex.key === this.hoveredHex.key;

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();

    if (isHovered) {
      ctx.fillStyle = config.hoverFillColor;
    } else {
      ctx.fillStyle = config.defaultHexFillColor;
    }
    ctx.fill();
  }

  // ── Thin stroke ──

  private drawHexStroke(hex: Hex, color: string, width: number): void {
    const { ctx, layout } = this;
    const corners = layout.hexCorners(hex);

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width / this.camera.zoom;
    ctx.stroke();
  }

  // ── Hexon boundaries (thick lines between hexons) ──

  private drawHexonBorders(): void {
    const { ctx, config, layout, grid } = this;
    const targetHexonCells = new Set<string>();
    targetHexonCells.add(this.highlightedHexonCenter.key);
    for (const direction of Hex.directions) {
      targetHexonCells.add(this.highlightedHexonCenter.add(direction).key);
    }

    ctx.strokeStyle = config.hexonGapColor;
    ctx.lineWidth = config.hexonBorderWidth / this.camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    for (const hex of grid.allHexes()) {
      if (!targetHexonCells.has(hex.key)) continue;
      const corners = layout.hexCorners(hex);

      // Check each of 6 edges
      for (let dir = 0; dir < 6; dir++) {
        const neighbor = hex.neighbor(dir);

        // Draw thick border only on the outside of this exact 7-cell hexon.
        const isBoundary = grid.has(neighbor) ? !targetHexonCells.has(neighbor.key) : true;

        if (isBoundary) {
          const c1 = corners[dir];
          const c2 = corners[(dir + 1) % 6];
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
        }
      }
    }

    ctx.stroke();
  }

  private drawMovementHighlights(): void {
    if (!this.selectedUnitHex) return;

    const { ctx, config, layout } = this;
    const drawHexOverlay = (hex: Hex, fillStyle: string): void => {
      const corners = layout.hexCorners(hex);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    };

    // Draw each source range layer as-is so overlapping ranges become visually denser.
    for (const hex of this.runReachableHexes) {
      drawHexOverlay(hex, config.runRangeFillColor);
    }
    for (const hex of this.walkReachableHexes) {
      drawHexOverlay(hex, config.walkRangeFillColor);
    }
  }

  private drawAttackRangeSmallHighlights(): void {
    const { ctx, layout, config } = this;
    for (const hex of this.attackRangeHexes) {
      const corners = layout.hexCorners(hex);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = config.attackRangeFillColor;
      ctx.fill();
    }
  }

  private drawAttackRangeBigHighlights(): void {
    const { ctx, layout, config } = this;
    for (const center of this.attackRangeBigHexonCenters) {
      const cells = [center, ...Hex.directions.map((d) => center.add(d))];
      for (const hex of cells) {
        const corners = layout.hexCorners(hex);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fillStyle = config.attackRangeFillColor;
        ctx.fill();
      }
    }
  }

  private drawUnits(): void {
    const { ctx, layout, config } = this;
    const { halfH } = this.hexHalfExtentFromLayout();

    this.unitHexes.forEach((unitHex, index) => {
      if (this.draggingUnitIndex === index && this.dragPreviewPosition) {
        return;
      }
      const center = layout.hexToPixel(unitHex);
      const rotRad = ((this.unitRotationDeg[index] ?? 0) * Math.PI) / 180;
      const sprite = this.getSpriteImage(this.unitSpriteSrcs[index] ?? null);

      this.drawSmallUnitInHex(center, rotRad, sprite, () => {
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(rotRad);
        const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
        ctx.beginPath();
        this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
        ctx.fillStyle = config.unitFillColor;
        ctx.fill();
        ctx.strokeStyle = config.unitStrokeColor;
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(halfH * 0.95, 0);
        ctx.strokeStyle = config.unitStrokeColor;
        ctx.lineWidth = 1.75 / this.camera.zoom;
        ctx.stroke();
        ctx.restore();
      });

      if (this.selectedUnitIndex === index) {
        this.strokeHexAtCenterRotated(center, rotRad, '#4caf50', 2.5);
      }

      this.drawHealthBadgeAt(
        center,
        halfH,
        this.unitHealthValues[index] ?? 0,
        this.openHealthControlsUnitIndex === index,
        SMALL_UNIT_HEALTH_BADGE_SCALE,
        'insideHexBottom',
        halfH,
      );
    });

    if (this.draggingUnitIndex !== null && this.dragPreviewPosition) {
      const rotRad =
        ((this.unitRotationDeg[this.draggingUnitIndex] ?? 0) * Math.PI) / 180;
      const sprite = this.getSpriteImage(
        this.unitSpriteSrcs[this.draggingUnitIndex] ?? null,
      );
      this.drawSmallUnitInHex(this.dragPreviewPosition, rotRad, sprite, () => {
        ctx.save();
        ctx.translate(this.dragPreviewPosition!.x, this.dragPreviewPosition!.y);
        ctx.rotate(rotRad);
        const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
        ctx.beginPath();
        this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
        ctx.fillStyle = config.unitFillColor;
        ctx.fill();
        ctx.strokeStyle = config.unitStrokeColor;
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.stroke();
        ctx.restore();
      });
      this.drawHealthBadgeAt(
        this.dragPreviewPosition,
        halfH,
        this.unitHealthValues[this.draggingUnitIndex] ?? 0,
        this.openHealthControlsUnitIndex === this.draggingUnitIndex,
        SMALL_UNIT_HEALTH_BADGE_SCALE,
        'insideHexBottom',
        halfH,
      );
    }
  }

  private hexHalfExtentFromLayout(): { halfW: number; halfH: number } {
    const { layout } = this;
    const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
    let maxAbsX = 0;
    let maxAbsY = 0;
    for (const o of offs) {
      if (Math.abs(o.x) > maxAbsX) maxAbsX = Math.abs(o.x);
      if (Math.abs(o.y) > maxAbsY) maxAbsY = Math.abs(o.y);
    }
    return { halfW: maxAbsX, halfH: maxAbsY };
  }

  /**
   * Hexon (center + 6 neighbors) in local coords — pivot at center hex, same as terrain.
   */
  private hexonLocalCellCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    return [
      { x: 0, y: 0 },
      ...Hex.directions.map((d) => {
        const p = layout.hexToPixel(zero.add(d));
        return { x: p.x - o.x, y: p.y - o.y };
      }),
    ];
  }

  private bigMiniHexonBoundsLocal(layout: Layout): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of this.hexonLocalCellCenters(layout)) {
      for (let i = 0; i < 6; i++) {
        const off = layout.hexCornerOffset(i);
        const x = cell.x + off.x;
        const y = cell.y + off.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * Vertices of the hexon silhouette (only outer edges of the 7-hex union),
   * sorted CCW for a closed path.
   */
  private bigMiniHexonOuterVerticesLocal(layout: Layout, scale: number): Point[] {
    const segKey = (p: Point, q: Point): string => {
      const k1 = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      const k2 = `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };

    const edgeCounts = new Map<string, number>();
    const edgeA = new Map<string, Point>();
    const edgeB = new Map<string, Point>();

    for (const cell of this.hexonLocalCellCenters(layout)) {
      for (let i = 0; i < 6; i++) {
        const o1 = layout.hexCornerOffset(i);
        const o2 = layout.hexCornerOffset((i + 1) % 6);
        const a = { x: scale * (cell.x + o1.x), y: scale * (cell.y + o1.y) };
        const b = { x: scale * (cell.x + o2.x), y: scale * (cell.y + o2.y) };
        const k = segKey(a, b);
        edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
        if (!edgeA.has(k)) {
          edgeA.set(k, a);
          edgeB.set(k, b);
        }
      }
    }

    const vertsMap = new Map<string, Point>();
    for (const [k, cnt] of edgeCounts) {
      if (cnt !== 1) continue;
      const a = edgeA.get(k)!;
      const b = edgeB.get(k)!;
      vertsMap.set(`${a.x.toFixed(4)},${a.y.toFixed(4)}`, a);
      vertsMap.set(`${b.x.toFixed(4)},${b.y.toFixed(4)}`, b);
    }

    const verts = [...vertsMap.values()];
    if (verts.length < 3) return verts;

    let cx = 0;
    let cy = 0;
    for (const v of verts) {
      cx += v.x;
      cy += v.y;
    }
    cx /= verts.length;
    cy /= verts.length;
    verts.sort(
      (p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx),
    );
    return verts;
  }

  /**
   * Single outer outline of the hexon (not per-cell): rounded corners like small-unit border;
   * use for clip, fill, and stroke so internal hex seams stay sharp in the artwork.
   */
  private addBigMiniHexonOuterPath(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    scale: number,
  ): void {
    const verts = this.bigMiniHexonOuterVerticesLocal(layout, scale);
    if (verts.length < 3) return;
    this.roundHexPathLocal(ctx, verts, this.smallUnitHexCornerRadius());
  }

  /** Slight rounding at hex corners for small-unit miniatures (world units). */
  private smallUnitHexCornerRadius(): number {
    const { layout } = this;
    return Math.min(layout.size.x, layout.size.y) * 0.3;
  }

  /**
   * Closed polygon with rounded corners (arcTo fillet). Works for hex (`layout.hexCornerOffset` order) or any CCW vertex loop.
   */
  private roundHexPathLocal(
    ctx: CanvasRenderingContext2D,
    offs: Point[],
    requestedRadius: number,
    maxEdgeFraction = 0.32,
  ): void {
    const pts = offs;
    const n = pts.length;
    if (n < 3) return;

    let rr = Math.max(0, requestedRadius);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const el = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      rr = Math.min(rr, el * maxEdgeFraction);
    }
    if (rr < 0.25) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      return;
    }

    const cornerEnd = (p0: Point, p1: Point, p2: Point): Point => {
      const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const l1 = Math.hypot(v1.x, v1.y);
      const l2 = Math.hypot(v2.x, v2.y);
      const u1 = { x: v1.x / l1, y: v1.y / l1 };
      const u2 = { x: v2.x / l2, y: v2.y / l2 };
      let dot = u1.x * u2.x + u1.y * u2.y;
      dot = Math.max(-1, Math.min(1, dot));
      const angle = Math.acos(dot);
      const t = rr / Math.tan(angle / 2);
      const t2 = Math.min(t, l2 * 0.45);
      return { x: p1.x + u2.x * t2, y: p1.y + u2.y * t2 };
    };

    const pStart = (p0: Point, p1: Point, p2: Point): Point => {
      const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const l1 = Math.hypot(v1.x, v1.y);
      const l2 = Math.hypot(v2.x, v2.y);
      const u1 = { x: v1.x / l1, y: v1.y / l1 };
      const u2 = { x: v2.x / l2, y: v2.y / l2 };
      let dot = u1.x * u2.x + u1.y * u2.y;
      dot = Math.max(-1, Math.min(1, dot));
      const angle = Math.acos(dot);
      const t = rr / Math.tan(angle / 2);
      const t1 = Math.min(t, l1 * 0.45);
      return { x: p1.x + u1.x * t1, y: p1.y + u1.y * t1 };
    };

    const start = pStart(pts[n - 1], pts[0], pts[1]);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const end = cornerEnd(p0, p1, p2);
      ctx.arcTo(p1.x, p1.y, end.x, end.y, rr);
    }
    ctx.closePath();
  }

  /** Sprite with object-fit: cover inside flat-top hex (fills cell). */
  private drawSmallUnitInHex(
    centerWorld: Point,
    rotRad: number,
    sprite: HTMLImageElement | null,
    onFallback: () => void,
  ): void {
    const { ctx, layout, config } = this;
    if (!sprite || sprite.naturalWidth <= 0) {
      onFallback();
      return;
    }

    const iw = sprite.naturalWidth;
    const ih = sprite.naturalHeight;
    const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const o of offs) {
      if (o.x < minX) minX = o.x;
      if (o.x > maxX) maxX = o.x;
      if (o.y < minY) minY = o.y;
      if (o.y > maxY) maxY = o.y;
    }
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    const scale = Math.max(boxW / iw, boxH / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    const cornerR = this.smallUnitHexCornerRadius();
    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(rotRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, cornerR);
    ctx.clip();
    ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(rotRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, cornerR);
    ctx.strokeStyle = config.unitStrokeColor;
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.stroke();
    ctx.restore();
  }

  private strokeHexAtCenterRotated(
    centerWorld: Point,
    rotRad: number,
    color: string,
    width: number,
  ): void {
    const { ctx, layout } = this;
    const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(rotRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
    ctx.strokeStyle = color;
    ctx.lineWidth = width / this.camera.zoom;
    ctx.stroke();
    ctx.restore();
  }

  private ensureHealthBadgeLoaded(): void {
    if (this.healthBadgeLoaded || this.healthBadgeFailed) return;
    const image = new Image();
    image.onload = () => {
      this.healthBadgeImage = image;
      this.healthBadgeLoaded = true;
      this.healthBadgeFailed = false;
    };
    image.onerror = () => {
      this.healthBadgeImage = null;
      this.healthBadgeLoaded = false;
      this.healthBadgeFailed = true;
    };
    image.src = '/health.svg';
  }

  /** HP badge: above center (big mini) or inside bottom of hex cell (small units). */
  private drawHealthBadgeAt(
    miniatureCenter: Point,
    miniatureRadius: number,
    health: number,
    showPlusMinus: boolean,
    scale = 1,
    verticalPlacement: 'above' | 'insideHexBottom' = 'above',
    hexHalfHeight?: number,
  ): void {
    this.ensureHealthBadgeLoaded();
    const { ctx } = this;
    const effectiveRadius = miniatureRadius * scale;
    const badgeCenter =
      verticalPlacement === 'insideHexBottom' && hexHalfHeight !== undefined
        ? {
            x: miniatureCenter.x,
            y:
              miniatureCenter.y +
              hexHalfHeight * SMALL_UNIT_HEALTH_BADGE_OFFSET_Y_FRAC,
          }
        : {
            x: miniatureCenter.x,
            y: miniatureCenter.y - effectiveRadius * 1.55,
          };
    const badgeRadius = effectiveRadius * 0.48;

    if (this.healthBadgeImage) {
      const imageSize = badgeRadius * 2.35;
      ctx.drawImage(
        this.healthBadgeImage,
        badgeCenter.x - imageSize / 2,
        badgeCenter.y - imageSize / 2,
        imageSize,
        imageSize,
      );
    } else {
      ctx.beginPath();
      ctx.arc(badgeCenter.x, badgeCenter.y, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 1.4 / this.camera.zoom;
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, effectiveRadius * 0.72)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(health), badgeCenter.x, badgeCenter.y);

    if (!showPlusMinus) return;

    const buttonRadius = badgeRadius * 0.55;
    const buttonOffsetX = badgeRadius * 1.55;
    this.drawHealthButton(
      { x: badgeCenter.x - buttonOffsetX, y: badgeCenter.y },
      buttonRadius,
      '-',
    );
    this.drawHealthButton(
      { x: badgeCenter.x + buttonOffsetX, y: badgeCenter.y },
      buttonRadius,
      '+',
    );
  }

  private drawHealthButton(center: Point, radius: number, label: '+' | '-'): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.2 / this.camera.zoom;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, radius * 1.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, center.y);
  }

  private drawDragHoverHex(): void {
    const { ctx, layout, config } = this;
    if (this.dragOverHex) {
      const corners = layout.hexCorners(this.dragOverHex);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.stroke();
    }

    if (this.bigMiniDragOverCenter) {
      const p = layout.hexToPixel(this.bigMiniDragOverCenter);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.stroke();
      ctx.restore();
    }

    if (this.terrainDragging && this.terrainDragOverCenter) {
      const p = layout.hexToPixel(this.terrainDragOverCenter);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawTerrain(): void {
    const { layout } = this;
    const rotRad = (this.terrainRotationDeg * Math.PI) / 180;
    const drag = this.terrainDragging;
    // Like big mini: while dragging, hide dragged piece and draw full terrain at cursor.
    this.terrainCenterHexes.forEach((center, index) => {
      if (drag && this.draggingTerrainIndex === index) return;
      this.drawTerrainHexonAtWorldPivot(layout.hexToPixel(center), rotRad);
    });
    if (drag && this.terrainPreviewWorld) {
      this.drawTerrainHexonAtWorldPivot(this.terrainPreviewWorld, rotRad);
    }
  }

  /**
   * Terrain = one hexon like big mini: image object-fit cover in outer rounded silhouette,
   * outer stroke only (no inner hex seams). `worldPivot` is board pixel position (same as big-mini drag preview).
   */
  private drawTerrainHexonAtWorldPivot(worldPivot: Point, rotRad: number): void {
    const { ctx, layout, config } = this;
    const p = worldPivot;
    const bounds = this.bigMiniHexonBoundsLocal(layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const lwOuter = 2 / this.camera.zoom;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rotRad);

    const sprite = this.getSpriteImage(config.terrainImageSrc);
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      const iw = sprite.naturalWidth;
      const ih = sprite.naturalHeight;
      const cover = Math.max(boxW / iw, boxH / ih);
      const dw = iw * cover;
      const dh = ih * cover;
      const texRotRad = (config.terrainTextureRotationDeg * Math.PI) / 180;
      ctx.save();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      ctx.rotate(texRotRad);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = lwOuter;
      ctx.stroke();
    } else {
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = config.terrainFillColor;
      ctx.fill();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = lwOuter;
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Green hexon ring for selected terrain; drawn after big minis so overlap stays visible. */
  private drawTerrainSelectionRing(): void {
    if (this.selectedTerrainIndex === null) return;
    const index = this.selectedTerrainIndex;
    const rotDeg = this.terrainRotationDeg;
    if (
      this.terrainDragging &&
      this.draggingTerrainIndex === index &&
      this.terrainPreviewWorld
    ) {
      this.drawBigMiniRingAtPoint(this.terrainPreviewWorld, 1.08, '#4caf50', 3, rotDeg);
      return;
    }
    const center = this.terrainCenterHexes[index];
    if (!center) return;
    this.drawBigMiniRing(center, 1.08, '#4caf50', 3, rotDeg);
  }

  // ── Big mini movement range ──

  private drawBigMiniMovement(): void {
    const { ctx, layout, config } = this;

    // Run range first (below walk), then walk on top
    const walkCenterKeys = new Set(this.bigMiniWalkHexonCenters.map((c) => c.key));

    // Draw run-only hexons
    for (const center of this.bigMiniRunHexonCenters) {
      if (walkCenterKeys.has(center.key)) continue; // skip walk ones, drawn next
      const cells = [center, ...Hex.directions.map((d) => center.add(d))];
      for (const hex of cells) {
        const corners = layout.hexCorners(hex);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fillStyle = config.runRangeFillColor;
        ctx.fill();
      }
    }

    // Draw walk hexons
    for (const center of this.bigMiniWalkHexonCenters) {
      const cells = [center, ...Hex.directions.map((d) => center.add(d))];
      for (const hex of cells) {
        const corners = layout.hexCorners(hex);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fillStyle = config.walkRangeFillColor;
        ctx.fill();
      }
    }
  }

  // ── Big miniatures (hexon-sized) ──

  private drawBigMiniatures(): void {
    const { ctx, config, layout } = this;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;

    // Draw each big mini
    this.bigMiniCenters.forEach((center, index) => {
      // Skip the one being dragged (we draw preview instead)
      if (this.draggingBigMiniIndex === index) return;

      const rotDeg = this.bigMiniRotationDeg[index] ?? 0;
      this.drawBigMiniHexon(center, baseRadius, config.bigMiniFillColor, rotDeg);

      // Selection ring around big miniature
      if (this.selectedBigMiniIndex === index) {
        this.drawBigMiniRing(center, 1.08, '#4caf50', 3, rotDeg);
      }

      const p = layout.hexToPixel(center);
      this.drawHealthBadgeAt(
        p,
        baseRadius,
        this.bigMiniHealthValues[index] ?? 0,
        this.openHealthControlsBigMiniIndex === index,
        BIG_UNIT_HEALTH_UI_SCALE,
      );
    });

    // Draw drag preview (ghost)
    if (this.bigMiniPreviewPosition) {
      const previewRot =
        this.draggingBigMiniIndex !== null
          ? (this.bigMiniRotationDeg[this.draggingBigMiniIndex] ?? 0)
          : 0;
      this.drawBigMiniHexonAtPoint(
        this.bigMiniPreviewPosition,
        baseRadius,
        config.bigMiniPreviewColor,
        previewRot,
      );
      ctx.globalAlpha = 0.6;
      this.drawBigMiniRingAtPoint(this.bigMiniPreviewPosition, 0.62, config.bigMiniSymbolColor, 2, previewRot);
      ctx.globalAlpha = 1.0;
      if (this.draggingBigMiniIndex !== null) {
        this.drawHealthBadgeAt(
          this.bigMiniPreviewPosition,
          baseRadius,
          this.bigMiniHealthValues[this.draggingBigMiniIndex] ?? 0,
          this.openHealthControlsBigMiniIndex === this.draggingBigMiniIndex,
          BIG_UNIT_HEALTH_UI_SCALE,
        );
      }
    }
  }

  private drawBigMiniHexon(
    center: Hex,
    radius: number,
    fillColor: string,
    rotationDeg: number,
  ): void {
    const { layout } = this;
    const p = layout.hexToPixel(center);
    this.drawBigMiniHexonAtPoint(p, radius, fillColor, rotationDeg);
  }

  /** Big unit miniature: hexon shape (7 hexes) with image clipped like terrain; `radius` is legacy size hint for fallback art. */
  private drawBigMiniHexonAtPoint(
    point: Point,
    radius: number,
    fillColor: string,
    rotationDeg = 0,
  ): void {
    const { ctx, config, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const bounds = this.bigMiniHexonBoundsLocal(layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const lwOuter = 2 / this.camera.zoom;
    const lwSymbol = 2 / this.camera.zoom;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    const sprite = this.getSpriteImage(this.bigMiniSpriteSrc);
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      const iw = sprite.naturalWidth;
      const ih = sprite.naturalHeight;
      const cover = Math.max(boxW / iw, boxH / ih);
      const dw = iw * cover;
      const dh = ih * cover;
      ctx.save();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = lwOuter;
      ctx.stroke();
    } else {
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = lwOuter;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(radius * 0.2, 0);
      ctx.lineTo(radius * 0.88, 0);
      ctx.strokeStyle = config.bigMiniSymbolColor;
      ctx.lineWidth = lwSymbol;
      ctx.stroke();
    }
    ctx.restore();
  }

  private getSpriteImage(src: string | null): HTMLImageElement | null {
    if (!src) return null;
    const ready = this.spriteImageCache.get(src);
    if (ready) return ready;
    if (this.spriteImageFailed.has(src) || this.spriteImageLoading.has(src)) return null;
    this.spriteImageLoading.add(src);
    const image = new Image();
    image.onload = () => {
      this.spriteImageLoading.delete(src);
      this.spriteImageCache.set(src, image);
    };
    image.onerror = () => {
      this.spriteImageLoading.delete(src);
      this.spriteImageFailed.add(src);
    };
    image.src = src;
    return null;
  }

  /** `pathScale` scales the hexon from center (e.g. 1.08 selection, 0.62 inner preview ring). */
  private drawBigMiniRing(
    center: Hex,
    pathScale: number,
    strokeColor: string,
    width: number,
    rotationDeg: number,
  ): void {
    const { layout } = this;
    const p = layout.hexToPixel(center);
    this.drawBigMiniRingAtPoint(p, pathScale, strokeColor, width, rotationDeg);
  }

  private drawBigMiniRingAtPoint(
    point: Point,
    pathScale: number,
    strokeColor: string,
    width: number,
    rotationDeg = 0,
  ): void {
    const { ctx, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const lineW = width / this.camera.zoom / pathScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(pathScale, pathScale);
    ctx.beginPath();
    this.addBigMiniHexonOuterPath(ctx, layout, 1);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
  }

  // ── Coordinates ──

  private drawCoordinates(hex: Hex): void {
    const { ctx, config, layout } = this;
    const center = layout.hexToPixel(hex);
    ctx.fillStyle = config.coordinateColor;
    ctx.font = config.coordinateFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${hex.q},${hex.r}`, center.x, center.y);
  }
}
