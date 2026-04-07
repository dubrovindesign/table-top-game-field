/**
 * Canvas renderer for the hex grid with hexon visualisation.
 */

import { Hex, Layout, type Point } from './hex';
import { type HexGrid } from './grid';
import {
  BIG_MINI_VISUAL_SCALE,
  BIG_UNIT_HEALTH_UI_SCALE,
  bigMiniActivationToggleCenterWorld,
  bigMiniHealthBadgeCenterWorld,
  LARGE_MINI_VISUAL_SCALE,
  LARGE_UNIT_HEALTH_UI_SCALE,
  largeMiniActivationToggleCenterWorld,
  largeMiniHealthBadgeCenterWorld,
  HUGE_MINI_VISUAL_SCALE,
  HUGE_UNIT_HEALTH_UI_SCALE,
  hugeMiniActivationToggleCenterFromPivotWorld,
  hugeMiniDrawPivotWorld,
  hugeMiniHealthBadgeCenterWorld,
  SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
  smallUnitActivationToggleCenterWorldRad,
  smallUnitHealthBadgeCenterWorldRad,
} from './healthUi';
import {
  etherVortexCrystalBadgeHalfWorld,
  getEtherVortexBlendColor,
  type EtherVortexDomainId,
} from './etherVortex';
import {
  getGodCardById,
  getGodCardSpriteImage,
  godCardSpriteSourcePixels,
  type GodTablePiece,
} from './godCards';
import { EFFECT_MARKERS, type EffectMarkerId } from './effectMarkerMenu';
import type { TableDragKind, TableDragState } from './multiplayer/protocol.ts';
import { defaultRenderConfig, type RenderConfig } from './renderConfig';

export type { RenderConfig };
export { defaultRenderConfig };

/** Canvas font stack for HP digits (see index.html Google Fonts link). */
const HEALTH_VALUE_FONT = '"Langar", cursive';

/** God deck / discard / loose cards — half-extents in board/world space (scale with zoom). */
export const GOD_TABLE_CARD_HW = Math.round(66 * 0.8);
export const GOD_TABLE_CARD_HH = Math.round(93 * 0.8);
/** Clockwise tilt for all god table cards (canvas °; positive = clockwise). */
export const GOD_TABLE_CARD_ROT_CW_DEG = 10;
/** Double-click flip duration (ms). */
export const GOD_TABLE_CARD_FLIP_MS = 400;

