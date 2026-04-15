/**
 * Canvas renderer for the hex grid with hexon visualisation.
 */

import { Hex, Layout, type Point, huge2DominoHexonCentersOriented } from './hex';
import { type HexGrid } from './grid';
import {
  BIG_MINI_VISUAL_SCALE,
  BIG_UNIT_HEALTH_UI_SCALE,
  bigMiniActivationToggleCenterWorld,
  bigMiniBroomgarHungerCenterWorld,
  bigMiniHealthBadgeCenterWorld,
  LARGE_MINI_VISUAL_SCALE,
  LARGE_UNIT_HEALTH_UI_SCALE,
  largeMiniActivationToggleCenterWorld,
  largeMiniBroomgarHungerCenterWorld,
  largeMiniHealthBadgeCenterWorld,
  HUGE2_MINI_VISUAL_SCALE,
  HUGE2_UNIT_HEALTH_UI_SCALE,
  HUGE_MINI_VISUAL_SCALE,
  HUGE_UNIT_HEALTH_UI_SCALE,
  huge2MiniActivationToggleCenterFromPivotWorld,
  huge2MiniBroomgarHungerCenterFromPivotWorld,
  huge2MiniHealthBadgeCenterWorld,
  hugeMiniActivationToggleCenterFromPivotWorld,
  hugeMiniBroomgarHungerCenterFromPivotWorld,
  hugeMiniDrawPivotWorld,
  hugeMiniHealthBadgeCenterWorld,
  HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE,
  HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC,
  SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
  smallUnitActivationToggleCenterWorldRad,
  smallUnitBroomgarHungerCenterWorldRad,
  smallUnitHealthBadgeCenterWorldRad,
} from './healthUi';
import { broomgarHungerPhaseFillColor, type BroomgarHungerPhase } from './broomgarHunger';
import {
  etherVortexCrystalBadgeHalfWorld,
  getEtherVortexBlendColor,
  type EtherVortexDomainId,
} from './etherVortex';
import {
  getGodCardBackSpriteImageForCard,
  getGodCardById,
  getGodCardSpriteImage,
  godCardBackSpriteSourcePixelsForCard,
  godCardSpriteSourcePixels,
  type GodTablePiece,
} from './godCards';
import { EFFECT_MARKERS, type EffectMarkerId } from './effectMarkerMenu';
import type { TableDragKind, TableDragState } from './multiplayer/protocol.ts';
import { defaultRenderConfig, type RenderConfig } from './renderConfig';
import { deriveMiniVisualFacingDeg } from './scenarios/miniatureRotationModel.ts';
import {
  GOD_TABLE_CARD_ROT_CW_DEG,
  godTableCardContentVisualRotationDeg,
} from './scenarios/rotationModel.ts';

export type { RenderConfig };
export { defaultRenderConfig };

/** Canvas font stack for HP digits (see index.html Google Fonts link). */
const HEALTH_VALUE_FONT = '"Langar", cursive';

/** God deck / discard / loose cards — half-extents in board/world space (scale with zoom). */
export const GOD_TABLE_CARD_HW = Math.round(66 * 0.8);
export const GOD_TABLE_CARD_HH = Math.round(93 * 0.8);
/** Inventory item markers on the table — half-extents in world space (aligned with `INVENTORY_ITEM_HIT_R` in main). */
export const INVENTORY_TABLE_MARKER_HW = 48;
export const INVENTORY_TABLE_MARKER_HH = 48;
export { GOD_TABLE_CARD_ROT_CW_DEG };
/** Double-click flip duration (ms). */
export const GOD_TABLE_CARD_FLIP_MS = 400;
/** Transient ping intent arrow — full lifetime including fade-out (ms). */
export const PING_TTL_MS = 1200;
const PING_POINTER_SVG_SRC = '/pointer.svg';
/** Uniform scale at flip midpoint: first 50% of flip anim 1→this, last 50% this→1 (subtle «подлёт»). */
const GOD_TABLE_CARD_FLIP_POP_SCALE = 1.12;

function godFlipPopUniformScale(t: number): number {
  const peak = GOD_TABLE_CARD_FLIP_POP_SCALE;
  if (t <= 0.5) return 1 + (peak - 1) * (t * 2);
  return peak + (1 - peak) * ((t - 0.5) * 2);
}

/** Remote peer drag overlay (multiplayer ghost). */
export type RemotePeerTableDragPaint = {
  fromId: string;
  color: string;
  drag: TableDragState;
};