/** Remote peer drag overlay (multiplayer ghost). */
export type RemotePeerTableDragPaint = {
  fromId: string;
  color: string;
  drag: TableDragState;
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
  private unitOffBoardWorlds: (Point | undefined)[] = [];
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
  private bigMiniOffBoardWorlds: (Point | undefined)[] = [];
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
  private terrainRotationDegs: number[] = [];
  private terrainOffBoardWorlds: (Point | undefined)[] = [];
  private etherVortexEntries: Array<{
    center: Hex;
    etherCrystals: number;
    domain: EtherVortexDomainId | null;
    rotationDeg: number;
    offBoardWorld?: Point;
  }> = [];
  private draggingEtherVortexIndex: number | null = null;
  private etherVortexPreviewWorld: Point | null = null;
  private selectedEtherVortexIndex: number | null = null;
  private unitEffectMarkers: EffectMarkerId[][] = [];
  private bigMiniEffectMarkers: EffectMarkerId[][] = [];
  private effectMarkerImages = new Map<string, HTMLImageElement>();
  private effectMarkerImagesLoading = new Set<string>();
  private bigMiniRotationDeg: number[] = [];
  // ── Large mini (3-hex triangle) state ──
  private largeMiniAnchors: Hex[] = [];
  private largeMiniOffBoardWorlds: (Point | undefined)[] = [];
  private largeMiniPreviewPosition: Point | null = null;
  private draggingLargeMiniIndex: number | null = null;
  private largeMiniDragOverAnchor: Hex | null = null;
  private largeMiniWalkHexes: Hex[] = [];
  private largeMiniRunHexes: Hex[] = [];
  private selectedLargeMiniIndex: number | null = null;
  private largeMiniRotationDeg: number[] = [];
  private largeMiniHealthValues: number[] = [];
  private openHealthControlsLargeMiniIndex: number | null = null;
  private largeMiniEffectMarkers: EffectMarkerId[][] = [];
  private largeMiniSpriteSrcs: (string | null)[] = [];
  // ── Huge mini (3-hexon triangle) state ──
  private hugeMiniAnchors: Hex[] = [];
  private hugeMiniOffBoardWorlds: (Point | undefined)[] = [];
  private hugeMiniPreviewPosition: Point | null = null;
  private draggingHugeMiniIndex: number | null = null;
  private hugeMiniDragOverAnchor: Hex | null = null;
  private hugeMiniWalkHexonCenters: Hex[] = [];
  private hugeMiniRunHexonCenters: Hex[] = [];
  private selectedHugeMiniIndex: number | null = null;
  private hugeMiniRotationDeg: number[] = [];
  private hugeMiniHealthValues: number[] = [];
  private openHealthControlsHugeMiniIndex: number | null = null;
  private hugeMiniEffectMarkers: EffectMarkerId[][] = [];
  private hugeMiniSpriteSrc: string | null = null;
  private unitActivated: boolean[] = [];
  private bigMiniActivated: boolean[] = [];
  private largeMiniActivated: boolean[] = [];
  private hugeMiniActivated: boolean[] = [];

  private spriteImageCache = new Map<string, HTMLImageElement>();
  private spriteImageLoading = new Set<string>();
  private spriteImageFailed = new Set<string>();
  private backgroundImage: HTMLImageElement | null = null;
  private backgroundImageSrcLoaded: string | null = null;
  private backgroundImageSrcFailed: string | null = null;

  /** God cards / decks on the table. */
  private godTablePieces: GodTablePiece[] = [];
  private godLooseDraggingIndex: number | null = null;
  private godLoosePreviewWorld: Point | null = null;
  private selectedGodTablePieceIndex: number | null = null;
  /** Active flip animation for one loose god piece (index in `godTablePieces`). */
  private godPieceFlipAnim: {
    index: number;
    startMs: number;
    durationMs: number;
    fromFaceUp: boolean;
  } | null = null;

  /** Other players' cursors in board/world space (same as hex layout). */
  private remoteBoardPointers: Array<{
    boardX: number;
    boardY: number;
    color: string;
    label?: string;
  }> = [];

  /** In-flight table drags from other peers (ghost previews). */
  private remotePeerTableDrags: RemotePeerTableDragPaint[] = [];

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

  /** Radians: extra twist inside miniature local frame for sprites (opposite seat keeps art screen-upright). */
  private get oppositeSeatMiniatureRadFix(): number {
    return (this.config.oppositeSeatUnitRotationCorrectionDeg * Math.PI) / 180;
  }

  /** World-space bitmap drawn upright when opposite-seat correction is active (effect icons, etc.). */
  private drawImageUprightForOppositeSeat(
    ctx: CanvasRenderingContext2D,
    img: CanvasImageSource,
    cx: number,
    cy: number,
    w: number,
    h: number,
  ): void {
    const f = this.oppositeSeatMiniatureRadFix;
    if (f === 0) {
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      return;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-f);
    ctx.translate(-cx, -cy);
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
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

  setUnits(unitHexes: Hex[], selectedUnitIndex: number | null, offBoardWorlds?: (Point | undefined)[]): void {
    this.unitHexes = [...unitHexes];
    this.selectedUnitIndex = selectedUnitIndex;
    this.unitOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
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
    offBoardWorlds?: (Point | undefined)[],
  ): void {
    this.terrainCenterHexes = [...terrainCenterHexes];
    this.terrainPreviewWorld = terrainPreviewWorld;
    this.terrainDragging = isTerrainDragging;
    this.draggingTerrainIndex = draggingTerrainIndex;
    this.terrainDragOverCenter = dragOverCenter;
    this.selectedTerrainIndex = selectedTerrainIndex;
    this.terrainOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
  }

  setEtherVortexes(
    entries: ReadonlyArray<{
      center: Hex;
      etherCrystals: number;
      domain: EtherVortexDomainId | null;
      rotationDeg: number;
      offBoardWorld?: { x: number; y: number };
    }>,
    selectedIndex: number | null = null,
  ): void {
    this.etherVortexEntries = entries.map((e) => ({
      center: new Hex(e.center.q, e.center.r),
      etherCrystals: e.etherCrystals,
      domain: e.domain,
      rotationDeg: e.rotationDeg,
      offBoardWorld: e.offBoardWorld ? { ...e.offBoardWorld } : undefined,
    }));
    this.selectedEtherVortexIndex = selectedIndex;
  }

  setEtherVortexDrag(
    draggingIndex: number | null,
    previewWorld: Point | null,
    _dragOverCenter: Hex | null,
  ): void {
    this.draggingEtherVortexIndex = draggingIndex;
    this.etherVortexPreviewWorld = previewWorld;
  }

  setUnitEffectMarkers(markers: EffectMarkerId[][]): void {
    this.unitEffectMarkers = markers;
  }

  setBigMiniEffectMarkers(markers: EffectMarkerId[][]): void {
    this.bigMiniEffectMarkers = markers;
  }

  setGodLoosePieces(
    pieces: ReadonlyArray<GodTablePiece>,
    draggingIndex: number | null,
    previewWorld: Point | null,
    selectedPieceIndex: number | null = null,
  ): void {
    this.godTablePieces = pieces.map((p) =>
      p.kind === 'single'
        ? { kind: 'single', id: p.id, world: { ...p.world }, faceUp: p.faceUp }
        : { kind: 'deck', ids: [...p.ids], world: { ...p.world }, faceUp: p.faceUp },
    );
    this.godLooseDraggingIndex = draggingIndex;
    this.godLoosePreviewWorld = previewWorld ? { ...previewWorld } : null;
    this.selectedGodTablePieceIndex = selectedPieceIndex;
  }

  setGodPieceFlipAnim(
    anim: {
      index: number;
      startMs: number;
      durationMs: number;
      fromFaceUp: boolean;
    } | null,
  ): void {
    this.godPieceFlipAnim = anim ? { ...anim } : null;
  }

  /** Board-space center of the ether crystal chip (same anchor as screen-fixed badge). */
  getEtherVortexCrystalBadgeBoard(center: Hex, vortexRotationDeg: number, offBoardWorld?: Point): { x: number; y: number } {
    const pivot = offBoardWorld ?? this.layout.hexToPixel(center);
    const w = this.etherVortexBadgeWorldFromPivot(pivot, vortexRotationDeg);
    return { x: w.x, y: w.y };
  }

  /** Same geometry as the badge, for any vortex pivot (e.g. drag preview world position). */
  getEtherVortexCrystalBadgeBoardAtPivot(pivot: Point, vortexRotationDeg: number): { x: number; y: number } {
    const w = this.etherVortexBadgeWorldFromPivot(pivot, vortexRotationDeg);
    return { x: w.x, y: w.y };
  }

  private etherVortexBadgeWorldFromPivot(pivot: Point, vortexRotationDeg: number): Point {
    const b = this.bigMiniHexonBoundsLocal(this.layout);
    const badgeLocalY = b.minY + this.layout.size.y * 0.22;
    const rotRad = (vortexRotationDeg * Math.PI) / 180;
    return {
      x: pivot.x - Math.sin(rotRad) * badgeLocalY,
      y: pivot.y + Math.cos(rotRad) * badgeLocalY,
    };
  }

  setBigMiniatures(
    centers: Hex[],
    previewPosition: Point | null,
    draggingIndex: number | null,
    dragOverCenter: Hex | null,
    offBoardWorlds?: (Point | undefined)[],
  ): void {
    this.bigMiniCenters = [...centers];
    this.bigMiniPreviewPosition = previewPosition;
    this.draggingBigMiniIndex = draggingIndex;
    this.bigMiniDragOverCenter = dragOverCenter;
    this.bigMiniOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
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

  setUnitActivated(values: boolean[]): void {
    this.unitActivated = [...values];
  }

  setBigMiniActivated(values: boolean[]): void {
    this.bigMiniActivated = [...values];
  }

  setLargeMiniActivated(values: boolean[]): void {
    this.largeMiniActivated = [...values];
  }

  setHugeMiniActivated(values: boolean[]): void {
    this.hugeMiniActivated = [...values];
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

  /** Per-terrain hexon rotation (degrees), same order as `setTerrain` centers. */
  setTerrainRotations(degrees: number[]): void {
    this.terrainRotationDegs = [...degrees];
  }

  setBigMiniRotations(degrees: number[]): void {
    this.bigMiniRotationDeg = [...degrees];
  }

  // ── Large mini setters ──

  setLargeMiniatures(
    anchors: Hex[],
    previewPosition: Point | null,
    draggingIndex: number | null,
    dragOverAnchor: Hex | null,
    offBoardWorlds?: (Point | undefined)[],
  ): void {
    this.largeMiniAnchors = [...anchors];
    this.largeMiniPreviewPosition = previewPosition;
    this.draggingLargeMiniIndex = draggingIndex;
    this.largeMiniDragOverAnchor = dragOverAnchor;
    this.largeMiniOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
  }

  setLargeMiniMovement(
    selectedIndex: number | null,
    walkHexes: Hex[],
    runHexes: Hex[],
  ): void {
    this.selectedLargeMiniIndex = selectedIndex;
    this.largeMiniWalkHexes = [...walkHexes];
    this.largeMiniRunHexes = [...runHexes];
  }

  setLargeMiniRotations(degrees: number[]): void {
    this.largeMiniRotationDeg = [...degrees];
  }

  setLargeMiniHealth(values: number[], openControlsIndex: number | null): void {
    this.largeMiniHealthValues = [...values];
    this.openHealthControlsLargeMiniIndex = openControlsIndex;
  }

  setLargeMiniEffectMarkers(markers: EffectMarkerId[][]): void {
    this.largeMiniEffectMarkers = markers;
  }

  setLargeMiniSpriteSources(srcs: (string | null)[]): void {
    this.largeMiniSpriteSrcs = [...srcs];
  }

  // ── Huge mini setters ──

  setHugeMiniatures(
    anchors: Hex[],
    previewPosition: Point | null,
    draggingIndex: number | null,
    dragOverAnchor: Hex | null,
    offBoardWorlds?: (Point | undefined)[],
  ): void {
    this.hugeMiniAnchors = [...anchors];
    this.hugeMiniPreviewPosition = previewPosition;
    this.draggingHugeMiniIndex = draggingIndex;
    this.hugeMiniDragOverAnchor = dragOverAnchor;
    this.hugeMiniOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
  }

  setHugeMiniMovement(
    selectedIndex: number | null,
    walkHexonCenters: Hex[],
    runHexonCenters: Hex[],
  ): void {
    this.selectedHugeMiniIndex = selectedIndex;
    this.hugeMiniWalkHexonCenters = [...walkHexonCenters];
    this.hugeMiniRunHexonCenters = [...runHexonCenters];
  }

  setHugeMiniRotations(degrees: number[]): void {
    this.hugeMiniRotationDeg = [...degrees];
  }

  setHugeMiniHealth(values: number[], openControlsIndex: number | null): void {
    this.hugeMiniHealthValues = [...values];
    this.openHealthControlsHugeMiniIndex = openControlsIndex;
  }

  setHugeMiniEffectMarkers(markers: EffectMarkerId[][]): void {
    this.hugeMiniEffectMarkers = markers;
  }

  setHugeMiniSpriteSource(src: string | null): void {
    this.hugeMiniSpriteSrc = src;
  }

  updateConfig(patch: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  setRemoteBoardPointers(
    pointers: Array<{
      boardX: number;
      boardY: number;
      color: string;
      label?: string;
    }>,
  ): void {
    this.remoteBoardPointers = [...pointers];
  }

  setRemotePeerTableDrags(peers: RemotePeerTableDragPaint[]): void {
    this.remotePeerTableDrags = [...peers];
  }

  private isPeerDraggingEntity(kind: TableDragKind, index: number): boolean {
    if (kind === 'none') return false;
    return this.remotePeerTableDrags.some(
      (p) =>
        p.drag.kind === kind &&
        p.drag.index === index &&
        p.drag.worldX !== null &&
        p.drag.worldY !== null,
    );
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

    // Pass 4b: ether vortexes (silhouette + tint + crystal chip in world space)
    this.drawEtherVortexes();

    // Pass 5: drag target highlight
    this.drawDragHoverHex();

    // Pass 6: optional thick border for a highlighted hexon
    if (config.hexonBorderWidth > 0) {
      this.drawHexonBorders();
    }

    // Pass 7: big mini movement range (hexon-level)
    this.drawBigMiniMovement();

    // Pass 7a: huge mini movement range (hexon-level, 3-hexon triangles)
    this.drawHugeMiniMovement();

    // Pass 7b: attack range for big miniatures (on top of walk/run rings)
    this.drawAttackRangeBigHighlights();

    // Pass 8: big miniatures (hexon-sized)
    this.drawBigMiniatures();

    // Pass 8a: huge miniatures (3-hexon triangle)
    this.drawHugeMiniatures();

    // Pass 8b: terrain selection (on top of big minis that share hexes with terrain)
    this.drawTerrainSelectionRing();
    this.drawEtherVortexSelectionRing();

    // Pass 8c: large mini movement range (hex-level, 3-hex triangles)
    this.drawLargeMiniMovement();

    // Pass 8d: large miniatures (3-hex triangle)
    this.drawLargeMiniatures();

    // Pass 9: unit miniature (small)
    this.drawUnits();

    // Pass 9b: свободные карты богов
    this.drawGodLooseCards();
    this.drawGodTablePieceSelectionRing();

    // Pass 10: coordinate labels
    if (config.showCoordinates) {
      for (const hex of this.grid.allHexes()) {
        this.drawCoordinates(hex);
      }
    }

    this.drawRemoteBoardPointers();

    ctx.restore();
  }

  private drawRemoteBoardPointers(): void {
    if (this.remoteBoardPointers.length === 0) return;
    const { ctx } = this;
    const z = this.camera.zoom;
    const r = 9 / z;
    const ring = 2 / z;
    for (const p of this.remoteBoardPointers) {
      ctx.beginPath();
      ctx.arc(p.boardX, p.boardY, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = ring;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (p.label) {
        ctx.font = `${Math.max(9, 11 / z)}px sans-serif`;
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3 / z;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const tx = p.boardX + r * 1.15;
        const ty = p.boardY - r * 0.2;
        ctx.strokeText(p.label, tx, ty);
        ctx.fillText(p.label, tx, ty);
      }
    }
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
      this.draggingLargeMiniIndex === null &&
      this.draggingHugeMiniIndex === null &&
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

  private applyGodTableCardVisualRotation(ctx: CanvasRenderingContext2D): void {
    const deg =
      GOD_TABLE_CARD_ROT_CW_DEG + this.config.oppositeSeatUnitRotationCorrectionDeg;
    ctx.rotate((deg * Math.PI) / 180);
  }

  /** Face-up god card rect centered at `world` (board space; scales with camera zoom). */
  private drawGodCardFaceWorld(world: Point, cardId: string | null, emptyCenterLabel: string): void {
    const { ctx } = this;
    const z = this.camera.zoom;
    const lw = 2 / z;
    const hw = GOD_TABLE_CARD_HW;
    const hh = GOD_TABLE_CARD_HH;
    ctx.save();
    ctx.translate(world.x, world.y);
    this.applyGodTableCardVisualRotation(ctx);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 4 / z);
    ctx.fillStyle = 'rgba(28, 28, 34, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = lw;
    ctx.stroke();
    const def = cardId ? getGodCardById(cardId) : undefined;
    if (def) {
      const sheet = getGodCardSpriteImage(def.sprite.sheet);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 4 / z);
      ctx.clip();
      if (sheet && sheet.complete && sheet.naturalWidth > 0) {
        const { sx, sy, sw, sh } = godCardSpriteSourcePixels(
          def,
          sheet.naturalWidth,
          sheet.naturalHeight,
        );
        /* Без сглаживания — как в DOM-слепой зоне; иначе билинейный фильтр размывает текст на карте. */
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet, sx, sy, sw, sh, -hw, -hh, hw * 2, hh * 2);
        ctx.imageSmoothingEnabled = prevSmooth;
      } else {
        ctx.fillStyle = 'rgba(28, 28, 34, 0.95)';
        ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = `${11 / z}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('…', 0, 0);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emptyCenterLabel, 0, 0);
    }
    ctx.restore();
  }

  private drawGodCardBackWorld(world: Point, stackCount: number): void {
    const { ctx } = this;
    const z = this.camera.zoom;
    const lw = 2 / z;
    const hw = GOD_TABLE_CARD_HW;
    const hh = GOD_TABLE_CARD_HH;
    ctx.save();
    ctx.translate(world.x, world.y);
    this.applyGodTableCardVisualRotation(ctx);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 4 / z);
    const g = ctx.createLinearGradient(-hw, -hh, hw, hh);
    g.addColorStop(0, '#5e35b1');
    g.addColorStop(0.5, '#1a237e');
    g.addColorStop(1, '#4527a0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stackCount <= 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${24 / z}px system-ui,sans-serif`;
      ctx.fillText('✦', 0, 0);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `bold ${22 / z}px system-ui,sans-serif`;
      ctx.fillText(String(stackCount), 0, -hh * 0.28);
      ctx.font = `${14 / z}px system-ui,sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('боги', 0, hh * 0.32);
    }
    ctx.restore();
  }

  /** Subtle offset rects behind a stack (world space). */
  private drawGodStackUnderlayers(world: Point, extra: number): void {
    if (extra <= 0) return;
    const { ctx } = this;
    const z = this.camera.zoom;
    const hw = GOD_TABLE_CARD_HW;
    const hh = GOD_TABLE_CARD_HH;
    const step = 2.8 / z;
    const layers = Math.min(3, extra);
    for (let i = layers; i >= 1; i--) {
      const o = i * step;
      ctx.save();
      ctx.translate(world.x - o, world.y - o);
      this.applyGodTableCardVisualRotation(ctx);
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 4 / z);
      ctx.fillStyle = 'rgba(12, 12, 18, 0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1 / z;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawGodDeckCountBadge(world: Point, n: number): void {
    if (n <= 1) return;
    const { ctx } = this;
    const z = this.camera.zoom;
    const hw = GOD_TABLE_CARD_HW;
    const hh = GOD_TABLE_CARD_HH;
    ctx.save();
    ctx.translate(world.x, world.y);
    this.applyGodTableCardVisualRotation(ctx);
    ctx.font = `bold ${11 / z}px system-ui,sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`×${n}`, hw - 5 / z, hh - 5 / z);
    ctx.restore();
  }

  /** Draw one loose piece using an explicit face (for flip animation mid-turn). */
  private drawGodTablePieceWithFace(p: GodTablePiece, world: Point, faceUp: boolean): void {
    if (p.kind === 'single') {
      if (faceUp) this.drawGodCardFaceWorld(world, p.id, '?');
      else this.drawGodCardBackWorld(world, 1);
      return;
    }
    const n = p.ids.length;
    const topId = p.ids[n - 1] ?? null;
    const under = Math.min(3, Math.max(0, n - 1));
    this.drawGodStackUnderlayers(world, under);
    if (faceUp) {
      this.drawGodCardFaceWorld(world, topId, '?');
      this.drawGodDeckCountBadge(world, n);
    } else {
      this.drawGodCardBackWorld(world, n);
    }
  }

  private drawGodTablePiece(p: GodTablePiece, world: Point, pieceIndex: number): void {
    const anim = this.godPieceFlipAnim;
    if (anim && anim.index === pieceIndex) {
      const elapsed = performance.now() - anim.startMs;
      if (elapsed < anim.durationMs) {
        const t = Math.min(1, elapsed / anim.durationMs);
        const scaleX = Math.max(0.06, Math.abs(Math.cos(Math.PI * t)));
        const showFaceUp = t < 0.5 ? anim.fromFaceUp : p.faceUp;
        const { ctx } = this;
        ctx.save();
        ctx.translate(world.x, world.y);
        ctx.scale(scaleX, 1);
        ctx.translate(-world.x, -world.y);
        this.drawGodTablePieceWithFace(p, world, showFaceUp);
        ctx.restore();
        return;
      }
    }
    this.drawGodTablePieceWithFace(p, world, p.faceUp);
  }

  private drawGodLooseCards(): void {
    for (let i = 0; i < this.godTablePieces.length; i++) {
      const p = this.godTablePieces[i]!;
      const remoteGod = this.remotePeerTableDrags.find(
        (x) =>
          x.drag.kind === 'godLoose' &&
          x.drag.index === i &&
          x.drag.worldX !== null &&
          x.drag.worldY !== null,
      );
      let w: Point = p.world;
      if (this.godLooseDraggingIndex === i && this.godLoosePreviewWorld) {
        w = this.godLoosePreviewWorld;
      } else if (remoteGod) {
        w = { x: remoteGod.drag.worldX!, y: remoteGod.drag.worldY! };
      }
      this.drawGodTablePiece(p, w, i);
    }
  }

  /** Green outline for selected god card / deck (same accent as terrain). */
  private drawGodTablePieceSelectionRing(): void {
    if (this.selectedGodTablePieceIndex === null) return;
    const i = this.selectedGodTablePieceIndex;
    const p = this.godTablePieces[i];
    if (!p) return;
    const world =
      this.godLooseDraggingIndex === i && this.godLoosePreviewWorld
        ? this.godLoosePreviewWorld
        : p.world;
    const { ctx } = this;
    const z = this.camera.zoom;
    const hw = GOD_TABLE_CARD_HW * 1.08;
    const hh = GOD_TABLE_CARD_HH * 1.08;
    const r = 5 / z;
    ctx.save();
    ctx.translate(world.x, world.y);
    this.applyGodTableCardVisualRotation(ctx);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r);
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 3 / z;
    ctx.stroke();
    ctx.restore();
  }

  private drawUnits(): void {
    const { ctx, layout, config } = this;
    const { halfH } = this.hexHalfExtentFromLayout();

    this.unitHexes.forEach((unitHex, index) => {
      if (this.draggingUnitIndex === index && this.dragPreviewPosition) {
        return;
      }
      if (this.isPeerDraggingEntity('unit', index)) {
        return;
      }
      const offBoard = this.unitOffBoardWorlds[index];
      const center = offBoard ?? layout.hexToPixel(unitHex);
      const rotDegModel = this.unitRotationDeg[index] ?? 0;
      const rotRadModel = (rotDegModel * Math.PI) / 180;
      const rotRadVisual =
        ((rotDegModel + this.config.oppositeSeatUnitRotationCorrectionDeg) * Math.PI) / 180;
      const sprite = this.getSpriteImage(this.unitSpriteSrcs[index] ?? null);

      this.drawSmallUnitInHex(center, rotRadModel, sprite, () => {
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(rotRadModel);
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
        this.strokeHexAtCenterRotated(center, rotRadModel, '#4caf50', 2.5);
      }

      this.drawHealthBadgeAt(
        center,
        halfH,
        this.unitHealthValues[index] ?? 0,
        this.openHealthControlsUnitIndex === index,
        SMALL_UNIT_HEALTH_BADGE_SCALE,
        'insideHexSmallUnit',
        rotRadVisual,
      );
      {
        const tr = halfH * 0.2175;
        const tc = smallUnitActivationToggleCenterWorldRad(center, rotRadVisual, layout);
        this.drawActivationToggle(tc, tr, this.unitActivated[index] !== false);
      }

      const markers = this.unitEffectMarkers[index];
      if (markers && markers.length > 0) {
        this.drawEffectMarkers(center, markers, halfH, 'small', rotRadVisual);
      }
    });

    if (this.draggingUnitIndex !== null && this.dragPreviewPosition) {
      const rotDegModel = this.unitRotationDeg[this.draggingUnitIndex] ?? 0;
      const rotRadModel = (rotDegModel * Math.PI) / 180;
      const rotRadVisual =
        ((rotDegModel + this.config.oppositeSeatUnitRotationCorrectionDeg) * Math.PI) / 180;
      const sprite = this.getSpriteImage(
        this.unitSpriteSrcs[this.draggingUnitIndex] ?? null,
      );
      this.drawSmallUnitInHex(this.dragPreviewPosition, rotRadModel, sprite, () => {
        ctx.save();
        ctx.translate(this.dragPreviewPosition!.x, this.dragPreviewPosition!.y);
        ctx.rotate(rotRadModel);
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
        'insideHexSmallUnit',
        rotRadVisual,
      );
      {
        const tr = halfH * 0.2175;
        const tc = smallUnitActivationToggleCenterWorldRad(
          this.dragPreviewPosition!,
          rotRadVisual,
          layout,
        );
        this.drawActivationToggle(
          tc,
          tr,
          this.unitActivated[this.draggingUnitIndex] !== false,
        );
      }
      const dragMarkers = this.unitEffectMarkers[this.draggingUnitIndex];
      if (dragMarkers && dragMarkers.length > 0) {
        this.drawEffectMarkers(
          this.dragPreviewPosition,
          dragMarkers,
          halfH,
          'small',
          rotRadVisual,
        );
      }
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'unit' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.unitHexes.length) continue;
      const pos = { x: d.worldX, y: d.worldY };
      const rotDegModel = this.unitRotationDeg[d.index] ?? 0;
      const rotRadModel = (rotDegModel * Math.PI) / 180;
      const rotRadVisual =
        ((rotDegModel + this.config.oppositeSeatUnitRotationCorrectionDeg) * Math.PI) / 180;
      const sprite = this.getSpriteImage(this.unitSpriteSrcs[d.index] ?? null);
      ctx.save();
      ctx.globalAlpha = 0.72;
      this.drawSmallUnitInHex(pos, rotRadModel, sprite, () => {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(rotRadModel);
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
        pos,
        halfH,
        this.unitHealthValues[d.index] ?? 0,
        false,
        SMALL_UNIT_HEALTH_BADGE_SCALE,
        'insideHexSmallUnit',
        rotRadVisual,
      );
      {
        const tr = halfH * 0.2175;
        const tc = smallUnitActivationToggleCenterWorldRad(pos, rotRadVisual, layout);
        this.drawActivationToggle(tc, tr, this.unitActivated[d.index] !== false);
      }
      const rMarkers = this.unitEffectMarkers[d.index];
      if (rMarkers && rMarkers.length > 0) {
        this.drawEffectMarkers(pos, rMarkers, halfH, 'small', rotRadVisual);
      }
      ctx.restore();
      this.strokeHexAtCenterRotated(pos, rotRadModel, rp.color, 2.4);
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

  /** Bbox center of a shape in local layout units (rotation pivot for multi-hex minis). */
  private localBoundsCenter(b: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }): Point {
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
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
    const f = this.oppositeSeatMiniatureRadFix;
    if (f !== 0) ctx.rotate(f);
    ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
    if (f !== 0) ctx.rotate(-f);
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

  /** HP badge: red circle + white ring; small unit = bottom-right in hex; big = bottom inside hexon. */
  private drawHealthBadgeAt(
    miniatureCenter: Point,
    miniatureRadius: number,
    health: number,
    showPlusMinus: boolean,
    scale = 1,
    verticalPlacement:
      | 'above'
      | 'insideHexSmallUnit'
      | 'insideHexBigUnitBottom'
      | 'insideHexLargeUnit'
      | 'insideHexHugeUnit' = 'above',
    rotationRad = 0,
  ): void {
    const { ctx } = this;
    let effectiveRadius = miniatureRadius * scale;
    let badgeCenter: Point;
    if (verticalPlacement === 'insideHexSmallUnit') {
      badgeCenter = smallUnitHealthBadgeCenterWorldRad(
        miniatureCenter,
        rotationRad,
        this.layout,
      );
    } else if (verticalPlacement === 'insideHexBigUnitBottom') {
      badgeCenter = bigMiniHealthBadgeCenterWorld(
        miniatureCenter,
        (rotationRad * 180) / Math.PI,
        this.layout,
      );
    } else if (verticalPlacement === 'insideHexLargeUnit') {
      badgeCenter = largeMiniHealthBadgeCenterWorld(
        miniatureCenter,
        (rotationRad * 180) / Math.PI,
        this.layout,
      );
    } else if (verticalPlacement === 'insideHexHugeUnit') {
      badgeCenter = hugeMiniHealthBadgeCenterWorld(
        miniatureCenter,
        (rotationRad * 180) / Math.PI,
        this.layout,
      );
    } else {
      badgeCenter = {
        x: miniatureCenter.x,
        y: miniatureCenter.y - effectiveRadius * 1.55,
      };
    }
    if (verticalPlacement === 'insideHexSmallUnit' && showPlusMinus) {
      effectiveRadius *= SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN;
    }
    const badgeRadius = effectiveRadius * 0.48;

    ctx.beginPath();
    ctx.arc(badgeCenter.x, badgeCenter.y, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#e53935';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.35 / this.camera.zoom;
    ctx.stroke();

    const fixDeg = this.config.oppositeSeatUnitRotationCorrectionDeg;
    if (fixDeg !== 0) {
      ctx.save();
      ctx.translate(badgeCenter.x, badgeCenter.y);
      ctx.rotate((-fixDeg * Math.PI) / 180);
      ctx.translate(-badgeCenter.x, -badgeCenter.y);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, effectiveRadius * 0.72)}px ${HEALTH_VALUE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(health), badgeCenter.x, badgeCenter.y);

    if (!showPlusMinus) {
      if (fixDeg !== 0) ctx.restore();
      return;
    }

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
    if (fixDeg !== 0) ctx.restore();
  }

  /** Activation state: yellow = active, gray = inactive (board/world space). */
  private drawActivationToggle(
    centerWorld: Point,
    radiusWorld: number,
    activated: boolean,
  ): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(centerWorld.x, centerWorld.y, radiusWorld, 0, Math.PI * 2);
    ctx.fillStyle = activated ? '#f5d000' : '#9ca3af';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.lineWidth = Math.max(1, 1.2 / this.camera.zoom);
    ctx.stroke();
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

  /** Load an effect marker SVG image (lazy, cached). */
  private getEffectMarkerImage(src: string): HTMLImageElement | null {
    const ready = this.effectMarkerImages.get(src);
    if (ready) return ready;
    if (this.effectMarkerImagesLoading.has(src)) return null;
    this.effectMarkerImagesLoading.add(src);
    const img = new Image();
    img.onload = () => {
      this.effectMarkerImagesLoading.delete(src);
      this.effectMarkerImages.set(src, img);
    };
    img.onerror = () => {
      this.effectMarkerImagesLoading.delete(src);
    };
    img.src = src;
    return null;
  }

  /**
   * Flat-top hex: slot 0 = bottom-left vertex, 1 = mid of edge to left tip, then CCW around the hex
   * (vertex / edge-mid alternating). Positions rotate with the unit.
   */
  private effectMarkerSlotLocalOffset(
    layout: Layout,
    slot: number,
    insetFrac: number,
  ): Point {
    const startCorner = 2; // bottom-left vertex (+y, -x) for flat-top
    if (slot % 2 === 0) {
      const ci = (startCorner + slot / 2) % 6;
      const v = layout.hexCornerOffset(ci);
      return { x: v.x * insetFrac, y: v.y * insetFrac };
    }
    const ci = (startCorner + (slot - 1) / 2) % 6;
    const a = layout.hexCornerOffset(ci);
    const b = layout.hexCornerOffset((ci + 1) % 6);
    return {
      x: ((a.x + b.x) / 2) * insetFrac,
      y: ((a.y + b.y) / 2) * insetFrac,
    };
  }

  /** Multi-hex mini silhouettes: effect markers sit on the left edge, same pivot as draw. */
  private effectMarkerMultiFootprintBounds(
    layout: Layout,
    footprint: 'bigHexon' | 'largeTri' | 'hugeTri',
  ): { b: { minX: number; maxX: number; minY: number; maxY: number }; vis: number } {
    if (footprint === 'bigHexon') {
      return { b: this.bigMiniHexonBoundsLocal(layout), vis: BIG_MINI_VISUAL_SCALE };
    }
    const cells =
      footprint === 'largeTri'
        ? this.largeTriangleLocalCellCenters(layout)
        : this.hugeTriangleLocalCellCenters(layout);
    return {
      b: this.boundsFromCells(cells, layout),
      vis: footprint === 'largeTri' ? LARGE_MINI_VISUAL_SCALE : HUGE_MINI_VISUAL_SCALE,
    };
  }

  /**
   * Large mini: evenly space effect icons along the longest open run of outer perimeter
   * (scaled local offsets from anchor), excluding edges near HP badge and activation dot.
   */
  /** Move a point on edge A→B toward polygon interior (local scaled space). */
  private offsetEffectMarkerInwardAlongSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    centroid: Point,
    inwardHalf: number,
  ): Point {
    const edx = bx - ax;
    const edy = by - ay;
    const elen = Math.hypot(edx, edy);
    if (elen < 1e-9) return { x: px, y: py };
    let nx = -edy / elen;
    let ny = edx / elen;
    if ((centroid.x - px) * nx + (centroid.y - py) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: px + nx * inwardHalf, y: py + ny * inwardHalf };
  }

  private largeTriEffectMarkerLocalScaledPositions(
    layout: Layout,
    count: number,
    rotationDeg: number,
    anchorWorld: Point,
    /** World-space: half icon + gap so the disc sits inside the stroke. */
    inwardHalf: number,
  ): Point[] | null {
    if (count <= 0) return [];
    const vis = LARGE_MINI_VISUAL_SCALE;
    const cells = this.largeTriangleLocalCellCenters(layout);
    const verts = this.outerVerticesFromCells(cells, layout, 1);
    if (verts.length < 3) return null;

    const scaled = verts.map((v) => ({ x: v.x * vis, y: v.y * vis }));
    const hpW = largeMiniHealthBadgeCenterWorld(anchorWorld, rotationDeg, layout);
    const actW = largeMiniActivationToggleCenterWorld(anchorWorld, rotationDeg, layout);
    const rotRad = (rotationDeg * Math.PI) / 180;
    const c = Math.cos(rotRad);
    const s = Math.sin(rotRad);
    const toWorld = (lx: number, ly: number): Point => ({
      x: anchorWorld.x + c * lx - s * ly,
      y: anchorWorld.y + s * lx + c * ly,
    });
    const blockR =
      Math.min(layout.size.x, layout.size.y) * LARGE_MINI_VISUAL_SCALE * 0.52;

    type Seg = { ax: number; ay: number; bx: number; by: number; len: number };
    const segs: Seg[] = [];
    for (let i = 0; i < scaled.length; i++) {
      const a = scaled[i]!;
      const b = scaled[(i + 1) % scaled.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len });
    }

    const edgeBlocked = (seg: Seg): boolean => {
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const lx = seg.ax + t * (seg.bx - seg.ax);
        const ly = seg.ay + t * (seg.by - seg.ay);
        const w = toWorld(lx, ly);
        if (
          Math.hypot(w.x - hpW.x, w.y - hpW.y) < blockR ||
          Math.hypot(w.x - actW.x, w.y - actW.y) < blockR
        ) {
          return true;
        }
      }
      return false;
    };

    const marked = segs.map((seg) => ({ seg, blocked: edgeBlocked(seg) }));
    const m = marked.length;
    let bestStart = 0;
    let bestLen = 0;
    const dbl = [...marked, ...marked];
    for (let start = 0; start < m; start++) {
      let len = 0;
      for (let k = 0; k < m; k++) {
        if (dbl[start + k]!.blocked) break;
        len++;
      }
      if (len > bestLen) {
        bestLen = len;
        bestStart = start;
      }
    }
    if (bestLen === 0) return null;

    const chain: Seg[] = [];
    for (let k = 0; k < bestLen; k++) {
      chain.push(marked[(bestStart + k) % m]!.seg);
    }
    const totalLen = chain.reduce((a, seg) => a + seg.len, 0);
    if (totalLen < 1e-6) return null;

    let tcx = 0;
    let tcy = 0;
    for (const v of scaled) {
      tcx += v.x;
      tcy += v.y;
    }
    tcx /= scaled.length;
    tcy /= scaled.length;
    const centroid = { x: tcx, y: tcy };

    const out: Point[] = [];
    for (let i = 0; i < count; i++) {
      const target = totalLen * (count === 1 ? 0.5 : (i + 0.5) / count);
      let acc = 0;
      let placed = false;
      for (const seg of chain) {
        if (acc + seg.len >= target - 1e-9) {
          const t = Math.max(0, Math.min(1, (target - acc) / seg.len));
          const px = seg.ax + t * (seg.bx - seg.ax);
          const py = seg.ay + t * (seg.by - seg.ay);
          out.push(
            this.offsetEffectMarkerInwardAlongSegment(
              px,
              py,
              seg.ax,
              seg.ay,
              seg.bx,
              seg.by,
              centroid,
              inwardHalf,
            ),
          );
          placed = true;
          break;
        }
        acc += seg.len;
      }
      if (!placed && chain.length > 0) {
        const segLast = chain[chain.length - 1]!;
        out.push(
          this.offsetEffectMarkerInwardAlongSegment(
            segLast.bx,
            segLast.by,
            segLast.ax,
            segLast.ay,
            segLast.bx,
            segLast.by,
            centroid,
            inwardHalf,
          ),
        );
      }
    }
    return out.length === count ? out : null;
  }

  /**
   * Effect markers: small units on single-hex perimeter (bottom-left, CCW);
   * multi-hex minis in a column on the left silhouette edge (pivot = bbox center).
   */
  private drawEffectMarkers(
    center: Point,
    markers: EffectMarkerId[],
    miniatureRadius: number,
    footprint: 'small' | 'bigHexon' | 'largeTri' | 'hugeTri',
    rotationRad = 0,
  ): void {
    if (markers.length === 0) return;
    const { ctx, layout } = this;
    const cosR = Math.cos(rotationRad);
    const sinR = Math.sin(rotationRad);

    const iconSizeBase =
      footprint === 'small'
        ? Math.max(6, miniatureRadius * 0.45)
        : Math.max(10, miniatureRadius * 0.28 * 1.5);
    const iconSize =
      footprint === 'largeTri' ? iconSizeBase * 0.8 : iconSizeBase;

    if (footprint !== 'small') {
      if (footprint === 'largeTri') {
        const rotDeg = (rotationRad * 180) / Math.PI;
        const drawable = markers.filter((id) =>
          EFFECT_MARKERS.some((m) => m.id === id),
        );
        const inwardHalf =
          iconSize * 0.5 + 2.5 / this.camera.zoom;
        const locals = this.largeTriEffectMarkerLocalScaledPositions(
          layout,
          drawable.length,
          rotDeg,
          center,
          inwardHalf,
        );
        if (locals && locals.length === drawable.length) {
          let di = 0;
          for (let i = 0; i < markers.length; i++) {
            const markerId = markers[i];
            const def = EFFECT_MARKERS.find((m) => m.id === markerId);
            if (!def) continue;
            const img = this.getEffectMarkerImage(def.iconSrc);
            const { x: sx, y: sy } = locals[di]!;
            di++;
            const cx = center.x + cosR * sx - sinR * sy;
            const cy = center.y + sinR * sx + cosR * sy;
            const half = iconSize / 2;

            ctx.beginPath();
            ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.35 / this.camera.zoom;
            ctx.stroke();

            if (img) {
              this.drawImageUprightForOppositeSeat(ctx, img, cx, cy, iconSize, iconSize);
            }
          }
          return;
        }
      }

      const { b, vis } = this.effectMarkerMultiFootprintBounds(layout, footprint);
      const cx0 = (b.minX + b.maxX) / 2;
      const cy0 = (b.minY + b.maxY) / 2;
      const n = markers.length;
      const leftInset = 0.9;
      const lx = b.minX * leftInset;
      const spanY = b.maxY - b.minY;

      for (let i = 0; i < n; i++) {
        const markerId = markers[i];
        const def = EFFECT_MARKERS.find((m) => m.id === markerId);
        if (!def) continue;
        const img = this.getEffectMarkerImage(def.iconSrc);
        const t = n === 1 ? 0.5 : (i + 0.5) / n;
        const ly = b.minY + t * spanY;
        let sx: number;
        let sy: number;
        if (footprint === 'largeTri') {
          const lxAdj = lx + 0.24 * (cx0 - lx);
          const lyAdj = ly + 0.1 * (cy0 - ly);
          sx = lxAdj * vis;
          sy = lyAdj * vis;
        } else {
          sx = (lx - cx0) * vis;
          sy = (ly - cy0) * vis;
        }
        const cx = center.x + cosR * sx - sinR * sy;
        const cy = center.y + sinR * sx + cosR * sy;
        const half = iconSize / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.35 / this.camera.zoom;
        ctx.stroke();

        if (img) {
          this.drawImageUprightForOppositeSeat(ctx, img, cx, cy, iconSize, iconSize);
        }
      }
      return;
    }

    const insetFrac = 0.78;

    for (let i = 0; i < markers.length; i++) {
      const markerId = markers[i];
      const def = EFFECT_MARKERS.find((m) => m.id === markerId);
      if (!def) continue;
      const img = this.getEffectMarkerImage(def.iconSrc);
      const local = this.effectMarkerSlotLocalOffset(layout, i, insetFrac);
      const sx = local.x;
      const sy = local.y;
      const cx = center.x + cosR * sx - sinR * sy;
      const cy = center.y + sinR * sx + cosR * sy;
      const half = iconSize / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.35 / this.camera.zoom;
      ctx.stroke();

      if (img) {
        this.drawImageUprightForOppositeSeat(ctx, img, cx, cy, iconSize, iconSize);
      }
    }
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
      const rotDeg =
        this.draggingBigMiniIndex !== null
          ? (this.bigMiniRotationDeg[this.draggingBigMiniIndex] ?? 0)
          : 0;
      const rotRad = (rotDeg * Math.PI) / 180;
      const hb = this.bigMiniHexonBoundsLocal(layout);
      const { x: hcx, y: hcy } = this.localBoundsCenter(hb);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(rotRad);
      ctx.scale(BIG_MINI_VISUAL_SCALE, BIG_MINI_VISUAL_SCALE);
      ctx.translate(-hcx, -hcy);
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom / BIG_MINI_VISUAL_SCALE;
      ctx.stroke();
      ctx.restore();
    }

    if (this.largeMiniDragOverAnchor) {
      const cells = this.largeTriangleLocalCellCenters(layout);
      const rotDeg =
        this.draggingLargeMiniIndex !== null
          ? (this.largeMiniRotationDeg[this.draggingLargeMiniIndex] ?? 0)
          : 0;
      const anchorP = layout.hexToPixel(this.largeMiniDragOverAnchor);
      const rotRad = (rotDeg * Math.PI) / 180;
      ctx.save();
      ctx.translate(anchorP.x, anchorP.y);
      ctx.rotate(rotRad);
      ctx.scale(LARGE_MINI_VISUAL_SCALE, LARGE_MINI_VISUAL_SCALE);
      ctx.translate(0, 0);
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom / LARGE_MINI_VISUAL_SCALE;
      ctx.stroke();
      ctx.restore();
    }

    if (this.hugeMiniDragOverAnchor) {
      const cells = this.hugeTriangleLocalCellCenters(layout);
      const rotDeg =
        this.draggingHugeMiniIndex !== null
          ? (this.hugeMiniRotationDeg[this.draggingHugeMiniIndex] ?? 0)
          : 0;
      const pivotP = hugeMiniDrawPivotWorld(this.hugeMiniDragOverAnchor, rotDeg, layout);
      const rotRad = (rotDeg * Math.PI) / 180;
      const ub = this.boundsFromCells(cells, layout);
      const { x: ucx, y: ucy } = this.localBoundsCenter(ub);
      ctx.save();
      ctx.translate(pivotP.x, pivotP.y);
      ctx.rotate(rotRad);
      ctx.scale(HUGE_MINI_VISUAL_SCALE, HUGE_MINI_VISUAL_SCALE);
      ctx.translate(-ucx, -ucy);
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.strokeStyle = config.dragHoverStrokeColor;
      ctx.lineWidth = 2 / this.camera.zoom / HUGE_MINI_VISUAL_SCALE;
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
    const drag = this.terrainDragging;
    // Like big mini: while dragging, hide dragged piece and draw full terrain at cursor.
    this.terrainCenterHexes.forEach((center, index) => {
      if (drag && this.draggingTerrainIndex === index) return;
      if (this.isPeerDraggingEntity('terrain', index)) return;
      const offBoard = this.terrainOffBoardWorlds[index];
      const pivot = offBoard ?? layout.hexToPixel(center);
      const rotDeg = this.terrainRotationDegs[index] ?? 0;
      const rotRad = (rotDeg * Math.PI) / 180;
      this.drawTerrainStyleHexonAtWorldPivot(pivot, rotRad, {
        domainBlendColor: null,
      });
    });
    if (drag && this.terrainPreviewWorld && this.draggingTerrainIndex !== null) {
      const previewRotDeg = this.terrainRotationDegs[this.draggingTerrainIndex] ?? 0;
      const rotRad = (previewRotDeg * Math.PI) / 180;
      this.drawTerrainStyleHexonAtWorldPivot(this.terrainPreviewWorld, rotRad, {
        domainBlendColor: null,
      });
    }
    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'terrain' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.terrainCenterHexes.length) continue;
      const rotDeg = this.terrainRotationDegs[d.index] ?? 0;
      const rotRad = (rotDeg * Math.PI) / 180;
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.72;
      this.drawTerrainStyleHexonAtWorldPivot({ x: d.worldX, y: d.worldY }, rotRad, {
        domainBlendColor: null,
      });
      ctx.restore();
    }
  }

  private drawEtherVortexes(): void {
    const { layout } = this;
    const drag = this.draggingEtherVortexIndex !== null;
    this.etherVortexEntries.forEach((v, index) => {
      if (drag && this.draggingEtherVortexIndex === index) return;
      if (this.isPeerDraggingEntity('ether', index)) return;
      const blend = getEtherVortexBlendColor(v.domain);
      const pivot = v.offBoardWorld ?? layout.hexToPixel(v.center);
      const rotRad = (v.rotationDeg * Math.PI) / 180;
      this.drawTerrainStyleHexonAtWorldPivot(pivot, rotRad, {
        domainBlendColor: blend,
      });
    });
    if (drag && this.etherVortexPreviewWorld) {
      const draggedEntry = this.etherVortexEntries[this.draggingEtherVortexIndex!];
      const blend = draggedEntry ? getEtherVortexBlendColor(draggedEntry.domain) : null;
      const previewRotDeg = draggedEntry?.rotationDeg ?? 0;
      const rotRad = (previewRotDeg * Math.PI) / 180;
      this.drawTerrainStyleHexonAtWorldPivot(this.etherVortexPreviewWorld, rotRad, {
        domainBlendColor: blend,
      });
    }
    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'ether' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.etherVortexEntries.length) continue;
      const entry = this.etherVortexEntries[d.index];
      if (!entry) continue;
      const rotRad = (entry.rotationDeg * Math.PI) / 180;
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.72;
      const blend = getEtherVortexBlendColor(entry.domain);
      this.drawTerrainStyleHexonAtWorldPivot({ x: d.worldX, y: d.worldY }, rotRad, {
        domainBlendColor: blend,
      });
      ctx.restore();
    }
    this.drawEtherVortexCrystalBadgesWorld();
  }

  /** Crystal count rhombus in board space (scales with zoom like the vortex hexon). */
  private drawEtherVortexCrystalBadgesWorld(): void {
    const { ctx, layout } = this;
    const z = this.camera.zoom;
    const half = etherVortexCrystalBadgeHalfWorld(layout);
    for (let vi = 0; vi < this.etherVortexEntries.length; vi++) {
      const v = this.etherVortexEntries[vi]!;
      const remoteEther = this.remotePeerTableDrags.find(
        (p) =>
          p.drag.kind === 'ether' &&
          p.drag.index === vi &&
          p.drag.worldX !== null &&
          p.drag.worldY !== null,
      );
      const pivot =
        this.draggingEtherVortexIndex === vi && this.etherVortexPreviewWorld
          ? this.etherVortexPreviewWorld
          : remoteEther
            ? { x: remoteEther.drag.worldX!, y: remoteEther.drag.worldY! }
            : (v.offBoardWorld ?? layout.hexToPixel(v.center));
      const world = this.etherVortexBadgeWorldFromPivot(pivot, v.rotationDeg);
      ctx.save();
      ctx.translate(world.x, world.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#1e88e5';
      ctx.strokeStyle = '#1565c0';
      ctx.lineWidth = 2 / z;
      ctx.beginPath();
      ctx.rect(-half, -half, half * 2, half * 2);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#ffffff';
      const fontPx = Math.max(11, Math.min(15, half * 1.02));
      ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fixDeg = this.config.oppositeSeatUnitRotationCorrectionDeg;
      if (fixDeg !== 0) {
        ctx.rotate((-fixDeg * Math.PI) / 180);
      }
      ctx.fillText(String(v.etherCrystals), 0, 0);
      ctx.restore();
    }
  }

  /**
   * Terrain / ether vortex: hexon silhouette with terrain texture; optional domain recolor.
   * For ether vortex, domain uses a solid fill with `globalCompositeOperation: 'color'` over the texture.
   * Ether crystal count is drawn in world space (`drawEtherVortexCrystalBadgesWorld`).
   */
  private drawTerrainStyleHexonAtWorldPivot(
    worldPivot: Point,
    rotRad: number,
    opts: { domainBlendColor: string | null },
  ): void {
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
      if (opts.domainBlendColor) {
        ctx.rotate(-texRotRad);
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = opts.domainBlendColor;
        ctx.beginPath();
        this.addBigMiniHexonOuterPath(ctx, layout, 1);
        ctx.fill();
        ctx.restore();
      }
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
      if (opts.domainBlendColor) {
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = opts.domainBlendColor;
        ctx.beginPath();
        this.addBigMiniHexonOuterPath(ctx, layout, 1);
        ctx.fill();
        ctx.restore();
      }
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
    const rotDeg = this.terrainRotationDegs[index] ?? 0;
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
    const offBoard = this.terrainOffBoardWorlds[index];
    if (offBoard) {
      this.drawBigMiniRingAtPoint(offBoard, 1.08, '#4caf50', 3, rotDeg);
    } else {
      this.drawBigMiniRing(center, 1.08, '#4caf50', 3, rotDeg);
    }
  }

  /** Selection ring for ether vortex (same style as terrain). */
  private drawEtherVortexSelectionRing(): void {
    if (this.selectedEtherVortexIndex === null) return;
    const index = this.selectedEtherVortexIndex;
    const entry = this.etherVortexEntries[index];
    if (!entry) return;
    const rotDeg = entry.rotationDeg;
    if (
      this.draggingEtherVortexIndex === index &&
      this.etherVortexPreviewWorld
    ) {
      this.drawBigMiniRingAtPoint(this.etherVortexPreviewWorld, 1.08, '#4caf50', 3, rotDeg);
      return;
    }
    const offBoard = entry.offBoardWorld;
    if (offBoard) {
      this.drawBigMiniRingAtPoint(offBoard, 1.08, '#4caf50', 3, rotDeg);
    } else {
      this.drawBigMiniRing(entry.center, 1.08, '#4caf50', 3, rotDeg);
    }
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
    const ringSel = 1.08 * BIG_MINI_VISUAL_SCALE;
    const ringPreviewInner = 0.62 * BIG_MINI_VISUAL_SCALE;
    const badgeRadius = baseRadius * BIG_MINI_VISUAL_SCALE;
    const bigActR = baseRadius * BIG_MINI_VISUAL_SCALE * 0.22;

    // Draw each big mini
    this.bigMiniCenters.forEach((center, index) => {
      // Skip the one being dragged (we draw preview instead)
      if (this.draggingBigMiniIndex === index) return;
      if (this.isPeerDraggingEntity('big', index)) return;

      const offBoard = this.bigMiniOffBoardWorlds[index];
      const rotDegModel = this.bigMiniRotationDeg[index] ?? 0;
      const rotDegVisual = rotDegModel + this.config.oppositeSeatUnitRotationCorrectionDeg;
      const rotRadVisual = (rotDegVisual * Math.PI) / 180;

      if (offBoard) {
        this.drawBigMiniHexonAtPoint(offBoard, baseRadius, config.bigMiniFillColor, rotDegModel);
        if (this.selectedBigMiniIndex === index) {
          this.drawBigMiniRingAtPoint(offBoard, ringSel, '#4caf50', 3, rotDegModel);
        }
        this.drawHealthBadgeAt(
          offBoard,
          badgeRadius,
          this.bigMiniHealthValues[index] ?? 0,
          this.openHealthControlsBigMiniIndex === index,
          BIG_UNIT_HEALTH_UI_SCALE,
          'insideHexBigUnitBottom',
          rotRadVisual,
        );
        this.drawActivationToggle(
          bigMiniActivationToggleCenterWorld(offBoard, rotDegVisual, layout),
          bigActR,
          this.bigMiniActivated[index] !== false,
        );
        const bmMarkers = this.bigMiniEffectMarkers[index];
        if (bmMarkers && bmMarkers.length > 0) {
          this.drawEffectMarkers(offBoard, bmMarkers, badgeRadius, 'bigHexon', rotRadVisual);
        }
      } else {
        this.drawBigMiniHexon(center, baseRadius, config.bigMiniFillColor, rotDegModel);
        if (this.selectedBigMiniIndex === index) {
          this.drawBigMiniRing(center, ringSel, '#4caf50', 3, rotDegModel);
        }
        const p = layout.hexToPixel(center);
        this.drawHealthBadgeAt(
          p,
          badgeRadius,
          this.bigMiniHealthValues[index] ?? 0,
          this.openHealthControlsBigMiniIndex === index,
          BIG_UNIT_HEALTH_UI_SCALE,
          'insideHexBigUnitBottom',
          rotRadVisual,
        );
        this.drawActivationToggle(
          bigMiniActivationToggleCenterWorld(p, rotDegVisual, layout),
          bigActR,
          this.bigMiniActivated[index] !== false,
        );
        const bmMarkers = this.bigMiniEffectMarkers[index];
        if (bmMarkers && bmMarkers.length > 0) {
          this.drawEffectMarkers(p, bmMarkers, badgeRadius, 'bigHexon', rotRadVisual);
        }
      }
    });

    // Draw drag preview (ghost)
    if (this.bigMiniPreviewPosition) {
      const previewRotModel =
        this.draggingBigMiniIndex !== null
          ? (this.bigMiniRotationDeg[this.draggingBigMiniIndex] ?? 0)
          : 0;
      const previewRotVisual =
        previewRotModel + this.config.oppositeSeatUnitRotationCorrectionDeg;
      this.drawBigMiniHexonAtPoint(
        this.bigMiniPreviewPosition,
        baseRadius,
        config.bigMiniPreviewColor,
        previewRotModel,
      );
      ctx.globalAlpha = 0.6;
      this.drawBigMiniRingAtPoint(
        this.bigMiniPreviewPosition,
        ringPreviewInner,
        config.bigMiniSymbolColor,
        2,
        previewRotModel,
      );
      ctx.globalAlpha = 1.0;
      if (this.draggingBigMiniIndex !== null) {
        this.drawHealthBadgeAt(
          this.bigMiniPreviewPosition,
          badgeRadius,
          this.bigMiniHealthValues[this.draggingBigMiniIndex] ?? 0,
          this.openHealthControlsBigMiniIndex === this.draggingBigMiniIndex,
          BIG_UNIT_HEALTH_UI_SCALE,
          'insideHexBigUnitBottom',
          (previewRotVisual * Math.PI) / 180,
        );
        const dragBmMarkers = this.bigMiniEffectMarkers[this.draggingBigMiniIndex];
        if (dragBmMarkers && dragBmMarkers.length > 0) {
          this.drawEffectMarkers(
            this.bigMiniPreviewPosition,
            dragBmMarkers,
            badgeRadius,
            'bigHexon',
            (previewRotVisual * Math.PI) / 180,
          );
        }
        this.drawActivationToggle(
          bigMiniActivationToggleCenterWorld(
            this.bigMiniPreviewPosition,
            previewRotVisual,
            layout,
          ),
          bigActR,
          this.bigMiniActivated[this.draggingBigMiniIndex] !== false,
        );
      }
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'big' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.bigMiniCenters.length) continue;
      const previewRotModel = this.bigMiniRotationDeg[d.index] ?? 0;
      const previewRotVisual =
        previewRotModel + this.config.oppositeSeatUnitRotationCorrectionDeg;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      ctx.globalAlpha = 0.72;
      this.drawBigMiniHexonAtPoint(p, baseRadius, config.bigMiniPreviewColor, previewRotModel);
      ctx.globalAlpha = 0.55;
      this.drawBigMiniRingAtPoint(
        p,
        ringPreviewInner,
        rp.color,
        2.5,
        previewRotModel,
      );
      ctx.globalAlpha = 1;
      this.drawHealthBadgeAt(
        p,
        badgeRadius,
        this.bigMiniHealthValues[d.index] ?? 0,
        false,
        BIG_UNIT_HEALTH_UI_SCALE,
        'insideHexBigUnitBottom',
        (previewRotVisual * Math.PI) / 180,
      );
      const rBm = this.bigMiniEffectMarkers[d.index];
      if (rBm && rBm.length > 0) {
        this.drawEffectMarkers(
          p,
          rBm,
          badgeRadius,
          'bigHexon',
          (previewRotVisual * Math.PI) / 180,
        );
      }
      this.drawActivationToggle(
        bigMiniActivationToggleCenterWorld(p, previewRotVisual, layout),
        bigActR,
        this.bigMiniActivated[d.index] !== false,
      );
      ctx.restore();
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
    const { x: pcx, y: pcy } = this.localBoundsCenter(bounds);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const lwOuter = 2 / this.camera.zoom / BIG_MINI_VISUAL_SCALE;
    const lwSymbol = 2 / this.camera.zoom / BIG_MINI_VISUAL_SCALE;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(BIG_MINI_VISUAL_SCALE, BIG_MINI_VISUAL_SCALE);
    ctx.translate(-pcx, -pcy);
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
      const fBm = this.oppositeSeatMiniatureRadFix;
      if (fBm !== 0) ctx.rotate(fBm);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      if (fBm !== 0) ctx.rotate(-fBm);
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
    const hb = this.bigMiniHexonBoundsLocal(layout);
    const { x: hcx, y: hcy } = this.localBoundsCenter(hb);
    const lineW = width / this.camera.zoom / pathScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(pathScale, pathScale);
    ctx.translate(-hcx, -hcy);
    ctx.beginPath();
    this.addBigMiniHexonOuterPath(ctx, layout, 1);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.restore();
  }

  // ── Generic outer-path from arbitrary cell list ──

  /** 3-hex triangle cell centers in local space (relative to anchor hex). */
  private largeTriangleLocalCellCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    const offsets = [new Hex(0, 0), new Hex(1, 0), new Hex(0, 1)];
    return offsets.map((off) => {
      const p = layout.hexToPixel(off);
      return { x: p.x - o.x, y: p.y - o.y };
    });
  }

  /** 3-hexon triangle (21 cells) in local space (relative to anchor hexon center). */
  private hugeTriangleLocalCellCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    const hexonOffsets = [new Hex(0, 0), new Hex(3, -1), new Hex(1, 2)];
    const cells: Point[] = [];
    for (const hOff of hexonOffsets) {
      const hc = layout.hexToPixel(hOff);
      cells.push({ x: hc.x - o.x, y: hc.y - o.y });
      for (const d of Hex.directions) {
        const nb = hOff.add(d);
        const np = layout.hexToPixel(nb);
        cells.push({ x: np.x - o.x, y: np.y - o.y });
      }
    }
    return cells;
  }

  /**
   * Outer contour vertices for an arbitrary set of hex cell centers (local coords).
   * Generalized from bigMiniHexonOuterVerticesLocal.
   */
  private outerVerticesFromCells(cells: Point[], layout: Layout, scale: number): Point[] {
    const segKey = (p: Point, q: Point): string => {
      const k1 = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      const k2 = `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };
    const edgeCounts = new Map<string, number>();
    const edgeA = new Map<string, Point>();
    const edgeB = new Map<string, Point>();
    for (const cell of cells) {
      for (let i = 0; i < 6; i++) {
        const o1 = layout.hexCornerOffset(i);
        const o2 = layout.hexCornerOffset((i + 1) % 6);
        const a = { x: scale * (cell.x + o1.x), y: scale * (cell.y + o1.y) };
        const b = { x: scale * (cell.x + o2.x), y: scale * (cell.y + o2.y) };
        const k = segKey(a, b);
        edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
        if (!edgeA.has(k)) { edgeA.set(k, a); edgeB.set(k, b); }
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
    let cx = 0, cy = 0;
    for (const v of verts) { cx += v.x; cy += v.y; }
    cx /= verts.length; cy /= verts.length;
    verts.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    return verts;
  }

  private addOuterPathFromCells(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    cells: Point[],
    scale: number,
  ): void {
    const verts = this.outerVerticesFromCells(cells, layout, scale);
    if (verts.length < 3) return;
    this.roundHexPathLocal(ctx, verts, this.smallUnitHexCornerRadius());
  }

  private boundsFromCells(cells: Point[], layout: Layout): {
    minX: number; maxX: number; minY: number; maxY: number;
  } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
      for (let i = 0; i < 6; i++) {
        const off = layout.hexCornerOffset(i);
        const x = cell.x + off.x, y = cell.y + off.y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { minX, maxX, minY, maxY };
  }

  // ── Large miniatures (3-hex triangle) ──

  private drawLargeMiniMovement(): void {
    const { ctx, layout, config } = this;
    for (const hex of this.largeMiniRunHexes) {
      if (this.largeMiniWalkHexes.some((w) => w.key === hex.key)) continue;
      const corners = layout.hexCorners(hex);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fillStyle = config.runRangeFillColor;
      ctx.fill();
    }
    for (const hex of this.largeMiniWalkHexes) {
      const corners = layout.hexCorners(hex);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fillStyle = config.walkRangeFillColor;
      ctx.fill();
    }
  }

  private drawLargeMiniatures(): void {
    const { ctx, config, layout } = this;
    const cells = this.largeTriangleLocalCellCenters(layout);
    const bounds = this.boundsFromCells(cells, layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const badgeRadius = baseRadius * LARGE_MINI_VISUAL_SCALE;
    const largeActR =
      Math.min(layout.size.x, layout.size.y) *
      1.2 *
      LARGE_MINI_VISUAL_SCALE *
      0.22;
    const largeLocalOrigin: Point = { x: 0, y: 0 };

    this.largeMiniAnchors.forEach((anchor, index) => {
      if (this.draggingLargeMiniIndex === index) return;
      if (this.isPeerDraggingEntity('large', index)) return;
      const offBoard = this.largeMiniOffBoardWorlds[index];
      const rotDegModel = this.largeMiniRotationDeg[index] ?? 0;
      const rotRadModel = (rotDegModel * Math.PI) / 180;
      const pivot = offBoard ?? layout.hexToPixel(anchor);

      this.drawLargeMiniShapeAtPoint(
        pivot, cells, bounds, boxW, boxH, config.largeMiniFillColor, rotDegModel, this.largeMiniSpriteSrcs[index] ?? null,
        largeLocalOrigin,
      );
      if (this.selectedLargeMiniIndex === index) {
        this.drawShapeRingAtPoint(
          pivot, cells, layout, 1.08 * LARGE_MINI_VISUAL_SCALE, '#4caf50', 3, rotDegModel, largeLocalOrigin,
        );
      }
      // Large tri footprint + badge math share model rotation only (unlike small/big hexon).
      // oppositeSeatVisual on the badge would shift the disc ~one hex vs the white stroke.
      this.drawHealthBadgeAt(
        pivot, badgeRadius,
        this.largeMiniHealthValues[index] ?? 0,
        this.openHealthControlsLargeMiniIndex === index,
        LARGE_UNIT_HEALTH_UI_SCALE,
        'insideHexLargeUnit', rotRadModel,
      );
      this.drawActivationToggle(
        largeMiniActivationToggleCenterWorld(pivot, rotDegModel, layout),
        largeActR,
        this.largeMiniActivated[index] !== false,
      );
      const markers = this.largeMiniEffectMarkers[index];
      if (markers && markers.length > 0) {
        this.drawEffectMarkers(pivot, markers, badgeRadius, 'largeTri', rotRadModel);
      }
    });

    // Ghost follows cursor; snapped drop target is only in drawDragHoverHex (like big mini).
    if (this.largeMiniPreviewPosition) {
      const previewRotModel = this.draggingLargeMiniIndex !== null
        ? (this.largeMiniRotationDeg[this.draggingLargeMiniIndex] ?? 0) : 0;
      const previewRotRadModel = (previewRotModel * Math.PI) / 180;
      const p = this.largeMiniPreviewPosition;
      this.drawLargeMiniShapeAtPoint(
        p, cells, bounds, boxW, boxH,
        config.largeMiniPreviewColor, previewRotModel, null,
        largeLocalOrigin,
      );
      ctx.globalAlpha = 0.6;
      this.drawShapeRingAtPoint(
        p, cells, layout,
        0.62 * LARGE_MINI_VISUAL_SCALE, config.bigMiniSymbolColor, 2, previewRotModel, largeLocalOrigin,
      );
      ctx.globalAlpha = 1.0;
      if (this.draggingLargeMiniIndex !== null) {
        this.drawHealthBadgeAt(
          p, badgeRadius,
          this.largeMiniHealthValues[this.draggingLargeMiniIndex] ?? 0,
          this.openHealthControlsLargeMiniIndex === this.draggingLargeMiniIndex,
          LARGE_UNIT_HEALTH_UI_SCALE, 'insideHexLargeUnit', previewRotRadModel,
        );
        const dragMarkers = this.largeMiniEffectMarkers[this.draggingLargeMiniIndex];
        if (dragMarkers && dragMarkers.length > 0) {
          this.drawEffectMarkers(
            p,
            dragMarkers,
            badgeRadius,
            'largeTri',
            previewRotRadModel,
          );
        }
        this.drawActivationToggle(
          largeMiniActivationToggleCenterWorld(p, previewRotModel, layout),
          largeActR,
          this.largeMiniActivated[this.draggingLargeMiniIndex] !== false,
        );
      }
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'large' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.largeMiniAnchors.length) continue;
      const previewRotModel = this.largeMiniRotationDeg[d.index] ?? 0;
      const previewRotRadModel = (previewRotModel * Math.PI) / 180;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      ctx.globalAlpha = 0.72;
      this.drawLargeMiniShapeAtPoint(
        p, cells, bounds, boxW, boxH,
        config.largeMiniPreviewColor, previewRotModel, null,
        largeLocalOrigin,
      );
      ctx.globalAlpha = 0.5;
      this.drawShapeRingAtPoint(
        p, cells, layout,
        0.62 * LARGE_MINI_VISUAL_SCALE, rp.color, 2.2, previewRotModel, largeLocalOrigin,
      );
      ctx.globalAlpha = 1;
      this.drawHealthBadgeAt(
        p, badgeRadius,
        this.largeMiniHealthValues[d.index] ?? 0,
        false,
        LARGE_UNIT_HEALTH_UI_SCALE, 'insideHexLargeUnit', previewRotRadModel,
      );
      const rLm = this.largeMiniEffectMarkers[d.index];
      if (rLm && rLm.length > 0) {
        this.drawEffectMarkers(p, rLm, badgeRadius, 'largeTri', previewRotRadModel);
      }
      this.drawActivationToggle(
        largeMiniActivationToggleCenterWorld(p, previewRotModel, layout),
        largeActR,
        this.largeMiniActivated[d.index] !== false,
      );
      ctx.restore();
    }
  }

  private drawLargeMiniShapeAtPoint(
    point: Point,
    cells: Point[],
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    boxW: number,
    boxH: number,
    fillColor: string,
    rotationDeg: number,
    spriteSrc: string | null,
    /** Local point (anchor hex center = 0,0) that maps to `point` in world after rotate/scale. */
    localOriginInCellSpace: Point,
  ): void {
    const { ctx, config, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const lw = 2 / this.camera.zoom / LARGE_MINI_VISUAL_SCALE;
    const { x: pcx, y: pcy } = localOriginInCellSpace;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(LARGE_MINI_VISUAL_SCALE, LARGE_MINI_VISUAL_SCALE);
    ctx.translate(-pcx, -pcy);

    const sprite = this.getSpriteImage(spriteSrc);
    if (sprite && sprite.naturalWidth > 0) {
      // Stretch to footprint axis-aligned bbox (fill). Centered at anchor would miss
      // most of the triangle; use bounds.min/max in local cell space.
      ctx.save();
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.clip();
      const fL = this.oppositeSeatMiniatureRadFix;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      ctx.save();
      if (fL !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(fL);
        ctx.translate(-cx, -cy);
      }
      ctx.drawImage(sprite, bounds.minX, bounds.minY, boxW, boxH);
      ctx.restore();
      ctx.restore();
    } else {
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.beginPath();
    this.addOuterPathFromCells(ctx, layout, cells, 1);
    ctx.strokeStyle = config.unitStrokeColor;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }

  // ── Huge miniatures (3-hexon triangle) ──

  private drawHugeMiniMovement(): void {
    const { ctx, layout, config } = this;
    const walkKeys = new Set(this.hugeMiniWalkHexonCenters.map((c) => c.key));
    for (const center of this.hugeMiniRunHexonCenters) {
      if (walkKeys.has(center.key)) continue;
      const hCells = [center, ...Hex.directions.map((d) => center.add(d))];
      for (const hex of hCells) {
        const corners = layout.hexCorners(hex);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fillStyle = config.runRangeFillColor;
        ctx.fill();
      }
    }
    for (const center of this.hugeMiniWalkHexonCenters) {
      const hCells = [center, ...Hex.directions.map((d) => center.add(d))];
      for (const hex of hCells) {
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

  private drawHugeMiniatures(): void {
    const { ctx, config, layout } = this;
    const cells = this.hugeTriangleLocalCellCenters(layout);
    const bounds = this.boundsFromCells(cells, layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const badgeRadius = baseRadius * HUGE_MINI_VISUAL_SCALE;
    const hugeActR =
      Math.min(layout.size.x, layout.size.y) *
      1.58 *
      HUGE_MINI_VISUAL_SCALE *
      0.22;

    this.hugeMiniAnchors.forEach((anchor, index) => {
      if (this.draggingHugeMiniIndex === index) return;
      if (this.isPeerDraggingEntity('huge', index)) return;
      const offBoard = this.hugeMiniOffBoardWorlds[index];
      const rotDegModel = this.hugeMiniRotationDeg[index] ?? 0;
      const rotRadModel = (rotDegModel * Math.PI) / 180;
      const pivot = offBoard ?? hugeMiniDrawPivotWorld(anchor, rotDegModel, layout);

      this.drawHugeMiniShapeAtPoint(pivot, cells, bounds, boxW, boxH, config.hugeMiniFillColor, rotDegModel);
      if (this.selectedHugeMiniIndex === index) {
        this.drawShapeRingAtPoint(pivot, cells, layout, 1.08 * HUGE_MINI_VISUAL_SCALE, '#4caf50', 3, rotDegModel);
      }
      this.drawHealthBadgeAt(
        pivot, badgeRadius,
        this.hugeMiniHealthValues[index] ?? 0,
        this.openHealthControlsHugeMiniIndex === index,
        HUGE_UNIT_HEALTH_UI_SCALE,
        'insideHexHugeUnit', rotRadModel,
      );
      this.drawActivationToggle(
        hugeMiniActivationToggleCenterFromPivotWorld(pivot, rotDegModel, layout),
        hugeActR,
        this.hugeMiniActivated[index] !== false,
      );
      const markers = this.hugeMiniEffectMarkers[index];
      if (markers && markers.length > 0) {
        this.drawEffectMarkers(pivot, markers, badgeRadius, 'hugeTri', rotRadModel);
      }
    });

    if (this.hugeMiniPreviewPosition) {
      const previewRotModel = this.draggingHugeMiniIndex !== null
        ? (this.hugeMiniRotationDeg[this.draggingHugeMiniIndex] ?? 0) : 0;
      const previewRotRadModel = (previewRotModel * Math.PI) / 180;
      const p = this.hugeMiniPreviewPosition;
      this.drawHugeMiniShapeAtPoint(
        p, cells, bounds, boxW, boxH,
        config.hugeMiniPreviewColor, previewRotModel,
      );
      ctx.globalAlpha = 0.6;
      this.drawShapeRingAtPoint(
        p, cells, layout,
        0.62 * HUGE_MINI_VISUAL_SCALE, config.bigMiniSymbolColor, 2, previewRotModel,
      );
      ctx.globalAlpha = 1.0;
      if (this.draggingHugeMiniIndex !== null) {
        this.drawHealthBadgeAt(
          p, badgeRadius,
          this.hugeMiniHealthValues[this.draggingHugeMiniIndex] ?? 0,
          this.openHealthControlsHugeMiniIndex === this.draggingHugeMiniIndex,
          HUGE_UNIT_HEALTH_UI_SCALE, 'insideHexHugeUnit', previewRotRadModel,
        );
        const dragMarkers = this.hugeMiniEffectMarkers[this.draggingHugeMiniIndex];
        if (dragMarkers && dragMarkers.length > 0) {
          this.drawEffectMarkers(
            p,
            dragMarkers,
            badgeRadius,
            'hugeTri',
            previewRotRadModel,
          );
        }
        this.drawActivationToggle(
          hugeMiniActivationToggleCenterFromPivotWorld(p, previewRotModel, layout),
          hugeActR,
          this.hugeMiniActivated[this.draggingHugeMiniIndex] !== false,
        );
      }
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'huge' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.hugeMiniAnchors.length) continue;
      const previewRotModel = this.hugeMiniRotationDeg[d.index] ?? 0;
      const previewRotRadModel = (previewRotModel * Math.PI) / 180;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      ctx.globalAlpha = 0.72;
      this.drawHugeMiniShapeAtPoint(
        p, cells, bounds, boxW, boxH,
        config.hugeMiniPreviewColor, previewRotModel,
      );
      ctx.globalAlpha = 0.5;
      this.drawShapeRingAtPoint(
        p, cells, layout,
        0.62 * HUGE_MINI_VISUAL_SCALE, rp.color, 2.2, previewRotModel,
      );
      ctx.globalAlpha = 1;
      this.drawHealthBadgeAt(
        p, badgeRadius,
        this.hugeMiniHealthValues[d.index] ?? 0,
        false,
        HUGE_UNIT_HEALTH_UI_SCALE, 'insideHexHugeUnit', previewRotRadModel,
      );
      const rHm = this.hugeMiniEffectMarkers[d.index];
      if (rHm && rHm.length > 0) {
        this.drawEffectMarkers(p, rHm, badgeRadius, 'hugeTri', previewRotRadModel);
      }
      this.drawActivationToggle(
        hugeMiniActivationToggleCenterFromPivotWorld(p, previewRotModel, layout),
        hugeActR,
        this.hugeMiniActivated[d.index] !== false,
      );
      ctx.restore();
    }
  }

  private drawHugeMiniShapeAtPoint(
    point: Point,
    cells: Point[],
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    boxW: number,
    boxH: number,
    fillColor: string,
    rotationDeg: number,
  ): void {
    const { ctx, config, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const lw = 2 / this.camera.zoom / HUGE_MINI_VISUAL_SCALE;
    const { x: pcx, y: pcy } = this.localBoundsCenter(bounds);

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(HUGE_MINI_VISUAL_SCALE, HUGE_MINI_VISUAL_SCALE);
    ctx.translate(-pcx, -pcy);

    const sprite = this.getSpriteImage(this.hugeMiniSpriteSrc);
    if (sprite && sprite.naturalWidth > 0) {
      const iw = sprite.naturalWidth;
      const ih = sprite.naturalHeight;
      const cover = Math.max(boxW / iw, boxH / ih);
      const dw = iw * cover;
      const dh = ih * cover;
      ctx.save();
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.clip();
      const fH = this.oppositeSeatMiniatureRadFix;
      if (fH !== 0) ctx.rotate(fH);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      if (fH !== 0) ctx.rotate(-fH);
      ctx.restore();
    } else {
      ctx.beginPath();
      this.addOuterPathFromCells(ctx, layout, cells, 1);
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.beginPath();
    this.addOuterPathFromCells(ctx, layout, cells, 1);
    ctx.strokeStyle = config.unitStrokeColor;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }

  /** Generic ring (selection/preview) for an arbitrary cell shape. */
  private drawShapeRingAtPoint(
    point: Point,
    cells: Point[],
    layout: Layout,
    pathScale: number,
    strokeColor: string,
    width: number,
    rotationDeg: number,
    /** Large mini: `{0,0}` = rotate around anchor hex; omit = bbox center (huge / default). */
    localOriginInCellSpace?: Point,
  ): void {
    const { ctx } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const b = this.boundsFromCells(cells, layout);
    const d = localOriginInCellSpace ?? this.localBoundsCenter(b);
    const cx = d.x;
    const cy = d.y;
    const lineW = width / this.camera.zoom / pathScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(pathScale, pathScale);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    this.addOuterPathFromCells(ctx, layout, cells, 1);
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