/** One transient ping marker (world/board coordinates); fades and is removed after {@link PING_TTL_MS}. */
export type TransientPingMarker = {
  boardX: number;
  boardY: number;
  color: string;
  startMs: number;
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
  /** Per big-miniature image (aligned with `bigMiniCenters` indices). */
  private bigMiniSpriteSrcs: (string | null)[] = [];
  private terrainRotationDegs: number[] = [];
  private terrainOffBoardWorlds: (Point | undefined)[] = [];
  private boardObjects: Array<{
    center: Hex;
    offBoardWorld?: Point;
    footprint: 'hex' | 'hexon';
    spriteSrc: string | null;
    backSpriteSrc: string | null;
    faceUp: boolean;
    stackCount: number;
    rotationDeg: number;
    imageRotationDeg?: number;
    keepImagePlayerFacing?: boolean;
    health?: number;
    showHealthBadge?: boolean;
    showHealthControls?: boolean;
  }> = [];
  private selectedBoardObjectIndex: number | null = null;
  private boardObjectFlipAnim: {
    index: number;
    startMs: number;
    durationMs: number;
    fromFaceUp: boolean;
  } | null = null;
  private etherVortexEntries: Array<{
    center: Hex;
    etherCrystals: number;
    domain: EtherVortexDomainId | null;
    rotationDeg: number;
    spriteSrc?: string;
    imageRotationDeg?: number;
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
  /** Per huge-miniature image (aligned with `hugeMiniAnchors` indices). */
  private hugeMiniSpriteSrcs: (string | null)[] = [];
  /** Per huge: nudge art inside clip (layout units), same frame as after bbox centering. */
  private hugeMiniSpriteOffsetsLocal: Point[] = [];
  /** Per huge: rotation of art inside clip (degrees), around bbox center after seat fix. */
  private hugeMiniSpriteRotationDegLocal: number[] = [];
  private unitActivated: boolean[] = [];
  private bigMiniActivated: boolean[] = [];
  private largeMiniActivated: boolean[] = [];
  private hugeMiniActivated: boolean[] = [];
  /** `null` = не брумгар / нет индикатора */
  private unitBroomgarHungerPhase: Array<BroomgarHungerPhase | null> = [];
  private bigMiniBroomgarHungerPhase: Array<BroomgarHungerPhase | null> = [];
  private largeMiniBroomgarHungerPhase: Array<BroomgarHungerPhase | null> = [];
  private hugeMiniBroomgarHungerPhase: Array<BroomgarHungerPhase | null> = [];
  // ── Huge2 mini (2 hexon domino) state ──
  private huge2MiniAnchors: Hex[] = [];
  private huge2MiniOffBoardWorlds: (Point | undefined)[] = [];
  private huge2MiniPreviewPosition: Point | null = null;
  private draggingHuge2MiniIndex: number | null = null;
  private huge2MiniWalkHexonCenters: Hex[] = [];
  private huge2MiniRunHexonCenters: Hex[] = [];
  private selectedHuge2MiniIndex: number | null = null;
  private huge2MiniRotationDeg: number[] = [];
  private huge2MiniHealthValues: number[] = [];
  private openHealthControlsHuge2MiniIndex: number | null = null;
  private huge2MiniEffectMarkers: EffectMarkerId[][] = [];
  private huge2MiniSpriteSrcs: (string | null)[] = [];
  private huge2MiniSpriteOffsetsLocal: Point[] = [];
  private huge2MiniSpriteRotationDegLocal: number[] = [];
  private huge2MiniActivated: boolean[] = [];
  private huge2MiniBroomgarHungerPhase: Array<BroomgarHungerPhase | null> = [];

  private spriteImageCache = new Map<string, HTMLImageElement>();
  private spriteImageLoading = new Set<string>();
  private spriteImageFailed = new Set<string>();
  private backgroundImage: HTMLImageElement | null = null;
  private backgroundImageSrcLoaded: string | null = null;
  private backgroundImageSrcFailed: string | null = null;

  private cellsSvgImage: HTMLImageElement | null = null;
  private cellsSvgSrcLoaded: string | null = null;
  private cellsSvgSrcFailed: string | null = null;
  private cellsSvgLoadInFlight = false;
  private cellsSvgLayout: {
    cx: number;
    cy: number;
    w: number;
    h: number;
    rotDeg: number;
  } | null = null;
  private boardInstances: Array<{
    id: string;
    worldX: number;
    worldY: number;
    rotationDeg: number;
    scale: number;
    zIndex: number;
  }> = [];

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
  /** Active shuffle animation for one god deck piece. */
  private godDeckShuffleAnim: {
    index: number;
    startMs: number;
    durationMs: number;
  } | null = null;

  /** Inventory item tokens (sprites from catalog). */
  private inventoryMarkerPieces: Array<{ world: Point; spriteSrc: string | null }> = [];
  private inventoryLooseDraggingIndex: number | null = null;
  private inventoryLoosePreviewWorld: Point | null = null;
  private selectedInventoryTablePieceIndex: number | null = null;
  private readonly inventorySpriteImages = new Map<string, HTMLImageElement>();

  /** Other players' cursors in board/world space (same as hex layout). */
  private remoteBoardPointers: Array<{
    boardX: number;
    boardY: number;
    color: string;
    label?: string;
  }> = [];

  /** Local / transient intent pings (animated arrow); independent TTL per marker. */
  private pingMarkers: TransientPingMarker[] = [];
  private pingPointerImage: HTMLImageElement | null = null;
  private pingPointerSrcLoaded: string | null = null;
  private pingPointerSrcFailed: string | null = null;

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

  private get contentFieldRotationDeltaRad(): number {
    return (this.config.contentFieldRotationDeltaDeg * Math.PI) / 180;
  }

  /** Small mini sprite/overlays: logical facing + seat; scenario orientation does not add field tilt. */
  private smallUnitVisualRotationDeg(logicalDeg: number): number {
    return deriveMiniVisualFacingDeg({
      logicalDeg,
      seatExtraDeg: this.config.oppositeSeatUnitRotationCorrectionDeg,
      scenarioOrientation: 'horizontal',
    });
  }

  /** Small-mini content layer (art/HP/markers) keeps player-facing while field may rotate. */
  private smallUnitContentVisualRotationDeg(logicalDeg: number): number {
    return this.smallUnitVisualRotationDeg(logicalDeg) + this.config.contentFieldRotationDeltaDeg;
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
    const d = this.contentFieldRotationDeltaRad;
    const uprightRad = d - f;
    if (uprightRad === 0) {
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      return;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(uprightRad);
    ctx.translate(-cx, -cy);
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  /** Uniform scale around world pivot while dragging (visual only). */
  private withTablePieceDragLift(pivot: Point, draw: () => void): void {
    const s = this.config.tablePieceDragLiftScale;
    if (s <= 1) {
      draw();
      return;
    }
    const { ctx } = this;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.scale(s, s);
    ctx.translate(-pivot.x, -pivot.y);
    draw();
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

  setBoardObjects(
    pieces: ReadonlyArray<{
      center: Hex;
      offBoardWorld?: Point;
      footprint: 'hex' | 'hexon';
      spriteSrc: string | null;
      backSpriteSrc: string | null;
      faceUp: boolean;
      stackCount: number;
      rotationDeg?: number;
      imageRotationDeg?: number;
      keepImagePlayerFacing?: boolean;
      health?: number;
      showHealthBadge?: boolean;
      showHealthControls?: boolean;
    }>,
    selectedIndex: number | null,
  ): void {
    this.boardObjects = pieces.map((p) => ({
      center: new Hex(p.center.q, p.center.r),
      offBoardWorld: p.offBoardWorld ? { ...p.offBoardWorld } : undefined,
      footprint: p.footprint,
      spriteSrc: p.spriteSrc,
      backSpriteSrc: p.backSpriteSrc,
      faceUp: p.faceUp,
      stackCount: p.stackCount,
      rotationDeg: p.rotationDeg ?? 0,
      imageRotationDeg: p.imageRotationDeg,
      keepImagePlayerFacing: p.keepImagePlayerFacing,
      health: p.health,
      showHealthBadge: p.showHealthBadge,
      showHealthControls: p.showHealthControls,
    }));
    this.selectedBoardObjectIndex = selectedIndex;
  }

  setBoardObjectFlipAnim(
    anim: {
      index: number;
      startMs: number;
      durationMs: number;
      fromFaceUp: boolean;
    } | null,
  ): void {
    this.boardObjectFlipAnim = anim ? { ...anim } : null;
  }

  setEtherVortexes(
    entries: ReadonlyArray<{
      center: Hex;
      etherCrystals: number;
      domain: EtherVortexDomainId | null;
      rotationDeg: number;
      spriteSrc?: string;
      imageRotationDeg?: number;
      offBoardWorld?: { x: number; y: number };
    }>,
    selectedIndex: number | null = null,
  ): void {
    this.etherVortexEntries = entries.map((e) => ({
      center: new Hex(e.center.q, e.center.r),
      etherCrystals: e.etherCrystals,
      domain: e.domain,
      rotationDeg: e.rotationDeg,
      spriteSrc: e.spriteSrc,
      imageRotationDeg: e.imageRotationDeg,
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

  setGodDeckShuffleAnim(
    anim: {
      index: number;
      startMs: number;
      durationMs: number;
    } | null,
  ): void {
    this.godDeckShuffleAnim = anim ? { ...anim } : null;
  }

  setInventoryTablePieces(
    pieces: ReadonlyArray<{ world: Point; spriteSrc: string | null }>,
    draggingIndex: number | null,
    previewWorld: Point | null,
    selectedPieceIndex: number | null = null,
  ): void {
    this.inventoryMarkerPieces = pieces.map((p) => ({
      world: { ...p.world },
      spriteSrc: p.spriteSrc,
    }));
    this.inventoryLooseDraggingIndex = draggingIndex;
    this.inventoryLoosePreviewWorld = previewWorld ? { ...previewWorld } : null;
    this.selectedInventoryTablePieceIndex = selectedPieceIndex;
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

  setUnitBroomgarHungerPhase(phases: Array<BroomgarHungerPhase | null>): void {
    this.unitBroomgarHungerPhase = [...phases];
  }

  setBigMiniBroomgarHungerPhase(phases: Array<BroomgarHungerPhase | null>): void {
    this.bigMiniBroomgarHungerPhase = [...phases];
  }

  setLargeMiniBroomgarHungerPhase(phases: Array<BroomgarHungerPhase | null>): void {
    this.largeMiniBroomgarHungerPhase = [...phases];
  }

  setHugeMiniBroomgarHungerPhase(phases: Array<BroomgarHungerPhase | null>): void {
    this.hugeMiniBroomgarHungerPhase = [...phases];
  }

  setBigMiniHealth(values: number[], openControlsBigMiniIndex: number | null): void {
    this.bigMiniHealthValues = [...values];
    this.openHealthControlsBigMiniIndex = openControlsBigMiniIndex;
  }

  setUnitSpriteSources(srcs: (string | null)[]): void {
    this.unitSpriteSrcs = [...srcs];
  }

  setBigMiniSpriteSources(srcs: (string | null)[]): void {
    this.bigMiniSpriteSrcs = [...srcs];
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

  setHugeMiniSpriteSources(srcs: (string | null)[]): void {
    this.hugeMiniSpriteSrcs = [...srcs];
  }

  setHugeMiniSpriteOffsets(offsets: Point[]): void {
    this.hugeMiniSpriteOffsetsLocal = [...offsets];
  }

  setHugeMiniSpriteLocalRotations(degrees: number[]): void {
    this.hugeMiniSpriteRotationDegLocal = [...degrees];
  }

  setHuge2Miniatures(
    anchors: Hex[],
    previewPosition: Point | null,
    draggingIndex: number | null,
    _dragOverAnchor: Hex | null,
    offBoardWorlds?: (Point | undefined)[],
  ): void {
    this.huge2MiniAnchors = [...anchors];
    this.huge2MiniPreviewPosition = previewPosition;
    this.draggingHuge2MiniIndex = draggingIndex;
    this.huge2MiniOffBoardWorlds = offBoardWorlds ? [...offBoardWorlds] : [];
  }

  setHuge2MiniMovement(
    selectedIndex: number | null,
    walkHexonCenters: Hex[],
    runHexonCenters: Hex[],
  ): void {
    this.selectedHuge2MiniIndex = selectedIndex;
    this.huge2MiniWalkHexonCenters = [...walkHexonCenters];
    this.huge2MiniRunHexonCenters = [...runHexonCenters];
  }

  setHuge2MiniRotations(degrees: number[]): void {
    this.huge2MiniRotationDeg = [...degrees];
  }

  setHuge2MiniHealth(values: number[], openControlsIndex: number | null): void {
    this.huge2MiniHealthValues = [...values];
    this.openHealthControlsHuge2MiniIndex = openControlsIndex;
  }

  setHuge2MiniEffectMarkers(markers: EffectMarkerId[][]): void {
    this.huge2MiniEffectMarkers = markers;
  }

  setHuge2MiniSpriteSources(srcs: (string | null)[]): void {
    this.huge2MiniSpriteSrcs = [...srcs];
  }

  setHuge2MiniSpriteOffsets(offsets: Point[]): void {
    this.huge2MiniSpriteOffsetsLocal = [...offsets];
  }

  setHuge2MiniSpriteLocalRotations(degrees: number[]): void {
    this.huge2MiniSpriteRotationDegLocal = [...degrees];
  }

  setHuge2MiniActivated(values: boolean[]): void {
    this.huge2MiniActivated = [...values];
  }

  setHuge2MiniBroomgarHungerPhase(phases: Array<BroomgarHungerPhase | null>): void {
    this.huge2MiniBroomgarHungerPhase = [...phases];
  }

  updateConfig(patch: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /** Screen-space layout for `cells.svg` (CSS px); drawn after hex fills, under terrain/units. */
  setCellsSvgOverlayLayout(
    layout: {
      cx: number;
      cy: number;
      w: number;
      h: number;
      rotDeg: number;
    } | null,
  ): void {
    this.cellsSvgLayout = layout;
  }

  setBoardInstances(
    instances: ReadonlyArray<{
      id: string;
      worldX: number;
      worldY: number;
      rotationDeg: number;
      scale: number;
      zIndex: number;
    }>,
  ): void {
    this.boardInstances = instances.map((x) => ({ ...x }));
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

  /** Spawn a transient upward ping arrow at board/world coordinates; coexists with other markers. */
  spawnPingMarker(boardX: number, boardY: number, color: string): void {
    this.pingMarkers.push({
      boardX,
      boardY,
      color,
      startMs: performance.now(),
    });
  }

  /** True while at least one ping marker is still within {@link PING_TTL_MS} (for main-loop integration). */
  hasTransientPingMarkers(): boolean {
    const now = performance.now();
    return this.pingMarkers.some((m) => now - m.startMs < PING_TTL_MS);
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

    const gridBounds = this.getGridWorldBounds();
    const applyBoardRotation = (): void => {
      if (config.boardRotationDeg !== 0) {
        const centerX = (gridBounds.minX + gridBounds.maxX) / 2;
        const centerY = (gridBounds.minY + gridBounds.maxY) / 2;
        const angleRad = (config.boardRotationDeg * Math.PI) / 180;
        ctx.translate(centerX, centerY);
        ctx.rotate(angleRad);
        ctx.translate(-centerX, -centerY);
      }
    };

    const boardInstances =
      this.boardInstances.length > 0
        ? [...this.boardInstances].sort((a, b) => a.zIndex - b.zIndex)
        : [{ id: 'legacy', worldX: 0, worldY: 0, rotationDeg: 0, scale: 1, zIndex: 0 }];

    ctx.save();
    this.camera.apply(ctx);
    applyBoardRotation();
    for (const b of boardInstances) {
      ctx.save();
      ctx.translate(b.worldX, b.worldY);
      if (b.scale !== 1) {
        const s = Math.max(0.0001, b.scale);
        ctx.scale(s, s);
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
      ctx.restore();
    }

    ctx.restore();
    // `cells.svg` sits above field/hex underlay, below terrain and all miniatures/UI in world space.
    this.drawCellsSvgOverlay();

    ctx.save();
    this.camera.apply(ctx);
    applyBoardRotation();

    // Pass 3: terrain feature (one big hexon)
    this.drawTerrain();

    // Pass 3a: hexon-footprint custom board objects (terrain-style big hexons)
    //          drawn BEFORE ether vortex so the vortex always overlays terrain on the same hexon
    this.drawBoardObjects('hexon');

    // Pass 4: ether vortexes (silhouette + tint + crystal chip in world space)
    this.drawEtherVortexes();

    // Pass 4a: hex-footprint custom board objects (small tokens: smoke, prisoners) — on top of the vortex
    this.drawBoardObjects('hex');

    // Pass 5: optional thick border for a highlighted hexon
    if (config.hexonBorderWidth > 0) {
      this.drawHexonBorders();
    }

    // Pass 6b: small-unit walk/run + attack preview (same stacking as big/huge movement — over terrain & ether vortex)
    this.drawMovementHighlights();
    this.drawAttackRangeSmallHighlights();

    // Pass 7: big mini movement range (hexon-level)
    this.drawBigMiniMovement();

    // Pass 7a: huge mini movement range (hexon-level, 3-hexon triangles)
    this.drawHugeMiniMovement();
    this.drawHuge2MiniMovement();

    // Pass 7b: attack range for big miniatures (on top of walk/run rings)
    this.drawAttackRangeBigHighlights();

    // Pass 8: huge miniatures (3-hexon triangle) — lowest miniature layer
    this.drawHugeMiniatures();

    // Pass 8a0: huge2 domino miniatures (two hexons)
    this.drawHuge2Miniatures();

    // Pass 8a: big miniatures (hexon-sized)
    this.drawBigMiniatures();

    // Pass 8c: large mini movement range (hex-level, 3-hex triangles)
    this.drawLargeMiniMovement();

    // Pass 8d: large miniatures (3-hex triangle)
    this.drawLargeMiniatures();

    // Pass 9: unit miniature (small) — top miniature layer
    this.drawUnits();

    // Pass 9a: drag target highlight (over miniatures)
    this.drawDragHoverHex();

    // Pass 9b: свободные карты богов
    this.drawGodLooseCards();

    // Pass 9c: inventory item markers
    this.drawInventoryTablePieces();

    // Selected miniature / terrain / vortex / god piece — поверх всех слоёв (понятное выделение)
    this.drawSelectedLiftPass();

    // Pass 10: coordinate labels
    if (config.showCoordinates) {
      for (const hex of this.grid.allHexes()) {
        this.drawCoordinates(hex);
      }
    }

    this.drawRemoteBoardPointers();
    this.drawPingMarkers();

    ctx.restore();
  }

  private ensureCellsSvgOverlayLoaded(): void {
    const src = this.config.cellsSvgOverlaySrc;
    if (!src) return;
    if (this.cellsSvgSrcLoaded === src || this.cellsSvgSrcFailed === src) return;
    if (this.cellsSvgLoadInFlight) return;
    this.cellsSvgLoadInFlight = true;
    void fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`cells.svg ${r.status}`);
        return r.text();
      })
      .then((raw) => {
        this.cellsSvgLoadInFlight = false;
        // Как у .board-grid-overlay-wrap { color: #e5e5e5 } для встроенного SVG; в <img> currentColor → чёрный.
        const tinted = raw.replace(/currentColor/g, '#e5e5e5');
        const blob = new Blob([tinted], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          this.cellsSvgImage = image;
          this.cellsSvgSrcLoaded = src;
          this.cellsSvgSrcFailed = null;
          this.canvas.dispatchEvent(new CustomEvent('hex-cells-svg-ready', { bubbles: false }));
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          this.cellsSvgImage = null;
          this.cellsSvgSrcLoaded = null;
          this.cellsSvgSrcFailed = src;
        };
        image.src = url;
      })
      .catch((err) => {
        this.cellsSvgLoadInFlight = false;
        this.cellsSvgSrcFailed = src;
        console.error('[cells.svg] overlay load failed', err);
      });
  }

  /** Full-board `cells.svg` in screen space, between hex underlay and terrain/units. */
  private drawCellsSvgOverlay(): void {
    const src = this.config.cellsSvgOverlaySrc;
    if (!src) return;
    this.ensureCellsSvgOverlayLoaded();
    const img = this.cellsSvgImage;
    const layout = this.cellsSvgLayout;
    if (!img || !layout || !img.complete || img.naturalWidth === 0) return;
    const { ctx } = this;
    const { cx, cy, w, h, rotDeg } = layout;
    if (w < 1 || h < 1) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    // Как у встроенного SVG в DOM: preserveAspectRatio по умолчанию = xMidYMid meet (без растягивания по осям).
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(cx, cy);
    ctx.rotate((rotDeg * Math.PI) / 180);
    // Лёгкая тень под линиями сетки (экранные px, как и layout).
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0.8;
    ctx.shadowOffsetY = 1.2;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
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

  private ensurePingPointerLoaded(): void {
    const src = PING_POINTER_SVG_SRC;
    if (this.pingPointerSrcLoaded === src || this.pingPointerSrcFailed === src) return;
    const image = new Image();
    image.onload = () => {
      this.pingPointerImage = image;
      this.pingPointerSrcLoaded = src;
      this.pingPointerSrcFailed = null;
    };
    image.onerror = () => {
      this.pingPointerImage = null;
      this.pingPointerSrcLoaded = null;
      this.pingPointerSrcFailed = src;
    };
    image.src = src;
  }

  /** Intent ping arrows — fixed screen-sized stroke/fill via `1/camera.zoom` like remote pointers. */
  private drawPingMarkers(): void {
    const now = performance.now();
    this.pingMarkers = this.pingMarkers.filter((m) => now - m.startMs < PING_TTL_MS);
    if (this.pingMarkers.length === 0) return;
    this.ensurePingPointerLoaded();

    const { ctx } = this;
    const z = this.camera.zoom;
    const base = 78 / z;
    const lw = 2.25 / z;
    const pointerImg = this.pingPointerImage;

    for (const m of this.pingMarkers) {
      const elapsed = now - m.startMs;
      let scale: number;
      let alpha: number;
      let jumpOffsetY = 0;
      if (elapsed < 150) {
        const u = elapsed / 150;
        scale = 0.85 + u * 0.15;
        alpha = u;
      } else if (elapsed < 900) {
        scale = 1;
        alpha = 1;
      } else {
        scale = 1;
        const fadeSpanMs = Math.max(1, PING_TTL_MS - 900);
        alpha = 1 - (elapsed - 900) / fadeSpanMs;
      }

      // Short spring-like settle: arrow pops in above and "lands" on the ping point.
      if (elapsed < 260) {
        const t = elapsed / 260;
        const damp = Math.exp(-5 * t);
        const spring = Math.cos(10 * t);
        jumpOffsetY = (-base * 0.55) * damp * spring;
      }

      ctx.save();
      ctx.translate(m.boardX, m.boardY + jumpOffsetY);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      if (pointerImg && pointerImg.complete && pointerImg.naturalWidth > 0) {
        const aspect = pointerImg.naturalHeight / pointerImg.naturalWidth;
        const drawW = base;
        const drawH = drawW * aspect;
        // Anchor SVG tip at ping point (tip is near y≈6 of 166 in the asset).
        const tipRatioY = 6 / 166;
        const drawX = -drawW * 0.5;
        const drawY = -drawH * tipRatioY;
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(pointerImg, drawX, drawY, drawW, drawH);
        ctx.imageSmoothingEnabled = prevSmooth;
      } else {
        // Fallback while SVG is loading/failed.
        const tipY = -base * 0.48;
        const headW = base * 0.42;
        const neckY = base * 0.02;
        const tailW = base * 0.16;
        const tailY = base * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, tipY);
        ctx.lineTo(headW, neckY);
        ctx.lineTo(tailW, neckY);
        ctx.lineTo(tailW, tailY);
        ctx.lineTo(-tailW, tailY);
        ctx.lineTo(-tailW, neckY);
        ctx.lineTo(-headW, neckY);
        ctx.closePath();
        ctx.fillStyle = m.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.restore();
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
    /* Совпадает с getBoardDecorOverlayLayoutPx в main (HEX_SIZE * 3 к охвату поля). */
    const width = Math.max(1, maxX - minX + this.layout.size.x * 3);
    const height = Math.max(1, maxY - minY + this.layout.size.y * 3);
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
    const targetX = bounds.minX - this.layout.size.x * 1.5;
    const targetY = bounds.minY - this.layout.size.y * 1.5;
    const targetW = bounds.width;
    const targetH = bounds.height;

    const iw = image.width;
    const ih = image.height;
    /** Всегда равномерный масштаб (пропорции PNG/SVG не ломаем). `stretch` больше не растягивает по осям. */
    const fit = config.backgroundImageFit;
    const baseScale =
      fit === 'cover'
        ? Math.max(targetW / iw, targetH / ih)
        : Math.min(targetW / iw, targetH / ih);
    let drawW = iw * baseScale;
    let drawH = ih * baseScale;
    let drawX = targetX + (targetW - drawW) / 2;
    let drawY = targetY + (targetH - drawH) / 2;

    const userScale = Math.max(0.05, config.backgroundImageScale);
    drawW *= userScale;
    drawH *= userScale;
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
      this.draggingHuge2MiniIndex === null &&
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

  private godTableCardContentVisualRotationRad(): number {
    return (
      (godTableCardContentVisualRotationDeg({
        oppositeSeatUnitRotationCorrectionDeg: this.config.oppositeSeatUnitRotationCorrectionDeg,
        contentFieldRotationDeltaDeg: this.config.contentFieldRotationDeltaDeg,
      }) *
        Math.PI) /
      180
    );
  }

  private applyGodTableCardVisualRotation(ctx: CanvasRenderingContext2D): void {
    ctx.rotate(this.godTableCardContentVisualRotationRad());
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

  private drawGodCardBackWorld(world: Point, stackCount: number, topCardId?: string | null): void {
    const { ctx } = this;
    const z = this.camera.zoom;
    const lw = 2 / z;
    const hw = GOD_TABLE_CARD_HW;
    const hh = GOD_TABLE_CARD_HH;
    const topDef = topCardId ? getGodCardById(topCardId) : undefined;
    ctx.save();
    ctx.translate(world.x, world.y);
    this.applyGodTableCardVisualRotation(ctx);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 4 / z);
    ctx.save();
    ctx.clip();
    const sheet = getGodCardBackSpriteImageForCard(topDef);
    if (sheet && sheet.complete && sheet.naturalWidth > 0) {
      const { sx, sy, sw, sh } = godCardBackSpriteSourcePixelsForCard(
        topDef,
        sheet.naturalWidth,
        sheet.naturalHeight,
      );
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, sx, sy, sw, sh, -hw, -hh, hw * 2, hh * 2);
      ctx.imageSmoothingEnabled = prevSmooth;
    } else {
      const g = ctx.createLinearGradient(-hw, -hh, hw, hh);
      g.addColorStop(0, '#5e35b1');
      g.addColorStop(0.5, '#1a237e');
      g.addColorStop(1, '#4527a0');
      ctx.fillStyle = g;
      ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${24 / z}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', 0, 0);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = lw;
    ctx.stroke();
    if (stackCount > 1) {
      const badgePad = 5 / z;
      const badgeH = 17 / z;
      const text = String(stackCount);
      ctx.font = `bold ${12 / z}px system-ui,sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(text).width;
      const badgeW = Math.max(16 / z, textW + badgePad * 2);
      const bx = hw - badgeW - 4 / z;
      const by = -hh + 4 / z;
      ctx.fillStyle = 'rgba(12, 12, 18, 0.82)';
      ctx.beginPath();
      ctx.roundRect(bx, by, badgeW, badgeH, 4 / z);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1 / z;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fillText(text, bx + badgePad, by + badgeH * 0.53);
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
      else this.drawGodCardBackWorld(world, 1, p.id);
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
      this.drawGodCardBackWorld(world, n, topId);
    }
  }

  private drawGodTablePiece(p: GodTablePiece, world: Point, pieceIndex: number): void {
    const anim = this.godPieceFlipAnim;
    if (anim && anim.index === pieceIndex) {
      const elapsed = performance.now() - anim.startMs;
      if (elapsed < anim.durationMs) {
        const t = Math.min(1, elapsed / anim.durationMs);
        const scaleX = Math.max(0.06, Math.abs(Math.cos(Math.PI * t)));
        const pop = godFlipPopUniformScale(t);
        const showFaceUp = t < 0.5 ? anim.fromFaceUp : p.faceUp;
        const { ctx } = this;
        const flipRad = this.godTableCardContentVisualRotationRad();
        ctx.save();
        ctx.translate(world.x, world.y);
        ctx.scale(pop, pop);
        ctx.rotate(flipRad);
        ctx.scale(scaleX, 1);
        ctx.rotate(-flipRad);
        ctx.translate(-world.x, -world.y);
        this.drawGodTablePieceWithFace(p, world, showFaceUp);
        ctx.restore();
        return;
      }
    }
    const shuffle = this.godDeckShuffleAnim;
    if (p.kind === 'deck' && shuffle && shuffle.index === pieceIndex) {
      const elapsed = performance.now() - shuffle.startMs;
      if (elapsed < shuffle.durationMs) {
        const t = Math.min(1, elapsed / shuffle.durationMs);
        const envelope = Math.sin(Math.PI * t);
        const shakeX = Math.sin(t * Math.PI * 10) * 5 * envelope;
        const shakeY = Math.cos(t * Math.PI * 12) * 1.75 * envelope;
        const rot = Math.sin(t * Math.PI * 14) * 0.1 * envelope;
        const { ctx } = this;
        ctx.save();
        ctx.translate(world.x + shakeX, world.y + shakeY);
        ctx.rotate(rot);
        ctx.translate(-world.x, -world.y);
        this.drawGodTablePieceWithFace(p, world, p.faceUp);
        ctx.restore();
        return;
      }
    }
    this.drawGodTablePieceWithFace(p, world, p.faceUp);
  }

  private drawGodLooseCards(): void {
    for (let i = 0; i < this.godTablePieces.length; i++) {
      if (i === this.selectedGodTablePieceIndex) continue;
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

  private getInventorySpriteImage(url: string): HTMLImageElement | null {
    let img = this.inventorySpriteImages.get(url);
    if (img && img.complete && img.naturalWidth > 0) return img;
    if (!this.inventorySpriteImages.has(url)) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        this.canvas.dispatchEvent(new CustomEvent('inventory-sprite-ready', { bubbles: false }));
      };
      im.onerror = () => {
        this.canvas.dispatchEvent(new CustomEvent('inventory-sprite-ready', { bubbles: false }));
      };
      im.src = url;
      this.inventorySpriteImages.set(url, im);
      return null;
    }
    img = this.inventorySpriteImages.get(url);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  private drawOneInventoryMarkerPiece(index: number, useLift: boolean): void {
    const entry = this.inventoryMarkerPieces[index];
    if (!entry) return;
    const { spriteSrc } = entry;
    let world = entry.world;
    if (this.inventoryLooseDraggingIndex === index && this.inventoryLoosePreviewWorld) {
      world = this.inventoryLoosePreviewWorld;
    }
    const hw = INVENTORY_TABLE_MARKER_HW;
    const hh = INVENTORY_TABLE_MARKER_HH;
    const maxW = hw * 2;
    const maxH = hh * 2;
    const { ctx } = this;
    const z = this.camera.zoom;
    const drawInner = (): void => {
      ctx.save();
      ctx.translate(world.x, world.y);
      this.applyGodTableCardVisualRotation(ctx);
      if (spriteSrc) {
        const sheet = this.getInventorySpriteImage(spriteSrc);
        if (sheet && sheet.complete && sheet.naturalWidth > 0) {
          const iw = sheet.naturalWidth;
          const ih = sheet.naturalHeight;
          const scale = Math.min(maxW / iw, maxH / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          const left = -dw / 2;
          const top = -dh / 2;
          const cornerR = Math.min(8 / z, 0.08 * Math.min(dw, dh));
          ctx.beginPath();
          ctx.roundRect(left, top, dw, dh, cornerR);
          ctx.fillStyle = 'rgba(14, 16, 22, 0.96)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 2 / z;
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(left, top, dw, dh, cornerR);
          ctx.clip();
          const prevSmooth = ctx.imageSmoothingEnabled;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(sheet, left, top, dw, dh);
          ctx.imageSmoothingEnabled = prevSmooth;
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.roundRect(-hw, -hh, maxW, maxH, 6 / z);
          ctx.fillStyle = 'rgba(22, 26, 32, 0.92)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 2 / z;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.font = `${12 / z}px system-ui,sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('…', 0, 0);
        }
      } else {
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, maxW, maxH, 6 / z);
        ctx.fillStyle = 'rgba(22, 26, 32, 0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2 / z;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `${12 / z}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
      }
      ctx.restore();
    };
    if (useLift) {
      this.withTablePieceDragLift(world, drawInner);
    } else {
      drawInner();
    }
  }

  private drawInventoryTablePieces(): void {
    for (let i = 0; i < this.inventoryMarkerPieces.length; i++) {
      if (i === this.inventoryLooseDraggingIndex && this.inventoryLoosePreviewWorld) continue;
      if (i === this.selectedInventoryTablePieceIndex) continue;
      this.drawOneInventoryMarkerPiece(i, false);
    }
    if (this.inventoryLooseDraggingIndex !== null && this.inventoryLoosePreviewWorld) {
      this.drawOneInventoryMarkerPiece(this.inventoryLooseDraggingIndex, true);
    }
  }

  /** One small unit at `index` (optionally with selection stroke — `drawSelectedLiftPass`). */
  private drawUnitPlacedAtIndex(index: number, drawSelectionRing: boolean): void {
    const { ctx, layout, config } = this;
    const { halfH } = this.hexHalfExtentFromLayout();
    const unitHex = this.unitHexes[index];
    if (!unitHex) return;
    const offBoard = this.unitOffBoardWorlds[index];
    const center = offBoard ?? layout.hexToPixel(unitHex);
    const rotDegModel = this.unitRotationDeg[index] ?? 0;
    const rotRadPhysical = (this.smallUnitVisualRotationDeg(rotDegModel) * Math.PI) / 180;
    const rotRadContent = (this.smallUnitContentVisualRotationDeg(rotDegModel) * Math.PI) / 180;
    const sprite = this.getSpriteImage(this.unitSpriteSrcs[index] ?? null);

    this.drawSmallUnitInHex(center, rotRadPhysical, rotRadContent, sprite, () => {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(rotRadPhysical);
      const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
      ctx.beginPath();
      this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
      ctx.fillStyle = config.unitFillColor;
      ctx.fill();
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(halfH * 0.95, 0);
      ctx.strokeStyle = config.unitStrokeColor;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      ctx.restore();
    });

    if (drawSelectionRing) {
      this.strokeSmallUnitHexAtCenterRotated(center, rotDegModel, '#4caf50', 2.5);
    }

    this.drawHealthBadgeAt(
      center,
      halfH,
      this.unitHealthValues[index] ?? 0,
      this.openHealthControlsUnitIndex === index,
      SMALL_UNIT_HEALTH_BADGE_SCALE,
      'insideHexSmallUnit',
      rotRadPhysical,
    );
    {
      const tr = halfH * 0.2175;
      const tc = smallUnitActivationToggleCenterWorldRad(center, rotRadPhysical, layout);
      this.drawActivationToggle(tc, tr, this.unitActivated[index] !== false);
    }
    this.drawSmallBroomgarHungerIfAny(center, halfH, rotRadPhysical, index);

    const markers = this.unitEffectMarkers[index];
    if (markers && markers.length > 0) {
      this.drawEffectMarkers(center, markers, halfH, 'small', rotRadPhysical);
    }
  }

  private drawUnits(): void {
    const { ctx, layout, config } = this;
    const { halfH } = this.hexHalfExtentFromLayout();

    this.unitHexes.forEach((_unitHex, index) => {
      if (this.draggingUnitIndex === index && this.dragPreviewPosition) {
        return;
      }
      if (index === this.selectedUnitIndex) return;
      if (this.isPeerDraggingEntity('unit', index)) {
        return;
      }
      this.drawUnitPlacedAtIndex(index, false);
    });

    if (
      this.draggingUnitIndex !== null &&
      this.dragPreviewPosition &&
      !(
        this.draggingUnitIndex === this.selectedUnitIndex
      )
    ) {
      const uIdx = this.draggingUnitIndex;
      const pv = this.dragPreviewPosition;
      const rotDegModel = this.unitRotationDeg[uIdx] ?? 0;
      const rotRadPhysical = (this.smallUnitVisualRotationDeg(rotDegModel) * Math.PI) / 180;
      const rotRadContent = (this.smallUnitContentVisualRotationDeg(rotDegModel) * Math.PI) / 180;
      const sprite = this.getSpriteImage(
        this.unitSpriteSrcs[uIdx] ?? null,
      );
      this.withTablePieceDragLift(pv, () => {
        this.drawSmallUnitInHex(pv, rotRadPhysical, rotRadContent, sprite, () => {
          ctx.save();
          ctx.translate(pv.x, pv.y);
          ctx.rotate(rotRadPhysical);
          const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
          ctx.beginPath();
          this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
          ctx.fillStyle = config.unitFillColor;
          ctx.fill();
          ctx.strokeStyle = config.unitStrokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        });
        this.drawHealthBadgeAt(
          pv,
          halfH,
          this.unitHealthValues[uIdx] ?? 0,
          this.openHealthControlsUnitIndex === uIdx,
          SMALL_UNIT_HEALTH_BADGE_SCALE,
          'insideHexSmallUnit',
          rotRadPhysical,
        );
        {
          const tr = halfH * 0.2175;
          const tc = smallUnitActivationToggleCenterWorldRad(pv, rotRadPhysical, layout);
          this.drawActivationToggle(
            tc,
            tr,
            this.unitActivated[uIdx] !== false,
          );
        }
        this.drawSmallBroomgarHungerIfAny(pv, halfH, rotRadPhysical, uIdx);
        const dragMarkers = this.unitEffectMarkers[uIdx];
        if (dragMarkers && dragMarkers.length > 0) {
          this.drawEffectMarkers(pv, dragMarkers, halfH, 'small', rotRadPhysical);
        }
      });
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'unit' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.unitHexes.length) continue;
      const idx = d.index;
      const pos = { x: d.worldX, y: d.worldY };
      const rotDegModel = this.unitRotationDeg[idx] ?? 0;
      const rotRadPhysical = (this.smallUnitVisualRotationDeg(rotDegModel) * Math.PI) / 180;
      const rotRadContent = (this.smallUnitContentVisualRotationDeg(rotDegModel) * Math.PI) / 180;
      const sprite = this.getSpriteImage(this.unitSpriteSrcs[idx] ?? null);
      this.withTablePieceDragLift(pos, () => {
        ctx.save();
        ctx.globalAlpha = 0.72;
        this.drawSmallUnitInHex(pos, rotRadPhysical, rotRadContent, sprite, () => {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(rotRadPhysical);
          const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
          ctx.beginPath();
          this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
          ctx.fillStyle = config.unitFillColor;
          ctx.fill();
          ctx.strokeStyle = config.unitStrokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        });
        this.drawHealthBadgeAt(
          pos,
          halfH,
          this.unitHealthValues[idx] ?? 0,
          false,
          SMALL_UNIT_HEALTH_BADGE_SCALE,
          'insideHexSmallUnit',
          rotRadPhysical,
        );
        {
          const tr = halfH * 0.2175;
          const tc = smallUnitActivationToggleCenterWorldRad(pos, rotRadPhysical, layout);
          this.drawActivationToggle(tc, tr, this.unitActivated[idx] !== false);
        }
        this.drawSmallBroomgarHungerIfAny(pos, halfH, rotRadPhysical, idx);
        const rMarkers = this.unitEffectMarkers[idx];
        if (rMarkers && rMarkers.length > 0) {
          this.drawEffectMarkers(pos, rMarkers, halfH, 'small', rotRadPhysical);
        }
        ctx.restore();
        this.strokeSmallUnitHexAtCenterRotated(pos, rotDegModel, rp.color, 2.4);
      });
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

  /**
   * Selection ring path scale: same silhouette as the clipped sprite (`visualScale`), expanded
   * slightly so the stroke sits outside the art (Figma-style outside border) instead of a 1.08 gap.
   * `strokeWidthWorld` matches the `width` argument passed to drawBigMiniRing / drawShapeRingAtPoint.
   */
  private miniatureSelectionRingPathScale(
    visualScale: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    strokeWidthWorld: number,
  ): number {
    const c = this.localBoundsCenter(bounds);
    const rLocal = Math.max(
      bounds.maxX - c.x,
      c.x - bounds.minX,
      bounds.maxY - c.y,
      c.y - bounds.minY,
    );
    const halfStrokeWorld = strokeWidthWorld * 0.5;
    const rShapeWorld = visualScale * rLocal;
    const delta = rShapeWorld > 1e-9 ? halfStrokeWorld / rShapeWorld : 0;
    return visualScale * (1 + delta);
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
    rotRadPhysical: number,
    rotRadContent: number,
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
    const visualRad = rotRadContent;
    const physicalRad = rotRadPhysical;
    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(physicalRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, cornerR);
    ctx.clip();
    if (visualRad !== physicalRad) {
      ctx.rotate(visualRad - physicalRad);
    }
    ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(physicalRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, cornerR);
    ctx.strokeStyle = config.unitStrokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** Selection ring for small units: matches {@link smallUnitVisualRotationDeg} (no scenario field tilt). */
  private strokeSmallUnitHexAtCenterRotated(
    centerWorld: Point,
    logicalDeg: number,
    color: string,
    width: number,
  ): void {
    const { ctx, layout } = this;
    const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
    const visualRad = (this.smallUnitVisualRotationDeg(logicalDeg) * Math.PI) / 180;
    ctx.save();
    ctx.translate(centerWorld.x, centerWorld.y);
    ctx.rotate(visualRad);
    ctx.beginPath();
    this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
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
      | 'insideHexHugeUnit'
      | 'insideHexHuge2Unit' = 'above',
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
    } else if (verticalPlacement === 'insideHexHuge2Unit') {
      badgeCenter = huge2MiniHealthBadgeCenterWorld(
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
    const tiltDeg = this.config.contentFieldRotationDeltaDeg - fixDeg;
    if (tiltDeg !== 0) {
      ctx.save();
      ctx.translate(badgeCenter.x, badgeCenter.y);
      ctx.rotate((tiltDeg * Math.PI) / 180);
      ctx.translate(-badgeCenter.x, -badgeCenter.y);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, effectiveRadius * 0.72)}px ${HEALTH_VALUE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(health), badgeCenter.x, badgeCenter.y);

    if (!showPlusMinus) {
      if (tiltDeg !== 0) ctx.restore();
      return;
    }

    const buttonRadius =
      badgeRadius * HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE;
    const buttonOffsetX =
      badgeRadius * HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC;
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
    if (tiltDeg !== 0) ctx.restore();
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

  private drawBroomgarHungerDisc(
    centerWorld: Point,
    radiusWorld: number,
    phase: BroomgarHungerPhase,
  ): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(centerWorld.x, centerWorld.y, radiusWorld, 0, Math.PI * 2);
    ctx.fillStyle = broomgarHungerPhaseFillColor(phase);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(1, 1.1 / this.camera.zoom);
    ctx.stroke();
  }

  private drawSmallBroomgarHungerIfAny(
    center: Point,
    halfH: number,
    rotRadVisual: number,
    index: number,
  ): void {
    const ph = this.unitBroomgarHungerPhase[index];
    if (ph === null || ph === undefined) return;
    const tr = halfH * 0.2175;
    const tc = smallUnitBroomgarHungerCenterWorldRad(center, rotRadVisual, this.layout);
    this.drawBroomgarHungerDisc(tc, tr, ph);
  }

  private drawBigBroomgarHungerIfAny(
    pivotWorld: Point,
    rotDegVisual: number,
    index: number,
    actRadiusWorld: number,
  ): void {
    const ph = this.bigMiniBroomgarHungerPhase[index];
    if (ph === null || ph === undefined) return;
    const tc = bigMiniBroomgarHungerCenterWorld(pivotWorld, rotDegVisual, this.layout);
    this.drawBroomgarHungerDisc(tc, actRadiusWorld, ph);
  }

  private drawLargeBroomgarHungerIfAny(
    pivotWorld: Point,
    rotDegModel: number,
    index: number,
    actRadiusWorld: number,
  ): void {
    const ph = this.largeMiniBroomgarHungerPhase[index];
    if (ph === null || ph === undefined) return;
    const tc = largeMiniBroomgarHungerCenterWorld(pivotWorld, rotDegModel, this.layout);
    this.drawBroomgarHungerDisc(tc, actRadiusWorld, ph);
  }

  private drawHugeBroomgarHungerIfAny(
    pivotWorld: Point,
    rotDegModel: number,
    index: number,
    actRadiusWorld: number,
  ): void {
    const ph = this.hugeMiniBroomgarHungerPhase[index];
    if (ph === null || ph === undefined) return;
    const tc = hugeMiniBroomgarHungerCenterFromPivotWorld(pivotWorld, rotDegModel, this.layout);
    this.drawBroomgarHungerDisc(tc, actRadiusWorld, ph);
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
    footprint: 'bigHexon' | 'largeTri' | 'hugeTri' | 'huge2Dom',
  ): { b: { minX: number; maxX: number; minY: number; maxY: number }; vis: number } {
    if (footprint === 'bigHexon') {
      return { b: this.bigMiniHexonBoundsLocal(layout), vis: BIG_MINI_VISUAL_SCALE };
    }
    if (footprint === 'largeTri') {
      const cells = this.largeTriangleLocalCellCenters(layout);
      return { b: this.boundsFromCells(cells, layout), vis: LARGE_MINI_VISUAL_SCALE };
    }
    if (footprint === 'huge2Dom') {
      const cells = this.huge2DominoLocalCellCenters(layout);
      return { b: this.boundsFromCells(cells, layout), vis: HUGE2_MINI_VISUAL_SCALE };
    }
    return {
      b: this.hugeMiniFootprintBoundsLocal(layout),
      vis: HUGE_MINI_VISUAL_SCALE,
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
   * Huge (3 hexons): pick one hexon not covered by HP / activation badges, then place each
   * marker in the center of its own small hex within that hexon. Fill order: the six outer
   * hexes first (same order as `Hex.directions`), then the center hex; repeat for 8+ markers.
   * Slight pull toward the hexon middle keeps large icons inside the cell.
   */
  private hugeTriEffectMarkerLocalScaledPositions(
    layout: Layout,
    count: number,
    rotationDeg: number,
    pivotWorld: Point,
    inwardBase: number,
  ): Point[] | null {
    if (count <= 0) return [];
    const S = HUGE_MINI_VISUAL_SCALE;
    const b = this.hugeMiniFootprintBoundsLocal(layout);
    const cx0 = (b.minX + b.maxX) / 2;
    const cy0 = (b.minY + b.maxY) / 2;

    const hpW = hugeMiniHealthBadgeCenterWorld(pivotWorld, rotationDeg, layout);
    const actW = hugeMiniActivationToggleCenterFromPivotWorld(
      pivotWorld,
      rotationDeg,
      layout,
    );
    const rotRad = (rotationDeg * Math.PI) / 180;
    const c = Math.cos(rotRad);
    const s = Math.sin(rotRad);
    const toWorld = (lx: number, ly: number): Point => ({
      x: pivotWorld.x + c * lx - s * ly,
      y: pivotWorld.y + s * lx + c * ly,
    });
    const blockR =
      Math.min(layout.size.x, layout.size.y) * HUGE_MINI_VISUAL_SCALE * 0.52;

    const hexonCenters = this.hugeTriangleLocalHexonCenters(layout);
    const hexonBlocked = (H: Point): boolean => {
      const lx = (H.x - cx0) * S;
      const ly = (H.y - cy0) * S;
      const w = toWorld(lx, ly);
      return (
        Math.hypot(w.x - hpW.x, w.y - hpW.y) < blockR ||
        Math.hypot(w.x - actW.x, w.y - actW.y) < blockR
      );
    };

    let bestH: Point | null = null;
    let bestScore = -Infinity;
    for (const H of hexonCenters) {
      const lx = (H.x - cx0) * S;
      const ly = (H.y - cy0) * S;
      const w = toWorld(lx, ly);
      const dHp = Math.hypot(w.x - hpW.x, w.y - hpW.y);
      const dAct = Math.hypot(w.x - actW.x, w.y - actW.y);
      const score = Math.min(dHp, dAct);
      if (!hexonBlocked(H) && score > bestScore) {
        bestScore = score;
        bestH = H;
      }
    }
    if (bestH === null) {
      for (const H of hexonCenters) {
        const lx = (H.x - cx0) * S;
        const ly = (H.y - cy0) * S;
        const w = toWorld(lx, ly);
        const dHp = Math.hypot(w.x - hpW.x, w.y - hpW.y);
        const dAct = Math.hypot(w.x - actW.x, w.y - actW.y);
        const score = Math.min(dHp, dAct);
        if (score > bestScore) {
          bestScore = score;
          bestH = H;
        }
      }
    }
    if (bestH === null) return null;

    const zero = new Hex(0, 0);
    const origin = layout.hexToPixel(zero);
    /** Peripheral hexes first (outer ring), center hex last — same geometry as `hexonLocalCellCenters`. */
    const cells: Point[] = [
      ...Hex.directions.map((d) => {
        const p = layout.hexToPixel(zero.add(d));
        return { x: p.x - origin.x, y: p.y - origin.y };
      }),
      { x: 0, y: 0 },
    ];

    const out: Point[] = [];
    for (let i = 0; i < count; i++) {
      const cell = cells[i % 7]!;
      const lap = Math.floor(i / 7);

      let ax = bestH.x + cell.x;
      let ay = bestH.y + cell.y;

      const tox = bestH.x - ax;
      const toy = bestH.y - ay;
      const distHex = Math.hypot(tox, toy);
      if (distHex > 1e-9) {
        const pull = Math.min(inwardBase * 0.48, distHex * 0.36);
        ax += (tox / distHex) * pull;
        ay += (toy / distHex) * pull;
      }

      if (lap > 0) {
        if (distHex > 1e-9) {
          const extra = Math.min(lap * inwardBase * 0.2, distHex * 0.28);
          ax += (tox / distHex) * extra;
          ay += (toy / distHex) * extra;
        } else {
          const dir = Hex.directions[(lap - 1) % 6]!;
          const tp = layout.hexToPixel(zero.add(dir));
          const dx = tp.x - origin.x;
          const dy = tp.y - origin.y;
          const dl = Math.hypot(dx, dy);
          if (dl > 1e-9) {
            const off = lap * inwardBase * 0.26;
            ax += (dx / dl) * off;
            ay += (dy / dl) * off;
          }
        }
      }

      out.push({ x: (ax - cx0) * S, y: (ay - cy0) * S });
    }
    return out.length === count ? out : null;
  }

  /**
   * Huge2 (2 hexons): same placement strategy as {@link hugeTriEffectMarkerLocalScaledPositions},
   * choosing the better of two hexon lobes by distance to HP / activation badges.
   */
  private huge2DomEffectMarkerLocalScaledPositions(
    layout: Layout,
    count: number,
    rotationDeg: number,
    pivotWorld: Point,
    inwardBase: number,
  ): Point[] | null {
    if (count <= 0) return [];
    const S = HUGE2_MINI_VISUAL_SCALE;
    const b = this.boundsFromCells(this.huge2DominoLocalCellCenters(layout), layout);
    const cx0 = (b.minX + b.maxX) / 2;
    const cy0 = (b.minY + b.maxY) / 2;

    const hpW = huge2MiniHealthBadgeCenterWorld(pivotWorld, rotationDeg, layout);
    const actW = huge2MiniActivationToggleCenterFromPivotWorld(
      pivotWorld,
      rotationDeg,
      layout,
    );
    const rotRad = (rotationDeg * Math.PI) / 180;
    const c = Math.cos(rotRad);
    const s = Math.sin(rotRad);
    const toWorld = (lx: number, ly: number): Point => ({
      x: pivotWorld.x + c * lx - s * ly,
      y: pivotWorld.y + s * lx + c * ly,
    });
    const blockR =
      Math.min(layout.size.x, layout.size.y) * HUGE2_MINI_VISUAL_SCALE * 0.52;

    const hexonCenters = this.huge2DominoLocalHexonCenters(layout);
    const hexonBlocked = (H: Point): boolean => {
      const lx = (H.x - cx0) * S;
      const ly = (H.y - cy0) * S;
      const w = toWorld(lx, ly);
      return (
        Math.hypot(w.x - hpW.x, w.y - hpW.y) < blockR ||
        Math.hypot(w.x - actW.x, w.y - actW.y) < blockR
      );
    };

    let bestH: Point | null = null;
    let bestScore = -Infinity;
    for (const H of hexonCenters) {
      const lx = (H.x - cx0) * S;
      const ly = (H.y - cy0) * S;
      const w = toWorld(lx, ly);
      const dHp = Math.hypot(w.x - hpW.x, w.y - hpW.y);
      const dAct = Math.hypot(w.x - actW.x, w.y - actW.y);
      const score = Math.min(dHp, dAct);
      if (!hexonBlocked(H) && score > bestScore) {
        bestScore = score;
        bestH = H;
      }
    }
    if (bestH === null) {
      for (const H of hexonCenters) {
        const lx = (H.x - cx0) * S;
        const ly = (H.y - cy0) * S;
        const w = toWorld(lx, ly);
        const dHp = Math.hypot(w.x - hpW.x, w.y - hpW.y);
        const dAct = Math.hypot(w.x - actW.x, w.y - actW.y);
        const score = Math.min(dHp, dAct);
        if (score > bestScore) {
          bestScore = score;
          bestH = H;
        }
      }
    }
    if (bestH === null) return null;

    const zero = new Hex(0, 0);
    const origin = layout.hexToPixel(zero);
    const cells: Point[] = [
      ...Hex.directions.map((d) => {
        const p = layout.hexToPixel(zero.add(d));
        return { x: p.x - origin.x, y: p.y - origin.y };
      }),
      { x: 0, y: 0 },
    ];

    const out: Point[] = [];
    for (let i = 0; i < count; i++) {
      const cell = cells[i % 7]!;
      const lap = Math.floor(i / 7);

      let ax = bestH.x + cell.x;
      let ay = bestH.y + cell.y;

      const tox = bestH.x - ax;
      const toy = bestH.y - ay;
      const distHex = Math.hypot(tox, toy);
      if (distHex > 1e-9) {
        const pull = Math.min(inwardBase * 0.48, distHex * 0.36);
        ax += (tox / distHex) * pull;
        ay += (toy / distHex) * pull;
      }

      if (lap > 0) {
        if (distHex > 1e-9) {
          const extra = Math.min(lap * inwardBase * 0.2, distHex * 0.28);
          ax += (tox / distHex) * extra;
          ay += (toy / distHex) * extra;
        } else {
          const dir = Hex.directions[(lap - 1) % 6]!;
          const tp = layout.hexToPixel(zero.add(dir));
          const dx = tp.x - origin.x;
          const dy = tp.y - origin.y;
          const dl = Math.hypot(dx, dy);
          if (dl > 1e-9) {
            const off = lap * inwardBase * 0.26;
            ax += (dx / dl) * off;
            ay += (dy / dl) * off;
          }
        }
      }

      out.push({ x: (ax - cx0) * S, y: (ay - cy0) * S });
    }
    return out.length === count ? out : null;
  }

  /**
   * Effect markers: small units on single-hex perimeter (bottom-left, CCW);
   * big / large fallback: column on the left silhouette edge (pivot = bbox center);
   * huge: one hexon’s seven small hex cells when `hugeTriEffectMarkerLocalScaledPositions` succeeds.
   */
  private drawEffectMarkers(
    center: Point,
    markers: EffectMarkerId[],
    miniatureRadius: number,
    footprint: 'small' | 'bigHexon' | 'largeTri' | 'hugeTri' | 'huge2Dom',
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
      footprint === 'largeTri' || footprint === 'hugeTri' || footprint === 'huge2Dom'
        ? iconSizeBase * 0.8
        : iconSizeBase;
    const drawIconSize =
      footprint === 'hugeTri' || footprint === 'huge2Dom' ? iconSize * 2 : iconSize;

    if (footprint !== 'small') {
      if (footprint === 'huge2Dom') {
        const rotDeg = (rotationRad * 180) / Math.PI;
        const drawable = markers.filter((id) =>
          EFFECT_MARKERS.some((m) => m.id === id),
        );
        const inwardHalf =
          drawIconSize * 0.5 + 2.5 / this.camera.zoom;
        const locals = this.huge2DomEffectMarkerLocalScaledPositions(
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
            const half = drawIconSize / 2;

            ctx.beginPath();
            ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.35 / this.camera.zoom;
            ctx.stroke();

            if (img) {
              this.drawImageUprightForOppositeSeat(
                ctx,
                img,
                cx,
                cy,
                drawIconSize,
                drawIconSize,
              );
            }
          }
          return;
        }
      }

      if (footprint === 'hugeTri') {
        const rotDeg = (rotationRad * 180) / Math.PI;
        const drawable = markers.filter((id) =>
          EFFECT_MARKERS.some((m) => m.id === id),
        );
        const inwardHalf =
          drawIconSize * 0.5 + 2.5 / this.camera.zoom;
        const locals = this.hugeTriEffectMarkerLocalScaledPositions(
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
            const half = drawIconSize / 2;

            ctx.beginPath();
            ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.35 / this.camera.zoom;
            ctx.stroke();

            if (img) {
              this.drawImageUprightForOppositeSeat(
                ctx,
                img,
                cx,
                cy,
                drawIconSize,
                drawIconSize,
              );
            }
          }
          return;
        }
      }

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
        const half = drawIconSize / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, half + 1 / this.camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.35 / this.camera.zoom;
        ctx.stroke();

        if (img) {
          this.drawImageUprightForOppositeSeat(
            ctx,
            img,
            cx,
            cy,
            drawIconSize,
            drawIconSize,
          );
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
      const rotDeg =
        this.draggingHugeMiniIndex !== null
          ? (this.hugeMiniRotationDeg[this.draggingHugeMiniIndex] ?? 0)
          : 0;
      const pivotP = hugeMiniDrawPivotWorld(this.hugeMiniDragOverAnchor, rotDeg, layout);
      const rotRad = (rotDeg * Math.PI) / 180;
      const ub = this.hugeMiniFootprintBoundsLocal(layout);
      const { x: ucx, y: ucy } = this.localBoundsCenter(ub);
      ctx.save();
      ctx.translate(pivotP.x, pivotP.y);
      ctx.rotate(rotRad);
      ctx.scale(HUGE_MINI_VISUAL_SCALE, HUGE_MINI_VISUAL_SCALE);
      ctx.translate(-ucx, -ucy);
      ctx.beginPath();
      this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = config.dragHoverFillColor;
      ctx.fill();
      ctx.beginPath();
      this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
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
      if (index === this.selectedTerrainIndex) return;
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
      const dIdx = this.draggingTerrainIndex;
      if (dIdx !== this.selectedTerrainIndex) {
        const previewRotDeg = this.terrainRotationDegs[dIdx] ?? 0;
        const rotRad = (previewRotDeg * Math.PI) / 180;
        this.drawTerrainStyleHexonAtWorldPivot(this.terrainPreviewWorld, rotRad, {
          domainBlendColor: null,
        });
      }
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
    const fallbackEtherImgSrc = this.config.etherVortexImageSrc ?? this.config.terrainImageSrc;
    this.etherVortexEntries.forEach((v, index) => {
      if (drag && this.draggingEtherVortexIndex === index) return;
      if (index === this.selectedEtherVortexIndex) return;
      if (this.isPeerDraggingEntity('ether', index)) return;
      const blend = getEtherVortexBlendColor(v.domain);
      const pivot = v.offBoardWorld ?? layout.hexToPixel(v.center);
      const rotRad = (v.rotationDeg * Math.PI) / 180;
      this.drawTerrainStyleHexonAtWorldPivot(pivot, rotRad, {
        domainBlendColor: blend,
        imageSrc: v.spriteSrc ?? fallbackEtherImgSrc,
        imageRotationDeg: v.imageRotationDeg,
      });
    });
    if (drag && this.etherVortexPreviewWorld) {
      const dIdx = this.draggingEtherVortexIndex;
      if (dIdx !== this.selectedEtherVortexIndex) {
        const draggedEntry = this.etherVortexEntries[dIdx!];
        const blend = draggedEntry ? getEtherVortexBlendColor(draggedEntry.domain) : null;
        const previewRotDeg = draggedEntry?.rotationDeg ?? 0;
        const rotRad = (previewRotDeg * Math.PI) / 180;
        const previewSprite = draggedEntry?.spriteSrc ?? fallbackEtherImgSrc;
        const pv = this.etherVortexPreviewWorld;
        this.withTablePieceDragLift(pv, () => {
          this.drawTerrainStyleHexonAtWorldPivot(pv, rotRad, {
            domainBlendColor: blend,
            imageSrc: previewSprite,
            imageRotationDeg: draggedEntry?.imageRotationDeg,
          });
        });
      }
    }
    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'ether' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.etherVortexEntries.length) continue;
      const entry = this.etherVortexEntries[d.index];
      if (!entry) continue;
      const rotRad = (entry.rotationDeg * Math.PI) / 180;
      const { ctx } = this;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      ctx.globalAlpha = 0.72;
      const blend = getEtherVortexBlendColor(entry.domain);
      this.withTablePieceDragLift(p, () => {
        this.drawTerrainStyleHexonAtWorldPivot(p, rotRad, {
          domainBlendColor: blend,
          imageSrc: entry.spriteSrc ?? fallbackEtherImgSrc,
          imageRotationDeg: entry.imageRotationDeg,
        });
      });
      ctx.restore();
    }
    this.drawEtherVortexCrystalBadgesWorld();
  }

  private drawBoardObjects(filterFootprint?: 'hex' | 'hexon'): void {
    const { ctx, layout, config } = this;
    const selStrokeW = 3;
    const hexonSelRingScale = this.miniatureSelectionRingPathScale(
      1,
      this.bigMiniHexonBoundsLocal(layout),
      selStrokeW,
    );
    for (let i = 0; i < this.boardObjects.length; i++) {
      const p = this.boardObjects[i]!;
      if (filterFootprint && p.footprint !== filterFootprint) continue;
      const pivot = p.offBoardWorld ?? layout.hexToPixel(p.center);
      const drawPiece = (faceUp: boolean): boolean => {
        const spriteSrc = faceUp ? p.spriteSrc : (p.backSpriteSrc ?? p.spriteSrc);
        const sprite = this.getSpriteImage(spriteSrc);
        if (!sprite) return false;
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        if (p.rotationDeg) {
          ctx.rotate((p.rotationDeg * Math.PI) / 180);
        }
        if (p.stackCount > 1) {
          const layers = Math.min(3, p.stackCount - 1);
          const step = 2.2 / this.camera.zoom;
          for (let layer = layers; layer >= 1; layer--) {
            const o = layer * step;
            ctx.save();
            ctx.translate(-o, -o);
            ctx.fillStyle = 'rgba(12, 12, 18, 0.45)';
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1 / this.camera.zoom;
            if (p.footprint === 'hexon') {
              ctx.beginPath();
              this.addBigMiniHexonOuterPath(ctx, layout, 1);
              ctx.fill();
              ctx.stroke();
            } else {
              const corners = layout.hexCorners(new Hex(0, 0));
              ctx.beginPath();
              this.roundHexPathLocal(ctx, corners, this.smallUnitHexCornerRadius());
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        if (p.footprint === 'hexon') {
          const bounds = this.bigMiniHexonBoundsLocal(layout);
          const w = bounds.maxX - bounds.minX;
          const h = bounds.maxY - bounds.minY;
          ctx.beginPath();
          this.addBigMiniHexonOuterPath(ctx, layout, 1);
          ctx.clip();
          ctx.save();
          const playerFacingRad = p.keepImagePlayerFacing
            ? this.contentFieldRotationDeltaRad - this.oppositeSeatMiniatureRadFix
            : 0;
          const imageRotRad = ((p.imageRotationDeg ?? 0) * Math.PI) / 180 + playerFacingRad;
          if (imageRotRad !== 0) ctx.rotate(imageRotRad);
          ctx.drawImage(sprite, bounds.minX, bounds.minY, w, h);
          ctx.restore();
          ctx.beginPath();
          this.addBigMiniHexonOuterPath(ctx, layout, 1);
          ctx.lineWidth = 2;
          ctx.strokeStyle = config.unitStrokeColor;
          ctx.stroke();
        } else {
          const corners = layout.hexCorners(new Hex(0, 0));
          ctx.beginPath();
          this.roundHexPathLocal(ctx, corners, this.smallUnitHexCornerRadius());
          ctx.clip();
          const size = Math.max(layout.size.x, layout.size.y) * 2;
          ctx.save();
          const playerFacingRad = p.keepImagePlayerFacing
            ? this.contentFieldRotationDeltaRad - this.oppositeSeatMiniatureRadFix
            : 0;
          const imageRotRad = ((p.imageRotationDeg ?? 0) * Math.PI) / 180 + playerFacingRad;
          if (imageRotRad !== 0) ctx.rotate(imageRotRad);
          ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
          ctx.restore();
          ctx.beginPath();
          this.roundHexPathLocal(ctx, corners, this.smallUnitHexCornerRadius());
          ctx.lineWidth = 2;
          ctx.strokeStyle = config.unitStrokeColor;
          ctx.stroke();
        }
        if (p.stackCount > 1) {
          const text = String(p.stackCount);
          const pad = 4;
          const h = 14;
          ctx.font = 'bold 10px system-ui,sans-serif';
          const tw = ctx.measureText(text).width;
          const w = Math.max(14, tw + pad * 2);
          const size = Math.max(layout.size.x, layout.size.y) * 2;
          // Hex corners are clipped; keep the badge deeper inside top-right area.
          const bx = size * 0.5 - w - 10;
          const by = -size * 0.5 + 10;
          ctx.fillStyle = 'rgba(12, 12, 18, 0.82)';
          ctx.beginPath();
          ctx.roundRect(bx, by, w, h, 3);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.96)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, bx + pad, by + h * 0.52);
        }
        if (i === this.selectedBoardObjectIndex) {
          if (p.footprint === 'hexon') {
            if (p.offBoardWorld) {
              this.drawBigMiniRingAtPoint(p.offBoardWorld, hexonSelRingScale, '#4caf50', selStrokeW, p.rotationDeg);
            } else {
              this.drawBigMiniRing(p.center, hexonSelRingScale, '#4caf50', selStrokeW, p.rotationDeg);
            }
          } else {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#4caf50';
            ctx.beginPath();
            const corners = layout.hexCorners(new Hex(0, 0));
            this.roundHexPathLocal(ctx, corners, this.smallUnitHexCornerRadius());
            ctx.stroke();
          }
        }
        ctx.restore();
        if (p.showHealthBadge && typeof p.health === 'number') {
          if (p.footprint === 'hex') {
            const { halfH } = this.hexHalfExtentFromLayout();
            this.drawHealthBadgeAt(
              pivot,
              halfH,
              p.health,
              p.showHealthControls === true,
              SMALL_UNIT_HEALTH_BADGE_SCALE,
              'insideHexSmallUnit',
              (p.rotationDeg * Math.PI) / 180,
            );
          } else {
            const baseR = Math.min(layout.size.x, layout.size.y) * 1.58;
            this.drawHealthBadgeAt(
              pivot,
              baseR,
              p.health,
              p.showHealthControls === true,
              BIG_UNIT_HEALTH_UI_SCALE,
              'insideHexBigUnitBottom',
              (p.rotationDeg * Math.PI) / 180,
            );
          }
        }
        return true;
      };
      const anim = this.boardObjectFlipAnim;
      if (anim && anim.index === i) {
        const elapsed = performance.now() - anim.startMs;
        if (elapsed < anim.durationMs) {
          const t = Math.min(1, elapsed / anim.durationMs);
          const scaleX = Math.max(0.06, Math.abs(Math.cos(Math.PI * t)));
          const pop = godFlipPopUniformScale(t);
          const faceUp = t < 0.5 ? anim.fromFaceUp : p.faceUp;
          ctx.save();
          ctx.translate(pivot.x, pivot.y);
          ctx.scale(pop, pop);
          ctx.scale(scaleX, 1);
          ctx.translate(-pivot.x, -pivot.y);
          const drawn = drawPiece(faceUp);
          ctx.restore();
          if (drawn) continue;
        }
      }
      drawPiece(p.faceUp);
    }
  }

  /** Crystal count rhombus in board space (scales with zoom like the vortex hexon). */
  private drawEtherVortexCrystalBadgesWorld(): void {
    const { ctx, layout } = this;
    const half = etherVortexCrystalBadgeHalfWorld(layout);
    for (let vi = 0; vi < this.etherVortexEntries.length; vi++) {
      if (vi === this.selectedEtherVortexIndex) continue;
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
      const liftEtherBadge =
        (this.draggingEtherVortexIndex === vi && this.etherVortexPreviewWorld) ||
        remoteEther;
      const drawCrystalBadge = (): void => {
        ctx.save();
        ctx.translate(world.x, world.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#1e88e5';
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(-half, -half, half * 2, half * 2);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#ffffff';
        const fontPx = Math.max(15, Math.min(20, half * 1.02));
        ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fixDeg = this.config.oppositeSeatUnitRotationCorrectionDeg;
        const tiltDeg = this.config.contentFieldRotationDeltaDeg - fixDeg;
        if (tiltDeg !== 0) {
          ctx.rotate((tiltDeg * Math.PI) / 180);
        }
        ctx.fillText(String(v.etherCrystals), 0, 0);
        ctx.restore();
      };
      if (liftEtherBadge) {
        this.withTablePieceDragLift(pivot, drawCrystalBadge);
      } else {
        drawCrystalBadge();
      }
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
    opts: { domainBlendColor: string | null; imageSrc?: string | null; imageRotationDeg?: number },
  ): void {
    const { ctx, layout, config } = this;
    const p = worldPivot;
    const bounds = this.bigMiniHexonBoundsLocal(layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const lwOuter = 2;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rotRad);

    const imageSrc = 'imageSrc' in opts ? opts.imageSrc : config.terrainImageSrc;
    const sprite = this.getSpriteImage(imageSrc ?? null);
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      const iw = sprite.naturalWidth;
      const ih = sprite.naturalHeight;
      const cover = Math.max(boxW / iw, boxH / ih);
      const dw = iw * cover;
      const dh = ih * cover;
      const texRotRad = (config.terrainTextureRotationDeg * Math.PI) / 180;
      const imageRotRad = ((opts.imageRotationDeg ?? 0) * Math.PI) / 180;
      ctx.save();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      // Sprite rotation is isolated so the blend-fill below draws in the same
      // unrotated coord system as the clip path (prevents tint misalignment
      // when imageRotationDeg ≠ 0, e.g. rotated ether-vortex art).
      ctx.save();
      ctx.rotate(texRotRad);
      if (imageRotRad !== 0) ctx.rotate(imageRotRad);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      if (opts.domainBlendColor) {
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

  /**
   * Выбранная миниатюра / ландшафт / вихрь / карта бога — рисуется поверх всех фиксированных слоёв,
   * чтобы перекрытие всегда отражало текущий выбор.
   */
  private drawSelectedLiftPass(): void {
    const { ctx, layout, config } = this;
    const fallbackEtherImgSrc = config.etherVortexImageSrc ?? config.terrainImageSrc;
    /** Same silhouette as `drawTerrainStyleHexonAtWorldPivot` (scale 1); ring hugs art like big-minis, not fixed 1.08 gap. */
    const terrainVortexSelStrokeW = 3;
    const terrainVortexRingScale = this.miniatureSelectionRingPathScale(
      1,
      this.bigMiniHexonBoundsLocal(layout),
      terrainVortexSelStrokeW,
    );

    if (this.selectedTerrainIndex !== null) {
      const index = this.selectedTerrainIndex;
      const drag = this.terrainDragging;
      if (drag && this.draggingTerrainIndex === index && this.terrainPreviewWorld) {
        const previewRotDeg = this.terrainRotationDegs[index] ?? 0;
        const rotRad = (previewRotDeg * Math.PI) / 180;
        this.drawTerrainStyleHexonAtWorldPivot(this.terrainPreviewWorld, rotRad, {
          domainBlendColor: null,
        });
        this.drawBigMiniRingAtPoint(
          this.terrainPreviewWorld,
          terrainVortexRingScale,
          '#4caf50',
          terrainVortexSelStrokeW,
          previewRotDeg,
        );
        return;
      }
      if (this.isPeerDraggingEntity('terrain', index)) return;
      const center = this.terrainCenterHexes[index];
      if (!center) return;
      const rotDeg = this.terrainRotationDegs[index] ?? 0;
      const rotRad = (rotDeg * Math.PI) / 180;
      const offBoard = this.terrainOffBoardWorlds[index];
      const pivot = offBoard ?? layout.hexToPixel(center);
      this.drawTerrainStyleHexonAtWorldPivot(pivot, rotRad, { domainBlendColor: null });
      if (offBoard) {
        this.drawBigMiniRingAtPoint(offBoard, terrainVortexRingScale, '#4caf50', terrainVortexSelStrokeW, rotDeg);
      } else {
        this.drawBigMiniRing(center, terrainVortexRingScale, '#4caf50', terrainVortexSelStrokeW, rotDeg);
      }
      return;
    }

    if (this.selectedEtherVortexIndex !== null) {
      const index = this.selectedEtherVortexIndex;
      const entry = this.etherVortexEntries[index];
      if (!entry) return;
      const rotDeg = entry.rotationDeg;
      const rotRad = (rotDeg * Math.PI) / 180;
      const blend = getEtherVortexBlendColor(entry.domain);
      const etherImgSrc = entry.spriteSrc ?? fallbackEtherImgSrc;
      const v = entry;
      const vi = index;
      const remoteEther = this.remotePeerTableDrags.find(
        (p) =>
          p.drag.kind === 'ether' &&
          p.drag.index === vi &&
          p.drag.worldX !== null &&
          p.drag.worldY !== null,
      );

      if (this.draggingEtherVortexIndex === index && this.etherVortexPreviewWorld) {
        const pv = this.etherVortexPreviewWorld;
        const half = etherVortexCrystalBadgeHalfWorld(layout);
        const world = this.etherVortexBadgeWorldFromPivot(pv, v.rotationDeg);
        this.withTablePieceDragLift(pv, () => {
          this.drawTerrainStyleHexonAtWorldPivot(pv, rotRad, {
            domainBlendColor: blend,
            imageSrc: etherImgSrc,
            imageRotationDeg: entry.imageRotationDeg,
          });
          ctx.save();
          ctx.translate(world.x, world.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#1e88e5';
          ctx.strokeStyle = '#1565c0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(-half, -half, half * 2, half * 2);
          ctx.fill();
          ctx.stroke();
          ctx.rotate(-Math.PI / 4);
          ctx.fillStyle = '#ffffff';
          const fontPx = Math.max(15, Math.min(20, half * 1.02));
          ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const fixDeg = this.config.oppositeSeatUnitRotationCorrectionDeg;
          const tiltDeg = this.config.contentFieldRotationDeltaDeg - fixDeg;
          if (tiltDeg !== 0) {
            ctx.rotate((tiltDeg * Math.PI) / 180);
          }
          ctx.fillText(String(v.etherCrystals), 0, 0);
          ctx.restore();
          this.drawBigMiniRingAtPoint(
            pv,
            terrainVortexRingScale,
            '#4caf50',
            terrainVortexSelStrokeW,
            rotDeg,
          );
        });
        return;
      }

      const placePivot = entry.offBoardWorld ?? layout.hexToPixel(entry.center);
      this.drawTerrainStyleHexonAtWorldPivot(placePivot, rotRad, {
        domainBlendColor: blend,
        imageSrc: etherImgSrc,
        imageRotationDeg: entry.imageRotationDeg,
      });

      const badgePivot = remoteEther
        ? { x: remoteEther.drag.worldX!, y: remoteEther.drag.worldY! }
        : (v.offBoardWorld ?? layout.hexToPixel(v.center));
      const half = etherVortexCrystalBadgeHalfWorld(layout);
      const world = this.etherVortexBadgeWorldFromPivot(badgePivot, v.rotationDeg);
      const drawSelEtherCrystalBadge = (): void => {
        ctx.save();
        ctx.translate(world.x, world.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#1e88e5';
        ctx.strokeStyle = '#1565c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(-half, -half, half * 2, half * 2);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#ffffff';
        const fontPx = Math.max(15, Math.min(20, half * 1.02));
        ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fixDeg = this.config.oppositeSeatUnitRotationCorrectionDeg;
        const tiltDeg = this.config.contentFieldRotationDeltaDeg - fixDeg;
        if (tiltDeg !== 0) {
          ctx.rotate((tiltDeg * Math.PI) / 180);
        }
        ctx.fillText(String(v.etherCrystals), 0, 0);
        ctx.restore();
      };
      if (remoteEther) {
        this.withTablePieceDragLift(badgePivot, drawSelEtherCrystalBadge);
      } else {
        drawSelEtherCrystalBadge();
      }

      if (entry.offBoardWorld) {
        this.drawBigMiniRingAtPoint(
          entry.offBoardWorld,
          terrainVortexRingScale,
          '#4caf50',
          terrainVortexSelStrokeW,
          rotDeg,
        );
      } else {
        this.drawBigMiniRing(
          entry.center,
          terrainVortexRingScale,
          '#4caf50',
          terrainVortexSelStrokeW,
          rotDeg,
        );
      }
      return;
    }

    if (this.selectedBigMiniIndex !== null) {
      const i = this.selectedBigMiniIndex;
      if (this.isPeerDraggingEntity('big', i)) return;
      const { layout: lay } = this;
      const baseRadius = Math.min(lay.size.x, lay.size.y) * 1.58;
      const badgeRadius = baseRadius * BIG_MINI_VISUAL_SCALE;
      const bigActR = baseRadius * BIG_MINI_VISUAL_SCALE * 0.22;
      if (this.draggingBigMiniIndex === i && this.bigMiniPreviewPosition) {
        const p = this.bigMiniPreviewPosition;
        const previewRotModel = this.bigMiniRotationDeg[i] ?? 0;
        const previewRotVisual = previewRotModel;
        this.withTablePieceDragLift(p, () => {
          this.drawBigMiniHexonAtPoint(
            p,
            baseRadius,
            config.bigMiniPreviewColor,
            previewRotModel,
            this.bigMiniSpriteSrcs[i] ?? null,
          );
          this.drawHealthBadgeAt(
            p,
            badgeRadius,
            this.bigMiniHealthValues[i] ?? 0,
            this.openHealthControlsBigMiniIndex === i,
            BIG_UNIT_HEALTH_UI_SCALE,
            'insideHexBigUnitBottom',
            (previewRotVisual * Math.PI) / 180,
          );
          const dragBmMarkers = this.bigMiniEffectMarkers[i];
          if (dragBmMarkers && dragBmMarkers.length > 0) {
            this.drawEffectMarkers(
              p,
              dragBmMarkers,
              badgeRadius,
              'bigHexon',
              (previewRotVisual * Math.PI) / 180,
            );
          }
          this.drawActivationToggle(
            bigMiniActivationToggleCenterWorld(p, previewRotVisual, lay),
            bigActR,
            this.bigMiniActivated[i] !== false,
          );
          this.drawBigBroomgarHungerIfAny(p, previewRotVisual, i, bigActR);
        });
        return;
      }
      this.drawBigMiniPlacedAtIndex(i, true);
      return;
    }

    if (this.selectedHuge2MiniIndex !== null) {
      const i = this.selectedHuge2MiniIndex;
      if (this.isPeerDraggingEntity('huge2', i)) return;
      const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
      const badgeRadius = baseRadius * HUGE2_MINI_VISUAL_SCALE;
      const huge2ActR =
        Math.min(layout.size.x, layout.size.y) *
        1.58 *
        HUGE2_MINI_VISUAL_SCALE *
        0.22;
      if (this.draggingHuge2MiniIndex === i && this.huge2MiniPreviewPosition) {
        const previewRotModel = this.huge2MiniRotationDeg[i] ?? 0;
        const previewRotContent = previewRotModel;
        const previewRotRadModel = (previewRotContent * Math.PI) / 180;
        const p = this.huge2MiniPreviewPosition;
        this.withTablePieceDragLift(p, () => {
          this.drawHuge2MiniShapeAtPoint(
            p,
            layout,
            config.hugeMiniPreviewColor,
            previewRotModel,
            this.huge2MiniSpriteSrcs[i] ?? null,
            this.huge2MiniSpriteOffsetsLocal[i] ?? { x: 0, y: 0 },
            this.huge2MiniSpriteRotationDegLocal[i] ?? 0,
          );
          this.drawHealthBadgeAt(
            p,
            badgeRadius,
            this.huge2MiniHealthValues[i] ?? 0,
            this.openHealthControlsHuge2MiniIndex === i,
            HUGE2_UNIT_HEALTH_UI_SCALE,
            'insideHexHuge2Unit',
            previewRotRadModel,
          );
          const dragMarkers = this.huge2MiniEffectMarkers[i];
          if (dragMarkers && dragMarkers.length > 0) {
            this.drawEffectMarkers(p, dragMarkers, badgeRadius, 'huge2Dom', previewRotRadModel);
          }
          this.drawActivationToggle(
            huge2MiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
            huge2ActR,
            this.huge2MiniActivated[i] !== false,
          );
          this.drawHuge2MiniBroomgarHungerIfAny(p, previewRotContent, i, huge2ActR);
        });
        return;
      }
      this.drawHuge2MiniPlacedAtIndex(i, true);
      return;
    }

    if (this.selectedHugeMiniIndex !== null) {
      const i = this.selectedHugeMiniIndex;
      if (this.isPeerDraggingEntity('huge', i)) return;
      const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
      const badgeRadius = baseRadius * HUGE_MINI_VISUAL_SCALE;
      const hugeActR =
        Math.min(layout.size.x, layout.size.y) *
        1.58 *
        HUGE_MINI_VISUAL_SCALE *
        0.22;
      if (this.draggingHugeMiniIndex === i && this.hugeMiniPreviewPosition) {
        const previewRotModel = this.hugeMiniRotationDeg[i] ?? 0;
        const previewRotContent = previewRotModel;
        const previewRotRadModel = (previewRotContent * Math.PI) / 180;
        const p = this.hugeMiniPreviewPosition;
        this.withTablePieceDragLift(p, () => {
          this.drawHugeMiniShapeAtPoint(
            p,
            layout,
            config.hugeMiniPreviewColor,
            previewRotModel,
            this.hugeMiniSpriteSrcs[i] ?? null,
            this.hugeMiniSpriteOffsetsLocal[i] ?? { x: 0, y: 0 },
            this.hugeMiniSpriteRotationDegLocal[i] ?? 0,
          );
          this.drawHealthBadgeAt(
            p,
            badgeRadius,
            this.hugeMiniHealthValues[i] ?? 0,
            this.openHealthControlsHugeMiniIndex === i,
            HUGE_UNIT_HEALTH_UI_SCALE,
            'insideHexHugeUnit',
            previewRotRadModel,
          );
          const dragMarkers = this.hugeMiniEffectMarkers[i];
          if (dragMarkers && dragMarkers.length > 0) {
            this.drawEffectMarkers(p, dragMarkers, badgeRadius, 'hugeTri', previewRotRadModel);
          }
          this.drawActivationToggle(
            hugeMiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
            hugeActR,
            this.hugeMiniActivated[i] !== false,
          );
          this.drawHugeBroomgarHungerIfAny(p, previewRotContent, i, hugeActR);
        });
        return;
      }
      this.drawHugeMiniPlacedAtIndex(i, true);
      return;
    }

    if (this.selectedLargeMiniIndex !== null) {
      const i = this.selectedLargeMiniIndex;
      if (this.isPeerDraggingEntity('large', i)) return;
      const cells = this.largeTriangleLocalCellCenters(layout);
      const bounds = this.boundsFromCells(cells, layout);
      const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
      const badgeRadius = baseRadius * LARGE_MINI_VISUAL_SCALE;
      const largeActR =
        Math.min(layout.size.x, layout.size.y) *
        1.2 *
        LARGE_MINI_VISUAL_SCALE *
        0.22;
      const largeLocalOrigin: Point = { x: 0, y: 0 };
      if (this.draggingLargeMiniIndex === i && this.largeMiniPreviewPosition) {
        const previewRotModel = this.largeMiniRotationDeg[i] ?? 0;
        const previewRotContent = previewRotModel;
        const previewRotRadModel = (previewRotContent * Math.PI) / 180;
        const p = this.largeMiniPreviewPosition;
        const boxW = bounds.maxX - bounds.minX;
        const boxH = bounds.maxY - bounds.minY;
        this.withTablePieceDragLift(p, () => {
          this.drawLargeMiniShapeAtPoint(
            p,
            cells,
            bounds,
            boxW,
            boxH,
            config.largeMiniPreviewColor,
            previewRotModel,
            this.largeMiniSpriteSrcs[i] ?? null,
            largeLocalOrigin,
          );
          this.drawHealthBadgeAt(
            p,
            badgeRadius,
            this.largeMiniHealthValues[i] ?? 0,
            this.openHealthControlsLargeMiniIndex === i,
            LARGE_UNIT_HEALTH_UI_SCALE,
            'insideHexLargeUnit',
            previewRotRadModel,
          );
          const dragMarkers = this.largeMiniEffectMarkers[i];
          if (dragMarkers && dragMarkers.length > 0) {
            this.drawEffectMarkers(p, dragMarkers, badgeRadius, 'largeTri', previewRotRadModel);
          }
          this.drawActivationToggle(
            largeMiniActivationToggleCenterWorld(p, previewRotContent, layout),
            largeActR,
            this.largeMiniActivated[i] !== false,
          );
          this.drawLargeBroomgarHungerIfAny(p, previewRotContent, i, largeActR);
        });
        return;
      }
      this.drawLargeMiniPlacedAtIndex(i, true);
      return;
    }

    if (this.selectedUnitIndex !== null) {
      const i = this.selectedUnitIndex;
      if (this.isPeerDraggingEntity('unit', i)) return;
      const { halfH } = this.hexHalfExtentFromLayout();
      if (this.draggingUnitIndex === i && this.dragPreviewPosition) {
        const pv = this.dragPreviewPosition;
        const rotDegModel = this.unitRotationDeg[i] ?? 0;
        const rotRadPhysical = (this.smallUnitVisualRotationDeg(rotDegModel) * Math.PI) / 180;
        const rotRadContent = (this.smallUnitContentVisualRotationDeg(rotDegModel) * Math.PI) / 180;
        const sprite = this.getSpriteImage(this.unitSpriteSrcs[i] ?? null);
        this.withTablePieceDragLift(pv, () => {
          this.drawSmallUnitInHex(pv, rotRadPhysical, rotRadContent, sprite, () => {
            ctx.save();
            ctx.translate(pv.x, pv.y);
            ctx.rotate(rotRadPhysical);
            const offs = [0, 1, 2, 3, 4, 5].map((j) => layout.hexCornerOffset(j));
            ctx.beginPath();
            this.roundHexPathLocal(ctx, offs, this.smallUnitHexCornerRadius());
            ctx.fillStyle = config.unitFillColor;
            ctx.fill();
            ctx.strokeStyle = config.unitStrokeColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          });
          this.strokeSmallUnitHexAtCenterRotated(pv, rotDegModel, '#4caf50', 2.5);
          this.drawHealthBadgeAt(
            pv,
            halfH,
            this.unitHealthValues[i] ?? 0,
            this.openHealthControlsUnitIndex === i,
            SMALL_UNIT_HEALTH_BADGE_SCALE,
            'insideHexSmallUnit',
            rotRadPhysical,
          );
          {
            const tr = halfH * 0.2175;
            const tc = smallUnitActivationToggleCenterWorldRad(pv, rotRadPhysical, layout);
            this.drawActivationToggle(tc, tr, this.unitActivated[i] !== false);
          }
          this.drawSmallBroomgarHungerIfAny(pv, halfH, rotRadPhysical, i);
          const dragMarkers = this.unitEffectMarkers[i];
          if (dragMarkers && dragMarkers.length > 0) {
            this.drawEffectMarkers(pv, dragMarkers, halfH, 'small', rotRadPhysical);
          }
        });
        return;
      }
      this.drawUnitPlacedAtIndex(i, true);
      return;
    }

    if (this.selectedGodTablePieceIndex !== null) {
      const i = this.selectedGodTablePieceIndex;
      const p = this.godTablePieces[i];
      if (!p) return;
      const world =
        this.godLooseDraggingIndex === i && this.godLoosePreviewWorld
          ? this.godLoosePreviewWorld
          : p.world;
      this.drawGodTablePiece(p, world, i);
      if (p.kind === 'deck') {
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
      return;
    }

    if (this.selectedInventoryTablePieceIndex !== null) {
      const i = this.selectedInventoryTablePieceIndex;
      if (!this.inventoryMarkerPieces[i]) return;
      const lift =
        this.inventoryLooseDraggingIndex === i && this.inventoryLoosePreviewWorld !== null;
      this.drawOneInventoryMarkerPiece(i, lift);
      const entry = this.inventoryMarkerPieces[i]!;
      let world = entry.world;
      if (this.inventoryLooseDraggingIndex === i && this.inventoryLoosePreviewWorld) {
        world = this.inventoryLoosePreviewWorld;
      }
      const z = this.camera.zoom;
      const hw = INVENTORY_TABLE_MARKER_HW * 1.08;
      const hh = INVENTORY_TABLE_MARKER_HH * 1.08;
      ctx.save();
      ctx.translate(world.x, world.y);
      this.applyGodTableCardVisualRotation(ctx);
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 6 / z);
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = 3 / z;
      ctx.stroke();
      ctx.restore();
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

  /** One placed big miniature (optionally with green selection ring — used in `drawSelectedLiftPass`). */
  private drawBigMiniPlacedAtIndex(index: number, drawSelectionRing: boolean): void {
    const { config, layout } = this;
    const center = this.bigMiniCenters[index];
    if (!center) return;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const selStrokeW = 3;
    const ringSel = this.miniatureSelectionRingPathScale(
      BIG_MINI_VISUAL_SCALE,
      this.bigMiniHexonBoundsLocal(layout),
      selStrokeW,
    );
    const badgeRadius = baseRadius * BIG_MINI_VISUAL_SCALE;
    const bigActR = baseRadius * BIG_MINI_VISUAL_SCALE * 0.22;
    const offBoard = this.bigMiniOffBoardWorlds[index];
    const rotDegModel = this.bigMiniRotationDeg[index] ?? 0;
    const rotDegVisual = rotDegModel;
    const rotRadVisual = (rotDegVisual * Math.PI) / 180;

    if (offBoard) {
      this.drawBigMiniHexonAtPoint(
        offBoard,
        baseRadius,
        config.bigMiniFillColor,
        rotDegModel,
        this.bigMiniSpriteSrcs[index] ?? null,
      );
      if (drawSelectionRing) {
        this.drawBigMiniRingAtPoint(offBoard, ringSel, '#4caf50', selStrokeW, rotDegModel);
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
      this.drawBigBroomgarHungerIfAny(offBoard, rotDegVisual, index, bigActR);
      const bmMarkers = this.bigMiniEffectMarkers[index];
      if (bmMarkers && bmMarkers.length > 0) {
        this.drawEffectMarkers(offBoard, bmMarkers, badgeRadius, 'bigHexon', rotRadVisual);
      }
    } else {
      this.drawBigMiniHexon(
        center,
        baseRadius,
        config.bigMiniFillColor,
        rotDegModel,
        this.bigMiniSpriteSrcs[index] ?? null,
      );
      if (drawSelectionRing) {
        this.drawBigMiniRing(center, ringSel, '#4caf50', selStrokeW, rotDegModel);
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
      this.drawBigBroomgarHungerIfAny(p, rotDegVisual, index, bigActR);
      const bmMarkers = this.bigMiniEffectMarkers[index];
      if (bmMarkers && bmMarkers.length > 0) {
        this.drawEffectMarkers(p, bmMarkers, badgeRadius, 'bigHexon', rotRadVisual);
      }
    }
  }

  private drawBigMiniatures(): void {
    const { ctx, config, layout } = this;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const ringPreviewInner = 0.62 * BIG_MINI_VISUAL_SCALE;
    const badgeRadius = baseRadius * BIG_MINI_VISUAL_SCALE;
    const bigActR = baseRadius * BIG_MINI_VISUAL_SCALE * 0.22;

    // Draw each big mini
    this.bigMiniCenters.forEach((_center, index) => {
      // Skip the one being dragged (we draw preview instead)
      if (this.draggingBigMiniIndex === index) return;
      if (index === this.selectedBigMiniIndex) return;
      if (this.isPeerDraggingEntity('big', index)) return;

      this.drawBigMiniPlacedAtIndex(index, false);
    });

    // Draw drag preview (ghost) — only when not selected (selected preview is drawn in drawSelectedLiftPass)
    if (
      this.bigMiniPreviewPosition &&
      !(
        this.draggingBigMiniIndex !== null &&
        this.draggingBigMiniIndex === this.selectedBigMiniIndex
      )
    ) {
      const pv = this.bigMiniPreviewPosition;
      const bmIdx = this.draggingBigMiniIndex;
      const previewRotModel =
        bmIdx !== null ? (this.bigMiniRotationDeg[bmIdx] ?? 0) : 0;
      const previewRotVisual = previewRotModel;
      this.withTablePieceDragLift(pv, () => {
        this.drawBigMiniHexonAtPoint(
          pv,
          baseRadius,
          config.bigMiniPreviewColor,
          previewRotModel,
          bmIdx !== null ? (this.bigMiniSpriteSrcs[bmIdx] ?? null) : null,
        );
        if (bmIdx !== null) {
          this.drawHealthBadgeAt(
            pv,
            badgeRadius,
            this.bigMiniHealthValues[bmIdx] ?? 0,
            this.openHealthControlsBigMiniIndex === bmIdx,
            BIG_UNIT_HEALTH_UI_SCALE,
            'insideHexBigUnitBottom',
            (previewRotVisual * Math.PI) / 180,
          );
          const dragBmMarkers = this.bigMiniEffectMarkers[bmIdx];
          if (dragBmMarkers && dragBmMarkers.length > 0) {
            this.drawEffectMarkers(
              pv,
              dragBmMarkers,
              badgeRadius,
              'bigHexon',
              (previewRotVisual * Math.PI) / 180,
            );
          }
          this.drawActivationToggle(
            bigMiniActivationToggleCenterWorld(pv, previewRotVisual, layout),
            bigActR,
            this.bigMiniActivated[bmIdx] !== false,
          );
          this.drawBigBroomgarHungerIfAny(pv, previewRotVisual, bmIdx, bigActR);
        }
      });
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'big' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.bigMiniCenters.length) continue;
      const idx = d.index;
      const previewRotModel = this.bigMiniRotationDeg[idx] ?? 0;
      const previewRotVisual = previewRotModel;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      this.withTablePieceDragLift(p, () => {
        ctx.globalAlpha = 0.72;
        this.drawBigMiniHexonAtPoint(
          p,
          baseRadius,
          config.bigMiniPreviewColor,
          previewRotModel,
          this.bigMiniSpriteSrcs[idx] ?? null,
        );
        ctx.globalAlpha = 0.55;
        this.drawBigMiniRingAtPoint(
          p,
          ringPreviewInner,
          rp.color,
          2.5,
          previewRotModel,
          true,
        );
        ctx.globalAlpha = 1;
        this.drawHealthBadgeAt(
          p,
          badgeRadius,
          this.bigMiniHealthValues[idx] ?? 0,
          false,
          BIG_UNIT_HEALTH_UI_SCALE,
          'insideHexBigUnitBottom',
          (previewRotVisual * Math.PI) / 180,
        );
        const rBm = this.bigMiniEffectMarkers[idx];
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
          this.bigMiniActivated[idx] !== false,
        );
        this.drawBigBroomgarHungerIfAny(p, previewRotVisual, idx, bigActR);
      });
      ctx.restore();
    }
  }

  private drawBigMiniHexon(
    center: Hex,
    radius: number,
    fillColor: string,
    rotationDeg: number,
    spriteSrc: string | null,
  ): void {
    const { layout } = this;
    const p = layout.hexToPixel(center);
    this.drawBigMiniHexonAtPoint(p, radius, fillColor, rotationDeg, spriteSrc);
  }

  /** Big unit miniature: hexon shape (7 hexes) with image clipped like terrain; `radius` is legacy size hint for fallback art. */
  private drawBigMiniHexonAtPoint(
    point: Point,
    radius: number,
    fillColor: string,
    rotationDeg = 0,
    spriteSrc: string | null = null,
  ): void {
    const { ctx, config, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const bounds = this.bigMiniHexonBoundsLocal(layout);
    const { x: pcx, y: pcy } = this.localBoundsCenter(bounds);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const lwOuter = 2 / BIG_MINI_VISUAL_SCALE;
    const lwSymbol = 2 / BIG_MINI_VISUAL_SCALE;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(BIG_MINI_VISUAL_SCALE, BIG_MINI_VISUAL_SCALE);
    ctx.translate(-pcx, -pcy);
    const sprite = this.getSpriteImage(spriteSrc);
    /**
     * Растяжение на bbox следа (как large / huge): cover оставлял пустоты у скруглённого гексона.
     * Типичный юнит «Kellantra + Lindwurm» в каталоге — `size: "big"`, не `huge`.
     */
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      ctx.save();
      ctx.beginPath();
      this.addBigMiniHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      const fBm = this.oppositeSeatMiniatureRadFix;
      const uprightRad = fBm + this.contentFieldRotationDeltaRad;
      if (uprightRad !== 0) ctx.rotate(uprightRad);
      ctx.drawImage(sprite, -boxW / 2, -boxH / 2, boxW, boxH);
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
    applyContentCompensation = false,
  ): void {
    const { layout } = this;
    const p = layout.hexToPixel(center);
    this.drawBigMiniRingAtPoint(p, pathScale, strokeColor, width, rotationDeg, applyContentCompensation);
  }

  private drawBigMiniRingAtPoint(
    point: Point,
    pathScale: number,
    strokeColor: string,
    width: number,
    rotationDeg = 0,
    /** Miniatures only — terrain/ether rings follow field rotation without scenario content cancel. */
    applyContentCompensation = false,
  ): void {
    const { ctx, layout } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const hb = this.bigMiniHexonBoundsLocal(layout);
    const { x: hcx, y: hcy } = this.localBoundsCenter(hb);
    const lineW = width / pathScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad + (applyContentCompensation ? this.contentFieldRotationDeltaRad : 0));
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

  /** The three hexon centers (axial offsets match `hugeTriangleHexonCentersOriented` at anchor 0,0). */
  private hugeTriangleLocalHexonCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    const hexonOffsets = [new Hex(0, 0), new Hex(3, -1), new Hex(1, 2)];
    return hexonOffsets.map((hOff) => {
      const hc = layout.hexToPixel(hOff);
      return { x: hc.x - o.x, y: hc.y - o.y };
    });
  }

  /** 2-hexon domino (≤14 cells) in local space (anchor = first hexon center, rotation 0). */
  private huge2DominoLocalCellCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    const hexonCenters = [zero, zero.add(new Hex(3, -1))];
    const cells: Point[] = [];
    for (const hOff of hexonCenters) {
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

  /** Two hexon centers (matches `huge2DominoHexonCentersOriented` at anchor 0,0, rotation 0). */
  private huge2DominoLocalHexonCenters(layout: Layout): Point[] {
    const zero = new Hex(0, 0);
    const o = layout.hexToPixel(zero);
    const second = zero.add(new Hex(3, -1));
    const p1 = layout.hexToPixel(second);
    return [
      { x: 0, y: 0 },
      { x: p1.x - o.x, y: p1.y - o.y },
    ];
  }

  private huge2DominoFootprintBoundsLocal(layout: Layout): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    return this.boundsFromCells(this.huge2DominoLocalCellCenters(layout), layout);
  }

  /** Midpoint between the two domino hexon centers (same pivot as `main` off-board / on-board midpoint). */
  private huge2DominoHexonMidpointLocal(layout: Layout): Point {
    const [a, b] = this.huge2DominoLocalHexonCenters(layout);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Huge2 footprint = two merged big-hexon outlines (same geometry as big miniature),
   * translated to the two hexon centers.
   */
  private addHuge2DominoDoubleHexonOuterPath(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    scale: number,
  ): void {
    for (const c of this.huge2DominoLocalHexonCenters(layout)) {
      ctx.translate(scale * c.x, scale * c.y);
      this.addBigMiniHexonOuterPath(ctx, layout, scale);
      ctx.translate(-scale * c.x, -scale * c.y);
    }
  }

  /** Bbox of the 21-cell huge footprint (same as `hugeTriangleBoundsLocal` in healthUi). */
  private hugeMiniFootprintBoundsLocal(layout: Layout): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    return this.boundsFromCells(this.hugeTriangleLocalCellCenters(layout), layout);
  }

  /**
   * Huge mini footprint = three separate big-hexon outlines (same geometry as big miniature),
   * translated to the three hexon centers. Clip/fill/stroke use this union (nonzero winding).
   * Без save/restore на каждый гексон — иначе в части окружений путь для clip мог оставаться только от последнего субконтура.
   */
  private addHugeMiniTripleHexonOuterPath(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    scale: number,
  ): void {
    for (const c of this.hugeTriangleLocalHexonCenters(layout)) {
      ctx.translate(scale * c.x, scale * c.y);
      this.addBigMiniHexonOuterPath(ctx, layout, scale);
      ctx.translate(-scale * c.x, -scale * c.y);
    }
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

  private drawLargeMiniPlacedAtIndex(index: number, drawSelectionRing: boolean): void {
    const { config, layout } = this;
    const anchor = this.largeMiniAnchors[index];
    if (!anchor) return;
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
    const offBoard = this.largeMiniOffBoardWorlds[index];
    const rotDegModel = this.largeMiniRotationDeg[index] ?? 0;
    const rotDegContent = rotDegModel;
    const rotRadContent = (rotDegContent * Math.PI) / 180;
    const pivot = offBoard ?? layout.hexToPixel(anchor);

    this.drawLargeMiniShapeAtPoint(
      pivot,
      cells,
      bounds,
      boxW,
      boxH,
      config.largeMiniFillColor,
      rotDegModel,
      this.largeMiniSpriteSrcs[index] ?? null,
      largeLocalOrigin,
    );
    if (drawSelectionRing) {
      const ringSel = this.miniatureSelectionRingPathScale(LARGE_MINI_VISUAL_SCALE, bounds, 3);
      this.drawShapeRingAtPoint(
        pivot,
        cells,
        layout,
        ringSel,
        '#4caf50',
        3,
        rotDegModel,
        largeLocalOrigin,
      );
    }
    this.drawHealthBadgeAt(
      pivot,
      badgeRadius,
      this.largeMiniHealthValues[index] ?? 0,
      this.openHealthControlsLargeMiniIndex === index,
      LARGE_UNIT_HEALTH_UI_SCALE,
      'insideHexLargeUnit',
      rotRadContent,
    );
    this.drawActivationToggle(
      largeMiniActivationToggleCenterWorld(pivot, rotDegContent, layout),
      largeActR,
      this.largeMiniActivated[index] !== false,
    );
    this.drawLargeBroomgarHungerIfAny(pivot, rotDegContent, index, largeActR);
    const markers = this.largeMiniEffectMarkers[index];
    if (markers && markers.length > 0) {
      this.drawEffectMarkers(pivot, markers, badgeRadius, 'largeTri', rotRadContent);
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

    this.largeMiniAnchors.forEach((_anchor, index) => {
      if (this.draggingLargeMiniIndex === index) return;
      if (index === this.selectedLargeMiniIndex) return;
      if (this.isPeerDraggingEntity('large', index)) return;
      this.drawLargeMiniPlacedAtIndex(index, false);
    });

    // Ghost follows cursor; snapped drop target is only in drawDragHoverHex (like big mini).
    if (
      this.largeMiniPreviewPosition &&
      !(
        this.draggingLargeMiniIndex !== null &&
        this.draggingLargeMiniIndex === this.selectedLargeMiniIndex
      )
    ) {
      const previewRotModel = this.draggingLargeMiniIndex !== null
        ? (this.largeMiniRotationDeg[this.draggingLargeMiniIndex] ?? 0) : 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = this.largeMiniPreviewPosition;
      this.withTablePieceDragLift(p, () => {
        this.drawLargeMiniShapeAtPoint(
          p, cells, bounds, boxW, boxH,
          config.largeMiniPreviewColor,
          previewRotModel,
          this.draggingLargeMiniIndex !== null
            ? (this.largeMiniSpriteSrcs[this.draggingLargeMiniIndex] ?? null)
            : null,
          largeLocalOrigin,
        );
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
            largeMiniActivationToggleCenterWorld(p, previewRotContent, layout),
            largeActR,
            this.largeMiniActivated[this.draggingLargeMiniIndex] !== false,
          );
          this.drawLargeBroomgarHungerIfAny(
            p,
            previewRotContent,
            this.draggingLargeMiniIndex,
            largeActR,
          );
        }
      });
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'large' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.largeMiniAnchors.length) continue;
      const idx = d.index;
      const previewRotModel = this.largeMiniRotationDeg[idx] ?? 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      this.withTablePieceDragLift(p, () => {
        ctx.globalAlpha = 0.72;
        this.drawLargeMiniShapeAtPoint(
          p, cells, bounds, boxW, boxH,
          config.largeMiniPreviewColor, previewRotModel,
          this.largeMiniSpriteSrcs[idx] ?? null,
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
          this.largeMiniHealthValues[idx] ?? 0,
          false,
          LARGE_UNIT_HEALTH_UI_SCALE, 'insideHexLargeUnit', previewRotRadModel,
        );
        const rLm = this.largeMiniEffectMarkers[idx];
        if (rLm && rLm.length > 0) {
          this.drawEffectMarkers(p, rLm, badgeRadius, 'largeTri', previewRotRadModel);
        }
        this.drawActivationToggle(
          largeMiniActivationToggleCenterWorld(p, previewRotContent, layout),
          largeActR,
          this.largeMiniActivated[idx] !== false,
        );
        this.drawLargeBroomgarHungerIfAny(p, previewRotContent, idx, largeActR);
      });
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
    const lw = 2 / LARGE_MINI_VISUAL_SCALE;
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
      const uprightRad = fL + this.contentFieldRotationDeltaRad;
      ctx.save();
      if (uprightRad !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(uprightRad);
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

  // ── Huge2 miniatures (2 hexon domino) ───────────────────────────

  private drawHuge2MiniShapeAtPoint(
    point: Point,
    layout: Layout,
    fillColor: string,
    rotationDeg: number,
    spriteSrc: string | null,
    spriteOffsetLocal: Point = { x: 0, y: 0 },
    spriteRotationLocalDeg = 0,
  ): void {
    const { ctx, config } = this;
    const bounds = this.huge2DominoFootprintBoundsLocal(layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const midLocal = this.huge2DominoHexonMidpointLocal(layout);
    const { x: bcx, y: bcy } = this.localBoundsCenter(bounds);
    const rcx = bcx - midLocal.x;
    const rcy = bcy - midLocal.y;
    const rr = this.smallUnitHexCornerRadius();
    const artPad = Math.max(rr * 0.08, 0.012 * Math.max(boxW, boxH));
    const artW = boxW + 2 * artPad;
    const artH = boxH + 2 * artPad;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const lw = 2 / HUGE2_MINI_VISUAL_SCALE;
    const hs = HUGE2_MINI_VISUAL_SCALE;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(hs, hs);
    ctx.translate(-midLocal.x, -midLocal.y);

    const sprite = this.getSpriteImage(spriteSrc);
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      ctx.save();
      ctx.beginPath();
      this.addHuge2DominoDoubleHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      // Huge2 art rotates with the miniature/board; no seat-upright compensation.
      if (spriteRotationLocalDeg !== 0) {
        ctx.translate(rcx, rcy);
        ctx.rotate((spriteRotationLocalDeg * Math.PI) / 180);
        ctx.translate(-rcx, -rcy);
      }
      const ox = spriteOffsetLocal.x;
      const oy = spriteOffsetLocal.y;
      ctx.drawImage(sprite, rcx - artW / 2 + ox, rcy - artH / 2 + oy, artW, artH);
      ctx.restore();
    } else {
      ctx.beginPath();
      this.addHuge2DominoDoubleHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.beginPath();
    this.addHuge2DominoDoubleHexonOuterPath(ctx, layout, 1);
    ctx.strokeStyle = config.unitStrokeColor;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }

  private drawHuge2MiniBroomgarHungerIfAny(
    pivotWorld: Point,
    rotDegModel: number,
    index: number,
    actRadiusWorld: number,
  ): void {
    const ph = this.huge2MiniBroomgarHungerPhase[index];
    if (ph === null || ph === undefined) return;
    const tc = huge2MiniBroomgarHungerCenterFromPivotWorld(pivotWorld, rotDegModel, this.layout);
    this.drawBroomgarHungerDisc(tc, actRadiusWorld, ph);
  }

  private drawHuge2MiniMovement(): void {
    const { ctx, layout, config } = this;
    const walkKeys = new Set(this.huge2MiniWalkHexonCenters.map((c) => c.key));
    for (const center of this.huge2MiniRunHexonCenters) {
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
    for (const center of this.huge2MiniWalkHexonCenters) {
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

  private drawHuge2MiniPlacedAtIndex(index: number, drawSelectionRing: boolean): void {
    const { config, layout } = this;
    const anchor = this.huge2MiniAnchors[index];
    if (!anchor) return;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const selStrokeW = 3;
    const h2Bounds = this.huge2DominoFootprintBoundsLocal(layout);
    const ringSel = this.miniatureSelectionRingPathScale(
      HUGE2_MINI_VISUAL_SCALE,
      h2Bounds,
      selStrokeW,
    );
    const midLocal = this.huge2DominoHexonMidpointLocal(layout);
    const cells = this.huge2DominoLocalCellCenters(layout);
    const badgeRadius = baseRadius * HUGE2_MINI_VISUAL_SCALE;
    const huge2ActR =
      Math.min(layout.size.x, layout.size.y) *
      1.58 *
      HUGE2_MINI_VISUAL_SCALE *
      0.22;
    const offBoard = this.huge2MiniOffBoardWorlds[index];
    const rotDegModel = this.huge2MiniRotationDeg[index] ?? 0;
    const rotDegContent = rotDegModel;
    const rotRadContent = (rotDegContent * Math.PI) / 180;
    const centers = huge2DominoHexonCentersOriented(anchor, rotDegModel);
    const p0w = layout.hexToPixel(centers[0]!);
    const p1w = layout.hexToPixel(centers[1]!);
    const midOn = { x: (p0w.x + p1w.x) / 2, y: (p0w.y + p1w.y) / 2 };
    const pivotWorld = offBoard ?? midOn;

    this.drawHuge2MiniShapeAtPoint(
      pivotWorld,
      layout,
      config.bigMiniFillColor,
      rotDegModel,
      this.huge2MiniSpriteSrcs[index] ?? null,
      this.huge2MiniSpriteOffsetsLocal[index] ?? { x: 0, y: 0 },
      this.huge2MiniSpriteRotationDegLocal[index] ?? 0,
    );
    if (drawSelectionRing) {
      this.drawShapeRingAtPoint(
        pivotWorld,
        cells,
        layout,
        ringSel,
        '#4caf50',
        selStrokeW,
        rotDegModel,
        midLocal,
        false,
        true,
      );
    }
    this.drawHealthBadgeAt(
      pivotWorld,
      badgeRadius,
      this.huge2MiniHealthValues[index] ?? 0,
      this.openHealthControlsHuge2MiniIndex === index,
      HUGE2_UNIT_HEALTH_UI_SCALE,
      'insideHexHuge2Unit',
      rotRadContent,
    );
    this.drawActivationToggle(
      huge2MiniActivationToggleCenterFromPivotWorld(pivotWorld, rotDegContent, layout),
      huge2ActR,
      this.huge2MiniActivated[index] !== false,
    );
    this.drawHuge2MiniBroomgarHungerIfAny(pivotWorld, rotDegContent, index, huge2ActR);
    const markers = this.huge2MiniEffectMarkers[index];
    if (markers && markers.length > 0) {
      this.drawEffectMarkers(pivotWorld, markers, badgeRadius, 'huge2Dom', rotRadContent);
    }
  }

  private drawHuge2Miniatures(): void {
    const { ctx, config, layout } = this;
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const cells = this.huge2DominoLocalCellCenters(layout);
    const h2Bounds = this.huge2DominoFootprintBoundsLocal(layout);
    const huge2PreviewRingScale = this.miniatureSelectionRingPathScale(
      HUGE2_MINI_VISUAL_SCALE,
      h2Bounds,
      2,
    );
    const midLocal = this.huge2DominoHexonMidpointLocal(layout);
    const badgeRadius = baseRadius * HUGE2_MINI_VISUAL_SCALE;
    const huge2ActR =
      Math.min(layout.size.x, layout.size.y) *
      1.58 *
      HUGE2_MINI_VISUAL_SCALE *
      0.22;

    this.huge2MiniAnchors.forEach((_anchor, index) => {
      if (this.draggingHuge2MiniIndex === index) return;
      if (index === this.selectedHuge2MiniIndex) return;
      if (this.isPeerDraggingEntity('huge2', index)) return;
      this.drawHuge2MiniPlacedAtIndex(index, false);
    });

    if (
      this.huge2MiniPreviewPosition &&
      !(
        this.draggingHuge2MiniIndex !== null &&
        this.draggingHuge2MiniIndex === this.selectedHuge2MiniIndex
      )
    ) {
      const previewRotModel =
        this.draggingHuge2MiniIndex !== null
          ? (this.huge2MiniRotationDeg[this.draggingHuge2MiniIndex] ?? 0)
          : 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = this.huge2MiniPreviewPosition;
      const idx = this.draggingHuge2MiniIndex;
      this.withTablePieceDragLift(p, () => {
        if (idx !== null) {
          const anchor = this.huge2MiniAnchors[idx];
          if (anchor) {
            this.drawHuge2MiniShapeAtPoint(
              p,
              layout,
              config.hugeMiniPreviewColor,
              previewRotModel,
              this.huge2MiniSpriteSrcs[idx] ?? null,
              this.huge2MiniSpriteOffsetsLocal[idx] ?? { x: 0, y: 0 },
              this.huge2MiniSpriteRotationDegLocal[idx] ?? 0,
            );
          }
        }
        if (this.draggingHuge2MiniIndex !== null) {
          const di = this.draggingHuge2MiniIndex;
          this.drawHealthBadgeAt(
            p,
            badgeRadius,
            this.huge2MiniHealthValues[di] ?? 0,
            this.openHealthControlsHuge2MiniIndex === di,
            HUGE2_UNIT_HEALTH_UI_SCALE,
            'insideHexHuge2Unit',
            previewRotRadModel,
          );
          const dragMarkers = this.huge2MiniEffectMarkers[di];
          if (dragMarkers && dragMarkers.length > 0) {
            this.drawEffectMarkers(p, dragMarkers, badgeRadius, 'huge2Dom', previewRotRadModel);
          }
          this.drawActivationToggle(
            huge2MiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
            huge2ActR,
            this.huge2MiniActivated[di] !== false,
          );
          this.drawHuge2MiniBroomgarHungerIfAny(p, previewRotContent, di, huge2ActR);
        }
      });
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'huge2' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.huge2MiniAnchors.length) continue;
      const idx = d.index;
      const previewRotModel = this.huge2MiniRotationDeg[idx] ?? 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      this.withTablePieceDragLift(p, () => {
        ctx.globalAlpha = 0.72;
        this.drawHuge2MiniShapeAtPoint(
          p,
          layout,
          config.hugeMiniPreviewColor,
          previewRotModel,
          this.huge2MiniSpriteSrcs[idx] ?? null,
          this.huge2MiniSpriteOffsetsLocal[idx] ?? { x: 0, y: 0 },
          this.huge2MiniSpriteRotationDegLocal[idx] ?? 0,
        );
        ctx.globalAlpha = 0.5;
        this.drawShapeRingAtPoint(
          p,
          cells,
          layout,
          huge2PreviewRingScale,
          rp.color,
          2.2,
          previewRotModel,
          midLocal,
          false,
          true,
        );
        ctx.globalAlpha = 1;
        this.drawHealthBadgeAt(
          p,
          badgeRadius,
          this.huge2MiniHealthValues[idx] ?? 0,
          false,
          HUGE2_UNIT_HEALTH_UI_SCALE,
          'insideHexHuge2Unit',
          previewRotRadModel,
        );
        const rHm = this.huge2MiniEffectMarkers[idx];
        if (rHm && rHm.length > 0) {
          this.drawEffectMarkers(p, rHm, badgeRadius, 'huge2Dom', previewRotRadModel);
        }
        this.drawActivationToggle(
          huge2MiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
          huge2ActR,
          this.huge2MiniActivated[idx] !== false,
        );
        this.drawHuge2MiniBroomgarHungerIfAny(p, previewRotContent, idx, huge2ActR);
      });
      ctx.restore();
    }
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

  private drawHugeMiniPlacedAtIndex(index: number, drawSelectionRing: boolean): void {
    const { config, layout } = this;
    const anchor = this.hugeMiniAnchors[index];
    if (!anchor) return;
    const cells = this.hugeTriangleLocalCellCenters(layout);
    const bounds = this.hugeMiniFootprintBoundsLocal(layout);
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const badgeRadius = baseRadius * HUGE_MINI_VISUAL_SCALE;
    const hugeActR =
      Math.min(layout.size.x, layout.size.y) *
      1.58 *
      HUGE_MINI_VISUAL_SCALE *
      0.22;
    const offBoard = this.hugeMiniOffBoardWorlds[index];
    const rotDegModel = this.hugeMiniRotationDeg[index] ?? 0;
    const rotDegContent = rotDegModel;
    const rotRadContent = (rotDegContent * Math.PI) / 180;
    const pivot = offBoard ?? hugeMiniDrawPivotWorld(anchor, rotDegModel, layout);

    this.drawHugeMiniShapeAtPoint(
      pivot,
      layout,
      config.hugeMiniFillColor,
      rotDegModel,
      this.hugeMiniSpriteSrcs[index] ?? null,
      this.hugeMiniSpriteOffsetsLocal[index] ?? { x: 0, y: 0 },
      this.hugeMiniSpriteRotationDegLocal[index] ?? 0,
    );
    if (drawSelectionRing) {
      const ringSel = this.miniatureSelectionRingPathScale(HUGE_MINI_VISUAL_SCALE, bounds, 3);
      this.drawShapeRingAtPoint(pivot, cells, layout, ringSel, '#4caf50', 3, rotDegModel, undefined, true);
    }
    this.drawHealthBadgeAt(
      pivot,
      badgeRadius,
      this.hugeMiniHealthValues[index] ?? 0,
      this.openHealthControlsHugeMiniIndex === index,
      HUGE_UNIT_HEALTH_UI_SCALE,
      'insideHexHugeUnit',
      rotRadContent,
    );
    this.drawActivationToggle(
      hugeMiniActivationToggleCenterFromPivotWorld(pivot, rotDegContent, layout),
      hugeActR,
      this.hugeMiniActivated[index] !== false,
    );
    this.drawHugeBroomgarHungerIfAny(pivot, rotDegContent, index, hugeActR);
    const markers = this.hugeMiniEffectMarkers[index];
    if (markers && markers.length > 0) {
      this.drawEffectMarkers(pivot, markers, badgeRadius, 'hugeTri', rotRadContent);
    }
  }

  private drawHugeMiniatures(): void {
    const { ctx, config, layout } = this;
    const cells = this.hugeTriangleLocalCellCenters(layout);
    const bounds = this.hugeMiniFootprintBoundsLocal(layout);
    /** Same footprint scale as silhouette / clip (not 0.62× like big-mini inner preview ring). */
    const hugePreviewRingPathScale = this.miniatureSelectionRingPathScale(
      HUGE_MINI_VISUAL_SCALE,
      bounds,
      2,
    );
    const baseRadius = Math.min(layout.size.x, layout.size.y) * 1.58;
    const badgeRadius = baseRadius * HUGE_MINI_VISUAL_SCALE;
    const hugeActR =
      Math.min(layout.size.x, layout.size.y) *
      1.58 *
      HUGE_MINI_VISUAL_SCALE *
      0.22;

    this.hugeMiniAnchors.forEach((_anchor, index) => {
      if (this.draggingHugeMiniIndex === index) return;
      if (index === this.selectedHugeMiniIndex) return;
      if (this.isPeerDraggingEntity('huge', index)) return;
      this.drawHugeMiniPlacedAtIndex(index, false);
    });

    if (
      this.hugeMiniPreviewPosition &&
      !(
        this.draggingHugeMiniIndex !== null &&
        this.draggingHugeMiniIndex === this.selectedHugeMiniIndex
      )
    ) {
      const previewRotModel = this.draggingHugeMiniIndex !== null
        ? (this.hugeMiniRotationDeg[this.draggingHugeMiniIndex] ?? 0) : 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = this.hugeMiniPreviewPosition;
      this.withTablePieceDragLift(p, () => {
        this.drawHugeMiniShapeAtPoint(
          p,
          layout,
          config.hugeMiniPreviewColor,
          previewRotModel,
          this.draggingHugeMiniIndex !== null
            ? (this.hugeMiniSpriteSrcs[this.draggingHugeMiniIndex] ?? null)
            : null,
          this.draggingHugeMiniIndex !== null
            ? (this.hugeMiniSpriteOffsetsLocal[this.draggingHugeMiniIndex] ?? { x: 0, y: 0 })
            : { x: 0, y: 0 },
          this.draggingHugeMiniIndex !== null
            ? (this.hugeMiniSpriteRotationDegLocal[this.draggingHugeMiniIndex] ?? 0)
            : 0,
        );
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
            hugeMiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
            hugeActR,
            this.hugeMiniActivated[this.draggingHugeMiniIndex] !== false,
          );
          this.drawHugeBroomgarHungerIfAny(
            p,
            previewRotContent,
            this.draggingHugeMiniIndex,
            hugeActR,
          );
        }
      });
    }

    for (const rp of this.remotePeerTableDrags) {
      const d = rp.drag;
      if (d.kind !== 'huge' || d.index === null || d.worldX === null || d.worldY === null) continue;
      if (d.index < 0 || d.index >= this.hugeMiniAnchors.length) continue;
      const idx = d.index;
      const previewRotModel = this.hugeMiniRotationDeg[idx] ?? 0;
      const previewRotContent = previewRotModel;
      const previewRotRadModel = (previewRotContent * Math.PI) / 180;
      const p = { x: d.worldX, y: d.worldY };
      ctx.save();
      this.withTablePieceDragLift(p, () => {
        ctx.globalAlpha = 0.72;
        this.drawHugeMiniShapeAtPoint(
          p,
          layout,
          config.hugeMiniPreviewColor,
          previewRotModel,
          this.hugeMiniSpriteSrcs[idx] ?? null,
          this.hugeMiniSpriteOffsetsLocal[idx] ?? { x: 0, y: 0 },
          this.hugeMiniSpriteRotationDegLocal[idx] ?? 0,
        );
        ctx.globalAlpha = 0.5;
        this.drawShapeRingAtPoint(
          p,
          cells,
          layout,
          hugePreviewRingPathScale,
          rp.color,
          2.2,
          previewRotModel,
          undefined,
          true,
        );
        ctx.globalAlpha = 1;
        this.drawHealthBadgeAt(
          p, badgeRadius,
          this.hugeMiniHealthValues[idx] ?? 0,
          false,
          HUGE_UNIT_HEALTH_UI_SCALE, 'insideHexHugeUnit', previewRotRadModel,
        );
        const rHm = this.hugeMiniEffectMarkers[idx];
        if (rHm && rHm.length > 0) {
          this.drawEffectMarkers(p, rHm, badgeRadius, 'hugeTri', previewRotRadModel);
        }
        this.drawActivationToggle(
          hugeMiniActivationToggleCenterFromPivotWorld(p, previewRotContent, layout),
          hugeActR,
          this.hugeMiniActivated[idx] !== false,
        );
        this.drawHugeBroomgarHungerIfAny(p, previewRotContent, idx, hugeActR);
      });
      ctx.restore();
    }
  }

  private drawHugeMiniShapeAtPoint(
    point: Point,
    layout: Layout,
    fillColor: string,
    rotationDeg: number,
    spriteSrc: string | null,
    spriteOffsetLocal: Point = { x: 0, y: 0 },
    spriteRotationLocalDeg = 0,
  ): void {
    const { ctx, config } = this;
    const bounds = this.hugeMiniFootprintBoundsLocal(layout);
    const boxW = bounds.maxX - bounds.minX;
    const boxH = bounds.maxY - bounds.minY;
    const rr = this.smallUnitHexCornerRadius();
    /** Slight inflate so rounded clip + subpixel rasterization never shave the stretched art at the lobes. */
    const artPad = Math.max(rr * 0.08, 0.012 * Math.max(boxW, boxH));
    const artW = boxW + 2 * artPad;
    const artH = boxH + 2 * artPad;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const lw = 2 / HUGE_MINI_VISUAL_SCALE;
    const { x: pcx, y: pcy } = this.localBoundsCenter(bounds);
    const hs = HUGE_MINI_VISUAL_SCALE;

    ctx.save();
    /** `point` = hugeMiniDrawPivotWorld: в мире совпадает с центром bbox следа — вращение вокруг центра миниатюры. */
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(hs, hs);
    ctx.translate(-pcx, -pcy);

    const sprite = this.getSpriteImage(spriteSrc);
    /**
     * После translate(-C) начало координат в центре bbox; drawImage от центра.
     * Внутри клипа компенсируем field tilt + opposite seat, чтобы арт оставался player-facing
     * (как цифра на эфирном вихре), при этом физический силуэт продолжает вращаться с полем.
     */
    if (sprite && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
      ctx.save();
      ctx.beginPath();
      this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
      ctx.clip();
      // Huge art rotates with the miniature/board; no seat-upright compensation.
      if (spriteRotationLocalDeg !== 0) {
        ctx.rotate((spriteRotationLocalDeg * Math.PI) / 180);
      }
      const ox = spriteOffsetLocal.x;
      const oy = spriteOffsetLocal.y;
      ctx.drawImage(sprite, -artW / 2 + ox, -artH / 2 + oy, artW, artH);
      ctx.restore();
    } else {
      ctx.beginPath();
      this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.beginPath();
    this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
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
    /** Huge mini: three merged hexon blobs (same as sprite clip), not 21-cell hull. */
    hugeTripleHexon?: boolean,
    /** Huge2 domino: two merged hexon blobs (same as sprite clip). */
    hugeDoubleHexon?: boolean,
  ): void {
    const { ctx } = this;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const b = hugeTripleHexon
      ? this.hugeMiniFootprintBoundsLocal(layout)
      : hugeDoubleHexon
        ? this.huge2DominoFootprintBoundsLocal(layout)
        : this.boundsFromCells(cells, layout);
    const d = localOriginInCellSpace ?? this.localBoundsCenter(b);
    const cx = d.x;
    const cy = d.y;
    const lineW = width / pathScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotRad);
    ctx.scale(pathScale, pathScale);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    if (hugeTripleHexon) {
      this.addHugeMiniTripleHexonOuterPath(ctx, layout, 1);
    } else if (hugeDoubleHexon) {
      this.addHuge2DominoDoubleHexonOuterPath(ctx, layout, 1);
    } else {
      this.addOuterPathFromCells(ctx, layout, cells, 1);
    }
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
