/**
 * Entry point — wires everything together.
 */

import {
  Hex,
  Layout,
  type Point,
  hugeTriangleAllCellsOriented,
  hugeTriangleHexonCentersOriented,
  largeTriangleCellsOriented,
  layoutHugeMiniTriplePointWorld,
  layoutSharedVertexThreeHexes,
} from './hex';
import { HexGrid } from './grid';
import {
  Camera,
  GOD_TABLE_CARD_FLIP_MS,
  GOD_TABLE_CARD_HW,
  GOD_TABLE_CARD_HH,
  GOD_TABLE_CARD_ROT_CW_DEG,
  INVENTORY_TABLE_MARKER_HW,
  INVENTORY_TABLE_MARKER_HH,
  Renderer,
  defaultRenderConfig,
} from './renderer';
import { DiceRoller } from './dice';
import {
  UnitCard,
  unitMiniatureImageSrc,
  type AttackAbility,
  type DiceRequest,
  type UnitCardData,
  type UnitCardShowOptions,
} from './unitCard';
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
  HUGE_MINI_VISUAL_SCALE,
  HUGE_UNIT_HEALTH_UI_SCALE,
  hugeMiniActivationToggleCenterFromPivotWorld,
  hugeMiniBroomgarHungerCenterFromPivotWorld,
  hugeMiniDrawPivotWorld,
  hugeMiniHealthBadgeCenterWorld,
  isWorldPointInBigMiniSilhouette,
  isWorldPointInLargeMiniSilhouette,
  HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE,
  HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC,
  SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
  smallUnitActivationToggleCenterWorldRad,
  smallUnitBroomgarHungerCenterWorldRad,
  smallUnitHealthBadgeCenterWorldRad,
} from './healthUi';
import {
  isBroomgarRosterLeader,
  nextBroomgarHungerPhase,
  parseBroomgarHungerPhase,
  type BroomgarHungerPhase,
} from './broomgarHunger';
import { CrystalWallet } from './crystalWallet';
import {
  CATALOG_UNITS,
  getCatalogUnit,
  getLeader,
  LEADER_MINI_MAX_COPIES,
  maxCopiesForSlot,
  rosterSpawnPoints,
} from './armyCatalog';
import { getMergedInventoryItem } from './catalog/catalogOverrides';
import type { CatalogUnitDef } from './catalog/types';
import { ArmyBuilderPanel, DND_MIME, type ArmyDragPayload } from './armyBuilderPanel';
import { EPHIRIUM_VORTEX_CARDS } from './ephiriumVortexCards';
import { EphiriumVortexUi } from './ephiriumVortexUi';
import {
  etherVortexCrystalBadgeHitRadiusWorld,
  etherVortexFootprint,
  type EtherVortexDomainId,
  type EtherVortexState,
} from './etherVortex';
import { EtherVortexContextMenu } from './etherVortexContextMenu';
import { EtherVortexCrystalPopover } from './etherVortexCrystalPopover';
import {
  EFFECT_MARKERS,
  EffectMarkerMenu,
  type EffectMarkerId,
} from './effectMarkerMenu';
import {
  clonePile,
  createInitialGodPiles,
  EMPTY_GOD_PILE,
  GOD_BLIND_ZONE_MAX_CARDS,
  godCardIdsInPlay,
  registerArmyRosterGodCardIdsInPlay,
  registerArmyRosterInventoryItemIdsInPlay,
  shuffleIds,
  type GodSlotPile,
} from './godDeckState.ts';
import { GodHandBlindDock, type GodBlindZoneLayout } from './godHandBlindDock.ts';
import { getGodCardById, type GodTablePiece } from './godCards';
import type {
  SerializedBoardStateV1,
  SerializedCrystalWalletsV1,
  SerializedGodDeckSlotsV1,
  SerializedGodSlotV1,
} from './multiplayer/boardState.ts';
import { isSerializedBoardStateV1, parseSharedDiceState } from './multiplayer/boardState.ts';
import {
  isBoardMultiplayerSyncActive,
  notifyBoardEditLocal,
  registerBoardSyncApi,
} from './multiplayer/boardSync.ts';
import type { PlayerSlot, TableDragState } from './multiplayer/protocol.ts';
import { EMPTY_TABLE_DRAG } from './multiplayer/protocol.ts';
import { tickTableDragOutbound } from './multiplayer/tableDragOutbound.ts';
import { initMultiplayerSession, sendRoomClientMessage } from './multiplayer/session.ts';
import { mountAppMoreMenu } from './appMoreMenu.ts';
import { getWheelBehavior, mountAppSettingsToolbar } from './appSettings.ts';
import { createPwaInstallMenuFlow } from './pwaInstallUi.ts';
import './style.css';
import { playBoardDragDrop, playBoardDragLift, playGodDeckShuffle } from './boardDragSfx';
import { loadCatalogBundle } from './catalog/index.ts';

await loadCatalogBundle();

// ── Config ─────────────────────────────────────────────────────

const HEX_SIZE = 28;
const BOARD_ROTATION_DEG = -10;
/** +180° for multiplayer `playerSlot === 1` (opposite seat); 0 otherwise. */
let viewSeatExtraRotationDeg = 0;
/** Local seat in room (`null` = solo / disconnected / spectator). Used for roster points / copy limits. */
let localViewPlayerSlot: PlayerSlot | null = null;

/** Crystal wallet counts per table seat (faith + ether); UI rows map via `crystalWalletSlotsForUi`). */
const crystalWalletBySlot: { 0: Map<string, number>; 1: Map<string, number> } = {
  0: new Map(),
  1: new Map(),
};

function effectiveBoardRotationDeg(): number {
  return BOARD_ROTATION_DEG + viewSeatExtraRotationDeg;
}

/** Same as `renderer` `oppositeSeatUnitRotationCorrectionDeg` (MP slot 1 = −180). */
function oppositeSeatUnitRotationCorrectionDeg(): number {
  return viewSeatExtraRotationDeg === 180 ? -180 : 0;
}

/** Model rotation + seat fix — HP / activation / effect-marker anchors (matches `rotRadVisual` in renderer). */
function unitRotationDegForMiniatureLocalUi(modelDeg: number): number {
  return modelDeg + oppositeSeatUnitRotationCorrectionDeg();
}

function unitRotationRadForMiniatureLocalUi(modelDeg: number): number {
  return (unitRotationDegForMiniatureLocalUi(modelDeg) * Math.PI) / 180;
}

/**
 * World centers for − / + around HP badge — matches `drawHealthBadgeAt` rotate when seat fix ≠ 0.
 */
function healthBadgePlusMinusCentersWorld(
  badgeCenterWorld: Point,
  buttonOffsetWorld: number,
): { minus: Point; plus: Point } {
  const fix = oppositeSeatUnitRotationCorrectionDeg();
  if (fix === 0) {
    return {
      minus: { x: badgeCenterWorld.x - buttonOffsetWorld, y: badgeCenterWorld.y },
      plus: { x: badgeCenterWorld.x + buttonOffsetWorld, y: badgeCenterWorld.y },
    };
  }
  const rad = ((-fix) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rot = (vx: number, vy: number): Point => ({
    x: badgeCenterWorld.x + c * vx - s * vy,
    y: badgeCenterWorld.y + s * vx + c * vy,
  });
  return {
    minus: rot(-buttonOffsetWorld, 0),
    plus: rot(buttonOffsetWorld, 0),
  };
}

const BG_CALIBRATION_STEP = 1;
const BG_CALIBRATION_STEP_FAST = 4;
const BG_CALIBRATION_SCALE_STEP = 0.001;
const ELEMENT_ROT_STEP = 5;
const ELEMENT_ROT_STEP_FAST = 15;
/** Huge mini: nudge card art inside the footprint (layout units). Alt+arrows; Shift = larger step. */
const HUGE_SPRITE_NUDGE_STEP = HEX_SIZE * 0.05;
const HUGE_SPRITE_NUDGE_STEP_FAST = HEX_SIZE * 0.15;
/** Rotation of art inside huge clip (degrees per keypress). */
const HUGE_SPRITE_ROT_STEP = 2;
const HUGE_SPRITE_ROT_STEP_FAST = 5;
/**
 * Фиксированное выравнивание арта внутри huge-клипа по `catalogUnitId`, если каталог/оверрайды
 * по какой-то причине не дают стабильные `hugeSprite*` на карточке при спавне.
 * Добавляй сюда юнитов с «залипшим» выравниванием — один источник правды для стола.
 */
const HUGE_SPRITE_ALIGN_OVERRIDES: Record<
  string,
  { spriteOffsetLocal: { x: number; y: number }; spriteRotationDeg: number }
> = {
  'Great-Aent-Sentry': {
    spriteOffsetLocal: { x: 68.6, y: -33.6 },
    spriteRotationDeg: 60,
  },
};
/** Large mini (3-hex): rotate around anchor hex, 60° steps (Shift = 120°). */
const LARGE_MINI_ROT_STEP = 60;
const LARGE_MINI_ROT_STEP_FAST = 120;
/** Pixels before a mousedown on the selected unit counts as drag (otherwise = click to deselect). */
const UNIT_DRAG_THRESHOLD_PX = 5;
/** Touch: long-press to open effect-marker menu (same as right-click). */
const EFFECT_MARKER_LONG_PRESS_MS = 520;
const EFFECT_MARKER_LONG_PRESS_MOVE_PX = 12;
/** Touch: double-tap to flip loose god card (same as double-click). */
const GOD_LOOSE_DOUBLE_TAP_MS = 380;
const GOD_LOOSE_DOUBLE_TAP_DIST_PX = 28;
/** Touch: double-tap miniature to pin unit card (same as mouse double-click). */
const UNIT_CARD_DOUBLE_TAP_MS = GOD_LOOSE_DOUBLE_TAP_MS;
const UNIT_CARD_DOUBLE_TAP_DIST_PX = GOD_LOOSE_DOUBLE_TAP_DIST_PX;

/** Minimal client position (mouse / pointer / synthetic). */
type ClientXY = { clientX: number; clientY: number };
const UNIT_HEALTH_MIN = 0;

/** Общий доп. поворот текстуры поля и `cells.svg` относительно гексов — один источник правды. */
const BOARD_FIELD_ART_EXTRA_ROTATION_DEG = 105.5;

/**
 * Калибровка текстуры поля (bg hotkeys). Базовый поворот = `BOARD_FIELD_ART_EXTRA_ROTATION_DEG` как у сетки.
 */
const FIELD_BG_PRESET = {
  backgroundImageOffsetX: -47,
  backgroundImageOffsetY: 1,
  backgroundImageScale: 1.044,
  backgroundImageRotationDeg: BOARD_FIELD_ART_EXTRA_ROTATION_DEG,
};

const SMALL_UNIT_SPRITES = ['/tern-unit-1.jpg', '/Frame 144.png'] as const;
const BIG_UNIT_SPRITE = '/Frame 118.png';
const LARGE_UNIT_SPRITE = '/Frame 193.png';

// ── Bootstrap ──────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('#game-canvas not found');

/**
 * `cells.svg`: поворот сетки только из констант (`GRID_OVERLAY_EXTRA_ROTATION_DEG`); горячих клавиш поворота нет.
 * Alt+стрелки — смещение сетки; Alt+P — в консоль смещения/размеры.
 * `public/greenfield.png` — текстура поля; угол поля задаётся в коде (`FIELD_BG_PRESET` / `desertUnderlayExtraRotationDeg`), не клавишами.
 */
const GRID_OVERLAY_EXTRA_ROTATION_DEG = BOARD_FIELD_ART_EXTRA_ROTATION_DEG;
const GRID_OVERLAY_MOVE_STEP = 2;
const GRID_OVERLAY_MOVE_STEP_FAST = 8;

let desertUnderlayExtraRotationDeg = 0;

let gridOverlayOffsetScreenX = 0;
let gridOverlayOffsetScreenY = 0;
/** `null` = размер по границам поля и текущему zoom */
let gridOverlayManualWidthPx: number | null = null;
let gridOverlayManualHeightPx: number | null = null;

/** Версия в query — сброс кэша SW/браузера после смены `public/cellscontrast.svg`. */
const CELLS_SVG_CACHE_KEY = 'e5e5e5-inline-contrast-2';
const BOARD_UNDERLAY_IMAGE_CACHE_KEY = '2';

function mountBoardDesertUnderlay(parent: HTMLElement): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'board-desert-underlay-wrap';
  wrap.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.className = 'board-desert-underlay-img';
  img.src = `/greenfield.png?${BOARD_UNDERLAY_IMAGE_CACHE_KEY}`;
  img.alt = '';
  img.draggable = false;
  wrap.appendChild(img);
  parent.appendChild(wrap);
  return wrap;
}

/** Пустой узел (калибровка Alt+стрелки по-прежнему двигает `gridOverlayOffset*`). Рисунок — в Renderer. */
function mountBoardGridOverlay(parent: HTMLElement): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'board-grid-overlay-wrap';
  wrap.setAttribute('aria-hidden', 'true');
  parent.appendChild(wrap);
  return wrap;
}

const boardDesertUnderlay = mountBoardDesertUnderlay(document.body);
const boardGridOverlay = mountBoardGridOverlay(document.body);

/**
 * Фон — в Renderer. `cells.svg` на канвасе после заливки гексов, под ландшафтом и юнитами (`cellsSvgOverlaySrc`).
 * DOM-оверлеи скрыты; смещения сетки для хоткеев сохраняются на пустом wrap.
 */
boardDesertUnderlay.style.display = 'none';
boardGridOverlay.style.display = 'none';

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
resizeCanvas();

function mountTopTurnPanel(
  parent: HTMLElement,
  opts?: { onAdvanceTurn?: () => void },
): {
  localWalletMount: HTMLElement;
  opponentWalletMount: HTMLElement;
} {
  const panel = document.createElement('div');
  panel.className = 'turn-top-panel';

  const wingLeft = document.createElement('div');
  wingLeft.className = 'turn-wing turn-wing--left';

  const opponentWalletMount = document.createElement('div');
  opponentWalletMount.className = 'turn-wallet-mount turn-wallet-mount-opponent';

  const center = document.createElement('div');
  center.className = 'turn-panel-center';

  let turn = 1;
  const maxTurn = 6;

  const turnButton = document.createElement('button');
  turnButton.type = 'button';
  turnButton.className = 'turn-counter-btn';
  turnButton.textContent = `Ход ${turn}`;
  turnButton.setAttribute('aria-expanded', 'false');

  const endTurnButton = document.createElement('button');
  endTurnButton.type = 'button';
  endTurnButton.className = 'turn-end-btn';
  endTurnButton.textContent = 'Завершить ход';
  endTurnButton.hidden = true;

  const syncTurnUi = (): void => {
    turnButton.textContent = `Ход ${turn}`;
    endTurnButton.disabled = turn >= maxTurn;
  };

  turnButton.addEventListener('click', () => {
    const nextHidden = !endTurnButton.hidden;
    endTurnButton.hidden = nextHidden;
    turnButton.setAttribute('aria-expanded', String(!nextHidden));
  });

  endTurnButton.addEventListener('click', () => {
    if (turn >= maxTurn) return;
    turn += 1;
    syncTurnUi();
    endTurnButton.hidden = true;
    turnButton.setAttribute('aria-expanded', 'false');
    opts?.onAdvanceTurn?.();
  });

  center.appendChild(turnButton);
  center.appendChild(endTurnButton);

  const localWalletMount = document.createElement('div');
  localWalletMount.className = 'turn-wallet-mount turn-wallet-mount-local';

  const wingRight = document.createElement('div');
  wingRight.className = 'turn-wing turn-wing--right';

  wingLeft.appendChild(opponentWalletMount);
  wingRight.appendChild(localWalletMount);

  panel.appendChild(wingLeft);
  panel.appendChild(center);
  panel.appendChild(wingRight);
  parent.appendChild(panel);

  syncTurnUi();
  return { localWalletMount, opponentWalletMount };
}

// ── Create grid & layout ───────────────────────────────────────

const grid = new HexGrid();

function addHexon(center: Hex): void {
  grid.add(center);
  for (const direction of Hex.directions) {
    grid.add(center.add(direction));
  }
}

function addHexonRow(start: Hex, count: number): void {
  for (let i = 0; i < count; i++) {
    addHexon(new Hex(start.q + i * 3, start.r - i));
  }
}

// Row 1: 6 hexons in a line.
addHexonRow(new Hex(2, 0), 6);
// Row 2: 7 hexons below the first row.
addHexonRow(new Hex(0, 3), 7);
// Row 3: 6 hexons below the second row.
addHexonRow(new Hex(1, 5), 6);
// Row 4: 7 hexons below the third row.
addHexonRow(new Hex(-1, 8), 7);
// Row 5: 6 hexons below the fourth row.
addHexonRow(new Hex(0, 10), 6);
// Row 6: 7 hexons below the fifth row.
addHexonRow(new Hex(-2, 13), 7);
// Row 7: 6 hexons below the sixth row.
addHexonRow(new Hex(-1, 15), 6);

const layout = new Layout(
  'flat',
  { x: HEX_SIZE, y: HEX_SIZE },
  { x: 0, y: 0 },
);

// ── Camera — center grid on screen ────────────────────────────

const camera = new Camera();

function centerCamera(): void {
  const allHexes = grid.allHexes();
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const hex of allHexes) {
    const p = layout.hexToPixel(hex);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const gridW = maxX - minX + HEX_SIZE * 3;
  const gridH = maxY - minY + HEX_SIZE * 3;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const padding = 40;
  const scaleX = (window.innerWidth - padding * 2) / gridW;
  const scaleY = (window.innerHeight - padding * 2) / gridH;
  camera.zoom = Math.min(scaleX, scaleY, 1.5);

  camera.offsetX = window.innerWidth / 2 - centerX * camera.zoom;
  camera.offsetY = window.innerHeight / 2 - centerY * camera.zoom;
}
centerCamera();

function getBoardCenterWorld(): { x: number; y: number } {
  const allHexes = grid.allHexes();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const hex of allHexes) {
    const p = layout.hexToPixel(hex);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

/** God cards / decks on the table (from panel DnD or merged stacks). */
let godTablePieces: GodTablePiece[] = [];

/** Inventory item tokens on the board (sprites from catalog). */
export type InventoryTablePiece = {
  rosterLeaderId: string;
  itemId: string;
  world: Point;
  spawnedFromArmyPanel?: boolean;
  armyOwnerPlayerSlot?: PlayerSlot;
};
let inventoryTablePieces: InventoryTablePiece[] = [];

/** Budget: how many of each item are taken in the army list (per leader). */
/** Колода / рука / сброс / слепая зона по слотам 0 и 1. */
let godPiles: [GodSlotPile, GodSlotPile] = createInitialGodPiles();
let godHandBlindDock: GodHandBlindDock | null = null;
/** Selected loose god piece index (same pattern as terrain / big mini). */
let selectedGodTablePieceIndex: number | null = null;
let selectedInventoryTablePieceIndex: number | null = null;
/** True from pointerdown on an already-selected deck until drag ends — next drag moves whole stack (no peel). */
let godDragWholeGodDeck = false;
let godLooseDragPending = false;
let godLooseDragPendingIndex: number | null = null;
let godLooseDragPendingStartX = 0;
let godLooseDragPendingStartY = 0;
let isDraggingGodLoose = false;
let godDraggingLooseIndex: number | null = null;
let godLooseDragPreviewWorld: Point | null = null;
/** Loose god piece index + flip timing (renderer reads for scale animation). */
let godPieceFlipAnim: {
  index: number;
  startMs: number;
  durationMs: number;
  fromFaceUp: boolean;
} | null = null;
let godDeckShuffleAnim: {
  index: number;
  startMs: number;
  durationMs: number;
} | null = null;

/** Inventory markers — loose drag hit box (совпадает с max-рамкой отрисовки в renderer). */
let inventoryLooseDragPending = false;
let inventoryLooseDragPendingIndex: number | null = null;
let inventoryLooseDragPendingStartX = 0;
let inventoryLooseDragPendingStartY = 0;
let isDraggingInventoryLoose = false;
let inventoryDraggingIndex: number | null = null;
let inventoryLooseDragPreviewWorld: Point | null = null;

const GOD_BLIND_ZONE_GAP_FROM_BOARD = 28;
/** Базовый зазор между картами в экранных px при zoom=1 (далее × camera.zoom). */
const GOD_BLIND_CARD_GAP_BASE_SCREEN = 8;
/** Базовый внутренний отступ рамки от карт при zoom=1 (далее × camera.zoom). */
const GOD_BLIND_HUG_MARGIN_BASE_SCREEN = 10;
/** Базовая толщина рамки слепой зоны в экранных px при zoom=1 (далее × camera.zoom). */
const GOD_BLIND_BORDER_BASE_SCREEN = 4;

function godBlindCardGapScreenPx(): number {
  return GOD_BLIND_CARD_GAP_BASE_SCREEN * camera.zoom;
}

function godBlindHugMarginScreenPx(): number {
  return GOD_BLIND_HUG_MARGIN_BASE_SCREEN * camera.zoom;
}

function godBlindZoneBorderScreenPx(): number {
  return GOD_BLIND_BORDER_BASE_SCREEN * camera.zoom;
}

function getBoardWorldExtentsForGodBlind(): {
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  halfSpanX: number;
  halfSpanY: number;
} {
  const allHexes = grid.allHexes();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hex of allHexes) {
    const p = layout.hexToPixel(hex);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    cx,
    cy,
    minX,
    maxX,
    minY,
    maxY,
    halfSpanX: (maxX - minX) / 2,
    halfSpanY: (maxY - minY) / 2,
  };
}

function godTableCardRotRad(): number {
  return ((GOD_TABLE_CARD_ROT_CW_DEG + godTableCardOppositeSeatFixDeg()) * Math.PI) / 180;
}

/** Экранный bbox карты богов в мировой точке — как на канвасе (поворот + зум). */
function godTableCardScreenAabb(worldCenter: { x: number; y: number }): {
  minSX: number;
  minSY: number;
  maxSX: number;
  maxSY: number;
} {
  const hw = GOD_TABLE_CARD_HW;
  const hh = GOD_TABLE_CARD_HH;
  const C = godTableCardRotRad();
  const locals = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  let minSX = Infinity;
  let minSY = Infinity;
  let maxSX = -Infinity;
  let maxSY = -Infinity;
  for (const lc of locals) {
    const wx = worldCenter.x + lc.x * Math.cos(C) - lc.y * Math.sin(C);
    const wy = worldCenter.y + lc.x * Math.sin(C) + lc.y * Math.cos(C);
    const s = boardWorldToScreen({ x: wx, y: wy });
    minSX = Math.min(minSX, s.x);
    minSY = Math.min(minSY, s.y);
    maxSX = Math.max(maxSX, s.x);
    maxSY = Math.max(maxSY, s.y);
  }
  return { minSX, minSY, maxSX, maxSY };
}

function getGodBlindFieldEdgeMidAndOutward(slot: PlayerSlot): {
  best: { x: number; y: number };
  nx: number;
  ny: number;
} {
  const mine = effectiveMyGodSlot();
  const preferMaxScreenY = slot === mine;
  const ext = getBoardWorldExtentsForGodBlind();
  const edgeMids = [
    { x: ext.cx, y: ext.maxY },
    { x: ext.cx, y: ext.minY },
    { x: ext.minX, y: ext.cy },
    { x: ext.maxX, y: ext.cy },
  ];
  let best = edgeMids[0]!;
  let bestSy = boardWorldToScreen(best).y;
  for (const p of edgeMids) {
    const sy = boardWorldToScreen(p).y;
    const better = preferMaxScreenY ? sy > bestSy : sy < bestSy;
    if (better) {
      best = p;
      bestSy = sy;
    }
  }
  const dx = best.x - ext.cx;
  const dy = best.y - ext.cy;
  const len = Math.hypot(dx, dy) || 1;
  return { best, nx: dx / len, ny: dy / len };
}

/** Якорь ряда у края поля; касательная к ряду в мире: (tx, ty). */
function getGodBlindRowFrameWorld(slot: PlayerSlot): {
  anchor: { x: number; y: number };
  tx: number;
  ty: number;
} {
  const { best, nx, ny } = getGodBlindFieldEdgeMidAndOutward(slot);
  const pushOut = GOD_BLIND_ZONE_GAP_FROM_BOARD + GOD_TABLE_CARD_HH;
  return {
    anchor: { x: best.x + nx * pushOut, y: best.y + ny * pushOut },
    tx: -ny,
    ty: nx,
  };
}

function godBlindCardCountForSlot(slot: PlayerSlot): number {
  const p = godPiles[slot];
  return p.blindCardIds.length > 0 ? p.blindCardIds.length : p.remoteBlindCount;
}

function computeBlindZoneLayoutForSlot(slot: PlayerSlot): GodBlindZoneLayout {
  const n = godBlindCardCountForSlot(slot);
  const { anchor: anchorW } = getGodBlindRowFrameWorld(slot);
  const abb = godTableCardScreenAabb(anchorW);
  const Ws = abb.maxSX - abb.minSX;
  const Hs = abb.maxSY - abb.minSY;

  const anchorS = boardWorldToScreen(anchorW);
  /** Ряд в экране — строго по горизонтали (иначе проекция касательной даёт «лестницу»). */

  const cardsAbs: Array<{ left: number; top: number; width: number; height: number }> = [];
  const gapPx = Math.max(0, Math.round(godBlindCardGapScreenPx()));
  const step = Ws + gapPx;

  if (n === 0) {
    cardsAbs.push({
      left: anchorS.x - Ws / 2,
      top: anchorS.y - Hs / 2,
      width: Ws,
      height: Hs,
    });
  } else {
    const rowY = anchorS.y;
    for (let i = 0; i < n; i++) {
      // Заполнение слепой зоны: левый слот фиксирован, новые карты растут вправо.
      // Используем экранное +X, чтобы направление было стабильным независимо от ориентации поля.
      const cx = anchorS.x + i * step;
      const cy = rowY;
      cardsAbs.push({ left: cx - Ws / 2, top: cy - Hs / 2, width: Ws, height: Hs });
    }
  }

  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const c of cardsAbs) {
    minL = Math.min(minL, c.left);
    minT = Math.min(minT, c.top);
    maxR = Math.max(maxR, c.left + c.width);
    maxB = Math.max(maxB, c.top + c.height);
  }

  const m = Math.max(0, Math.round(godBlindHugMarginScreenPx()));
  const b = Math.max(0, Math.round(godBlindZoneBorderScreenPx()));
  const container = {
    left: minL - m - b,
    top: minT - m - b,
    width: maxR - minL + 2 * (m + b),
    height: maxB - minT + 2 * (m + b),
  };

  const cards = cardsAbs.map((c) => ({
    left: c.left - container.left,
    top: c.top - container.top,
    width: c.width,
    height: c.height,
  }));

  return { container, cards, borderScreenPx: b, zoom: camera.zoom };
}

function godBlindZoneContainsWorldForSlot(
  w: { x: number; y: number },
  slot: PlayerSlot,
): boolean {
  const ps = boardWorldToScreen(w);
  const layout = computeBlindZoneLayoutForSlot(slot);
  for (const c of layout.cards) {
    const left = c.left + layout.container.left;
    const top = c.top + layout.container.top;
    if (ps.x >= left && ps.x <= left + c.width && ps.y >= top && ps.y <= top + c.height) {
      return true;
    }
  }
  return false;
}

// ── Renderer ───────────────────────────────────────────────────

const renderConfig = {
  ...defaultRenderConfig,
  showCoordinates: false,
  /** Логика гексов без отрисовки тонких граней; визуальная сетка — `cells.svg` поверх кадра. */
  showGrid: false,
  defaultHexFillColor: 'rgba(0, 0, 0, 0)',
  backgroundImageSrc: '/greenfield.png',
  cellsSvgOverlaySrc: `/cellscontrast.svg?${CELLS_SVG_CACHE_KEY}`,
  backgroundImageOpacity: 1,
  /**
   * `contain` — вписать картинку в рамку поля без перекоса; `cover` — на всю рамку с обрезкой по краям.
   * Размер: клавиши [ ] (масштаб одинаково по осям), Shift — крупнее шаг.
   */
  backgroundImageFit: 'contain' as const,
  backgroundImageOffsetX: FIELD_BG_PRESET.backgroundImageOffsetX,
  backgroundImageOffsetY: FIELD_BG_PRESET.backgroundImageOffsetY,
  backgroundImageScale: FIELD_BG_PRESET.backgroundImageScale,
  backgroundImageRotationDeg: FIELD_BG_PRESET.backgroundImageRotationDeg,
  hexonBorderWidth: 0,
  boardRotationDeg: BOARD_ROTATION_DEG,
};

const renderer = new Renderer(
  canvas,
  layout,
  grid,
  camera,
  renderConfig,
);

// ── Highlighted hexon + unit ───────────────────────────────────

type Unit = {
  position: Hex;
  /** If set, unit is off-board and renders at this world position instead. */
  offBoardWorld?: Point;
  walk: number;
  run: number;
  /** Facing in degrees (0 = east, CCW positive). */
  rotationDeg: number;
  health: number;
  /** Board activation dot: true = yellow (active). */
  activated?: boolean;
  /** Active effect markers shown on the miniature. */
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  /** Who placed this roster unit in multiplayer (`PlayerSlot`); omitted in solo. */
  armyOwnerPlayerSlot?: PlayerSlot;
  /** Орда брумгаров: голод / нейтраль / разгул (клик по цветному кругу циклически меняет). */
  broomgarHungerPhase?: BroomgarHungerPhase;
};

/** Demo board minis — пусто при пустом каталоге; юниты ставятся из панели армии. */
const units: Unit[] = [];
let selectedUnitIndex: number | null = null;
let openHealthControlsUnitIndex: number | null = null;
let terrains: Hex[] = [new Hex(8, -2)];
/** Ether vortexes — same hexon footprint as terrain; domain tint + crystal count on canvas. */
let etherVortexes: EtherVortexState[] = [
  { center: new Hex(11, 4), etherCrystals: 0, domain: null, rotationDeg: 0 },
];
const etherVortexMenu = new EtherVortexContextMenu();
const effectMarkerMenu = new EffectMarkerMenu();
const etherVortexCrystalPopover = new EtherVortexCrystalPopover();
let selectedTerrainIndex: number | null = null;
let selectedEtherVortexIndex: number | null = null;
/** Parallel array: off-board world positions for terrain hexons. */
let terrainOffBoardWorlds: (Point | undefined)[] = terrains.map(() => undefined);
let terrainRotationDegs: number[] = terrains.map(() => 0);
/** Show selected piece card + move ranges after double-click (2nd mousedown of a double-click). */
let showSelectedDetails = false;
type SelectedEntity =
  | { kind: 'small'; index: number }
  | { kind: 'big'; index: number }
  | { kind: 'large'; index: number }
  | { kind: 'huge'; index: number }
  | { kind: 'terrain'; index: number }
  | { kind: 'etherVortex'; index: number }
  | { kind: 'godTable'; index: number }
  | { kind: 'inventoryTable'; index: number }
  | null;

type ClipboardEntity =
  | { kind: 'small'; unit: Unit; card: UnitCardData }
  | { kind: 'big'; unit: BigMini; card: UnitCardData }
  | { kind: 'large'; unit: LargeMini; card: UnitCardData }
  | { kind: 'huge'; unit: HugeMini; card: UnitCardData }
  | { kind: 'terrain'; center: Hex; rotationDeg: number }
  | { kind: 'etherVortex'; state: EtherVortexState }
  | null;

let clipboardEntity: ClipboardEntity = null;
let lastPasteOffsetStep = 0;

// ── Big miniatures (hexon-sized units) ─────────────────────────

type BigMini = {
  center: Hex;
  /** If set, miniature is off-board at this world position. */
  offBoardWorld?: Point;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  /** Active effect markers shown on the miniature. */
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: BroomgarHungerPhase;
};

const bigMiniatures: BigMini[] = [];
let selectedBigMiniIndex: number | null = null;
let openHealthControlsBigMiniIndex: number | null = null;

// ── Large miniatures (3-hex triangle units) ───────────────────

type LargeMini = {
  anchor: Hex;
  offBoardWorld?: Point;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: BroomgarHungerPhase;
};

function largeMiniFootprint(m: Pick<LargeMini, 'anchor' | 'rotationDeg'>): Hex[] {
  return largeTriangleCellsOriented(m.anchor, m.rotationDeg);
}

/** `rotationDeg` (multiple of 60) such that oriented triangle equals `footprintKeys`, or null. */
function largeMiniRotationMatchingFootprint(anchor: Hex, footprintKeys: Set<string>): number | null {
  for (let k = 0; k < 6; k++) {
    const deg = k * 60;
    const cells = largeTriangleCellsOriented(anchor, deg);
    const keys = new Set(cells.map((c) => c.key));
    if (keys.size === footprintKeys.size && [...keys].every((key) => footprintKeys.has(key))) return deg;
  }
  return null;
}

const largeMiniatures: LargeMini[] = [];
let selectedLargeMiniIndex: number | null = null;
let openHealthControlsLargeMiniIndex: number | null = null;

// ── Huge miniatures (3-hexon triangle units) ──────────────────

type HugeMini = {
  anchor: Hex;
  offBoardWorld?: Point;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
  activated?: boolean;
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
  armyOwnerPlayerSlot?: PlayerSlot;
  broomgarHungerPhase?: BroomgarHungerPhase;
  /** Nudge of miniature art inside the clip (layout units, same frame as path after centering on bbox). */
  spriteOffsetLocal?: { x: number; y: number };
  /** Rotation of art inside the clip (degrees), around bbox center after seat fix. */
  spriteRotationDeg?: number;
};

function hugeMiniFootprintCenters(m: Pick<HugeMini, 'anchor' | 'rotationDeg'>): Hex[] {
  return hugeTriangleHexonCentersOriented(m.anchor, m.rotationDeg);
}

function hugeMiniAllCells(m: Pick<HugeMini, 'anchor' | 'rotationDeg'>): Hex[] {
  return hugeTriangleAllCellsOriented(m.anchor, m.rotationDeg);
}

/** Defaults from catalog `card` when placing a huge miniature. */
function hugeSpriteAlignFromCard(card: UnitCardData, unitId?: string): {
  spriteOffsetLocal?: { x: number; y: number };
  spriteRotationDeg?: number;
} {
  if (card.size !== 'huge') return {};
  if (typeof unitId === 'string' && unitId.length > 0 && HUGE_SPRITE_ALIGN_OVERRIDES[unitId]) {
    const o = HUGE_SPRITE_ALIGN_OVERRIDES[unitId]!;
    return {
      spriteOffsetLocal: { x: o.spriteOffsetLocal.x, y: o.spriteOffsetLocal.y },
      spriteRotationDeg: o.spriteRotationDeg,
    };
  }
  const mergedCatalogCard =
    typeof unitId === 'string' && unitId.length > 0 ? getCatalogUnit(unitId)?.card : undefined;
  const staticCatalogCard =
    typeof unitId === 'string' && unitId.length > 0 ? CATALOG_UNITS[unitId]?.card : undefined;
  const candidates: UnitCardData[] = [card];
  if (mergedCatalogCard) candidates.push(mergedCatalogCard);
  if (staticCatalogCard) candidates.push(staticCatalogCard);
  const out: {
    spriteOffsetLocal?: { x: number; y: number };
    spriteRotationDeg?: number;
  } = {};
  for (const c of candidates) {
    if (c.hugeSpriteOffsetLocal) {
      const { x, y } = c.hugeSpriteOffsetLocal;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        out.spriteOffsetLocal = { x, y };
        break;
      }
    }
  }
  for (const c of candidates) {
    if (typeof c.hugeSpriteRotationDeg === 'number' && Number.isFinite(c.hugeSpriteRotationDeg)) {
      out.spriteRotationDeg = c.hugeSpriteRotationDeg;
      break;
    }
  }
  return out;
}

const hugeMiniatures: HugeMini[] = [];
let selectedHugeMiniIndex: number | null = null;
let openHealthControlsHugeMiniIndex: number | null = null;

/** Army Builder panel (assigned after `DiceRoller` wiring). */
let armyBuilderPanel!: ArmyBuilderPanel;
/** Touch: tap row in army panel → next tap on canvas spawns (see `onTouchArmPayload`). */
let pendingTouchArmyPlaceRaw: string | null = null;

/** Alt + hover: preview ranges. Shift + hover: show floating card. */
let altKeyHeld = false;
let shiftKeyHeld = false;
/** Touch / on-screen: hold Alt-like range preview without a keyboard. */
let touchAltSticky = false;
/** Touch / on-screen: hold Shift-like attack preview without a keyboard. */
let touchShiftSticky = false;

function altModActive(): boolean {
  return altKeyHeld || touchAltSticky;
}
function shiftModActive(): boolean {
  return shiftKeyHeld || touchShiftSticky;
}

function setTouchAltSticky(on: boolean): void {
  touchAltSticky = on;
  refreshAltHoverTarget(hexUnderGlobalPointer() ?? hoveredHexUnderPointer);
  scheduleRender();
}
function setTouchShiftSticky(on: boolean): void {
  touchShiftSticky = on;
  refreshShiftHoverTarget(hexUnderGlobalPointer() ?? hoveredHexUnderPointer);
  scheduleRender();
}
type AltHoverTarget =
  | { kind: 'small'; index: number }
  | { kind: 'big'; index: number }
  | { kind: 'large'; index: number }
  | { kind: 'huge'; index: number };
let altHoverTarget: AltHoverTarget | null = null;
let shiftHoverTarget: AltHoverTarget | null = null;
/** Attack row hovered on unit card → board highlights attack range. */
let hoveredAttack: AttackAbility | null = null;
let pointerScreenX = 0;
let pointerScreenY = 0;
let lastHoverCardSig: string | null = null;

// ── Unit card data (parallel to units / big / large / huge; filled when placing from catalog) ──

const unitCardData: UnitCardData[] = [];

const bigMiniCardData: UnitCardData[] = [];
const largeMiniCardData: UnitCardData[] = [];
const hugeMiniCardData: UnitCardData[] = [];

const unitCard = new UnitCard(document.body);
const diceRoller = new DiceRoller(document.body);

unitCard.onAttackHover = (attack: AttackAbility | null) => {
  hoveredAttack = attack;
  updateAttackRangeHighlights();
  renderer.render();
};

/** Pinned unit card (double-click): dismiss when clicking anywhere except the board canvas or the card itself. */
document.addEventListener('mousedown', (e: MouseEvent) => {
  if (e.button !== 0) return;
  if (!showSelectedDetails) return;
  if (!(e.target instanceof Node)) return;
  if (canvas.contains(e.target)) return;
  if (unitCard.containsEventTarget(e.target)) return;
  if (diceRoller.containsEventTarget(e.target)) return;
  unitDragPendingIndex = null;
  bigMiniDragPendingIndex = null;
  largeMiniDragPendingIndex = null;
  hugeMiniDragPendingIndex = null;
  terrainDragPendingIndex = null;
  etherVortexDragPendingIndex = null;
  openHealthControlsUnitIndex = null;
  openHealthControlsBigMiniIndex = null;
  openHealthControlsLargeMiniIndex = null;
  openHealthControlsHugeMiniIndex = null;
  clearSelection();
  updateMovementHighlights();
  updateBigMiniMovementHighlights();
  updateLargeMiniMovementHighlights();
  updateHugeMiniMovementHighlights();
  unitCard.setPassthrough(false);
  scheduleRender();
});

/** Which unit the visible card refers to (matches updateUnitCard priority). */
function cardUnitForAttackHighlight(): AltHoverTarget | null {
  if (shiftModActive() && shiftHoverTarget !== null) return shiftHoverTarget;
  if (selectedUnitIndex !== null && showSelectedDetails) {
    return { kind: 'small', index: selectedUnitIndex };
  }
  if (selectedBigMiniIndex !== null && showSelectedDetails) {
    return { kind: 'big', index: selectedBigMiniIndex };
  }
  if (selectedLargeMiniIndex !== null && showSelectedDetails) {
    return { kind: 'large', index: selectedLargeMiniIndex };
  }
  if (selectedHugeMiniIndex !== null && showSelectedDetails) {
    return { kind: 'huge', index: selectedHugeMiniIndex };
  }
  return null;
}

function computeSmallAttackHexes(from: Hex, attackRange: number): Hex[] {
  const r = Math.max(0, attackRange);
  if (r === 0) return [];
  const out: Hex[] = [];
  for (const hex of grid.allHexes()) {
    const d = from.distanceTo(hex);
    if (d >= 1 && d <= r) out.push(hex);
  }
  return out;
}

/** BFS in hexon-center space (same steps as big-mini attack / movement). */
function computeHexonReachFromCenter(start: Hex, attackRange: number): Hex[] {
  const r = Math.max(0, attackRange);
  if (r === 0) return [];
  const BIG_HEX_DIRECTIONS = [
    new Hex(3, -1),
    new Hex(1, 2),
    new Hex(-2, 3),
    new Hex(-3, 1),
    new Hex(-1, -2),
    new Hex(2, -3),
  ];
  const visited = new Map<string, number>([[start.key, 0]]);
  const queue: Hex[] = [start];
  const hexonCenterKeys = new Set(allHexonCenters.map((center) => center.key));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = visited.get(current.key) ?? 0;
    if (currentDistance >= r) continue;

    for (const direction of BIG_HEX_DIRECTIONS) {
      const next = current.add(direction);
      if (!hexonCenterKeys.has(next.key)) continue;
      if (visited.has(next.key)) continue;
      visited.set(next.key, currentDistance + 1);
      queue.push(next);
    }
  }

  const out: Hex[] = [];
  for (const center of allHexonCenters) {
    const distance = visited.get(center.key);
    if (!distance || distance <= 0) continue;
    if (distance <= r) out.push(center);
  }
  return out;
}

function computeBigMiniAttackHexonCenters(bigIndex: number, attackRange: number): Hex[] {
  return computeHexonReachFromCenter(bigMiniatures[bigIndex].center, attackRange);
}

function attackHighlightUsesHexonDistance(attk: AttackAbility): boolean {
  return attk.attackRangeUnit === 'hexon';
}

function computeHugeMiniAttackHexonCenters(hugeIndex: number, attackRange: number): Hex[] {
  const r = Math.max(0, attackRange);
  if (r === 0) return [];
  const selected = hugeMiniatures[hugeIndex];
  const hexonCenterKeys = new Set(allHexonCenters.map((c) => c.key));
  const footprintCenters = hugeMiniFootprintCenters(selected);
  const visited = new Map<string, number>();
  const queue: Hex[] = [];
  for (const fc of footprintCenters) {
    visited.set(fc.key, 0);
    queue.push(fc);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const cd = visited.get(current.key) ?? 0;
    if (cd >= r) continue;
    for (const dir of BIG_HEX_DIRECTIONS) {
      const next = current.add(dir);
      if (!hexonCenterKeys.has(next.key)) continue;
      if (visited.has(next.key)) continue;
      visited.set(next.key, cd + 1);
      queue.push(next);
    }
  }
  const footprintKeys = new Set(footprintCenters.map((c) => c.key));
  const out: Hex[] = [];
  for (const center of allHexonCenters) {
    if (footprintKeys.has(center.key)) continue;
    const distance = visited.get(center.key);
    if (distance !== undefined && distance > 0 && distance <= r) out.push(center);
  }
  return out;
}

function updateAttackRangeHighlights(): void {
  const atk = hoveredAttack;
  const who = cardUnitForAttackHighlight();
  if (!atk || !who) {
    renderer.setAttackRangeOverlay([], []);
    return;
  }
  if (who.kind === 'small') {
    const from = units[who.index].position;
    if (attackHighlightUsesHexonDistance(atk)) {
      const start = hexonCenterOwningSmallHex(from);
      if (!start) {
        renderer.setAttackRangeOverlay([], []);
        return;
      }
      renderer.setAttackRangeOverlay([], computeHexonReachFromCenter(start, atk.range));
    } else {
      renderer.setAttackRangeOverlay(computeSmallAttackHexes(from, atk.range), []);
    }
  } else if (who.kind === 'big') {
    renderer.setAttackRangeOverlay([], computeBigMiniAttackHexonCenters(who.index, atk.range));
  } else if (who.kind === 'large') {
    const m = largeMiniatures[who.index];
    const cells = largeMiniFootprint(m);
    const footprintKeys = new Set(cells.map((c) => c.key));
    if (attackHighlightUsesHexonDistance(atk)) {
      const startCenters = new Set<string>();
      for (const cell of cells) {
        const hc = hexonCenterOwningSmallHex(cell);
        if (hc) startCenters.add(hc.key);
      }
      const allHexonKeys = new Set<string>();
      for (const key of startCenters) {
        const [q, r] = key.split(',').map(Number);
        for (const c of computeHexonReachFromCenter(new Hex(q, r), atk.range)) {
          allHexonKeys.add(c.key);
        }
      }
      const outHexons: Hex[] = [];
      for (const k of allHexonKeys) {
        const [q, r] = k.split(',').map(Number);
        outHexons.push(new Hex(q, r));
      }
      renderer.setAttackRangeOverlay([], outHexons);
    } else {
      const allHexes = new Set<string>();
      for (const cell of cells) {
        for (const h of computeSmallAttackHexes(cell, atk.range)) {
          allHexes.add(h.key);
        }
      }
      const result: Hex[] = [];
      for (const key of allHexes) {
        if (!footprintKeys.has(key)) {
          const [q, r] = key.split(',').map(Number);
          result.push(new Hex(q, r));
        }
      }
      renderer.setAttackRangeOverlay(result, []);
    }
  } else if (who.kind === 'huge') {
    renderer.setAttackRangeOverlay([], computeHugeMiniAttackHexonCenters(who.index, atk.range));
  }
}

function resolveCatalogUnitIdForCard(data: UnitCardData, pieceCatalogId?: string): string | undefined {
  if (pieceCatalogId) return pieceCatalogId;
  if (data.catalogUnitId) return data.catalogUnitId;
  for (const [unitId, def] of Object.entries(CATALOG_UNITS)) {
    if (def.card.name === data.name) return unitId;
  }
  return undefined;
}

function unitCardOpts(data: UnitCardData, pieceCatalogId?: string): UnitCardShowOptions | undefined {
  const id = resolveCatalogUnitIdForCard(data, pieceCatalogId);
  if (id && !data.catalogUnitId) data.catalogUnitId = id;
  return id ? { catalogUnitId: id } : undefined;
}

function updateUnitCard(): void {
  if (!shiftModActive()) {
    lastHoverCardSig = null;
  }

  if (
    shiftModActive() &&
    shiftHoverTarget !== null &&
    !armyBuilderPanel.isScreenPointOverPanel(pointerScreenX, pointerScreenY)
  ) {
    const sig = `${shiftHoverTarget.kind}-${shiftHoverTarget.index}`;
    if (shiftHoverTarget.kind === 'small') {
      const u = units[shiftHoverTarget.index];
      const data = unitCardData[shiftHoverTarget.index];
      if (data) {
        data.health = u.health;
        data.catalogUnitId = u.catalogUnitId ?? data.catalogUnitId;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY }, unitCardOpts(data, u.catalogUnitId));
        return;
      }
    } else if (shiftHoverTarget.kind === 'big') {
      const m = bigMiniatures[shiftHoverTarget.index];
      const data = bigMiniCardData[shiftHoverTarget.index];
      if (data) {
        data.health = m.health;
        data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY }, unitCardOpts(data, m.catalogUnitId));
        return;
      }
    } else if (shiftHoverTarget.kind === 'large') {
      const m = largeMiniatures[shiftHoverTarget.index];
      const data = largeMiniCardData[shiftHoverTarget.index];
      if (data) {
        data.health = m.health;
        data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY }, unitCardOpts(data, m.catalogUnitId));
        return;
      }
    } else if (shiftHoverTarget.kind === 'huge') {
      const m = hugeMiniatures[shiftHoverTarget.index];
      const data = hugeMiniCardData[shiftHoverTarget.index];
      if (data) {
        data.health = m.health;
        data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY }, unitCardOpts(data, m.catalogUnitId));
        return;
      }
    }
  }

  if (selectedUnitIndex !== null) {
    if (!showSelectedDetails) {
      unitCard.hide();
      return;
    }
    const u = units[selectedUnitIndex];
    const data = unitCardData[selectedUnitIndex];
    if (data) {
      // Sync live stats
      data.health = u.health;
      data.catalogUnitId = u.catalogUnitId ?? data.catalogUnitId;
      unitCard.show(data, undefined, unitCardOpts(data, u.catalogUnitId));
      return;
    }
  }
  if (selectedBigMiniIndex !== null) {
    if (!showSelectedDetails) {
      unitCard.hide();
      return;
    }
    const m = bigMiniatures[selectedBigMiniIndex];
    const data = bigMiniCardData[selectedBigMiniIndex];
    if (data) {
      data.health = m.health;
      data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
      unitCard.show(data, undefined, unitCardOpts(data, m.catalogUnitId));
      return;
    }
  }
  if (selectedLargeMiniIndex !== null) {
    if (!showSelectedDetails) {
      unitCard.hide();
      return;
    }
    const m = largeMiniatures[selectedLargeMiniIndex];
    const data = largeMiniCardData[selectedLargeMiniIndex];
    if (data) {
      data.health = m.health;
      data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
      unitCard.show(data, undefined, unitCardOpts(data, m.catalogUnitId));
      return;
    }
  }
  if (selectedHugeMiniIndex !== null) {
    if (!showSelectedDetails) {
      unitCard.hide();
      return;
    }
    const m = hugeMiniatures[selectedHugeMiniIndex];
    const data = hugeMiniCardData[selectedHugeMiniIndex];
    if (data) {
      data.health = m.health;
      data.catalogUnitId = m.catalogUnitId ?? data.catalogUnitId;
      unitCard.show(data, undefined, unitCardOpts(data, m.catalogUnitId));
      return;
    }
  }
  unitCard.hide();
}

function getSelectedEntity(): SelectedEntity {
  if (selectedUnitIndex !== null) return { kind: 'small', index: selectedUnitIndex };
  if (selectedBigMiniIndex !== null) return { kind: 'big', index: selectedBigMiniIndex };
  if (selectedLargeMiniIndex !== null) return { kind: 'large', index: selectedLargeMiniIndex };
  if (selectedHugeMiniIndex !== null) return { kind: 'huge', index: selectedHugeMiniIndex };
  if (selectedTerrainIndex !== null) return { kind: 'terrain', index: selectedTerrainIndex };
  if (selectedEtherVortexIndex !== null) return { kind: 'etherVortex', index: selectedEtherVortexIndex };
  if (selectedGodTablePieceIndex !== null) return { kind: 'godTable', index: selectedGodTablePieceIndex };
  if (selectedInventoryTablePieceIndex !== null)
    return { kind: 'inventoryTable', index: selectedInventoryTablePieceIndex };
  return null;
}

function clearSelection(): void {
  selectedUnitIndex = null;
  selectedBigMiniIndex = null;
  selectedLargeMiniIndex = null;
  selectedHugeMiniIndex = null;
  selectedTerrainIndex = null;
  selectedEtherVortexIndex = null;
  selectedGodTablePieceIndex = null;
  selectedInventoryTablePieceIndex = null;
  showSelectedDetails = false;
}

/** После дропа миниатюры — снять выделение и обновить подсветки движения. */
function clearSelectionAfterMiniatureDragEnd(): void {
  clearSelection();
  updateMovementHighlights();
  updateBigMiniMovementHighlights();
  updateLargeMiniMovementHighlights();
  updateHugeMiniMovementHighlights();
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function rebuildHexons(): void {
  renderer.setHighlightedHexonCenter(new Hex(2, 0));
}
rebuildHexons();
renderer.setUnits(
  units.map((unit) => unit.position),
  selectedUnitIndex,
  units.map((unit) => unit.offBoardWorld),
);
renderer.setTerrain(terrains, null, false, null, null, selectedTerrainIndex, terrainOffBoardWorlds);
renderer.setEtherVortexes(etherVortexes, selectedEtherVortexIndex);
renderer.setBigMiniatures(
  bigMiniatures.map((m) => m.center),
  null,
  null,
  null,
  bigMiniOffBoards(),
);
renderer.setBigMiniMovement(null, [], []);
renderer.setLargeMiniatures(
  largeMiniatures.map((m) => m.anchor),
  null,
  null,
  null,
  largeMiniatures.map((m) => m.offBoardWorld),
);
renderer.setLargeMiniMovement(null, [], []);
renderer.setHugeMiniatures(
  hugeMiniatures.map((m) => m.anchor),
  null,
  null,
  null,
  hugeMiniatures.map((m) => m.offBoardWorld),
);
renderer.setHugeMiniMovement(null, [], []);

/** Helper: get off-board world positions for big miniatures. */
function bigMiniOffBoards(): (Point | undefined)[] {
  return bigMiniatures.map((m) => m.offBoardWorld);
}

/** Push current effect markers from data model into renderer. */
function syncEffectMarkersToRenderer(): void {
  renderer.setUnitEffectMarkers(units.map((u) => [...u.effectMarkers]));
  renderer.setBigMiniEffectMarkers(bigMiniatures.map((m) => [...m.effectMarkers]));
  renderer.setLargeMiniEffectMarkers(largeMiniatures.map((m) => [...m.effectMarkers]));
  renderer.setHugeMiniEffectMarkers(hugeMiniatures.map((m) => [...m.effectMarkers]));
}

function updateMovementHighlights(): void {
  // Must keep indices aligned with `units[]` (sprites, drag, selection) — do not filter.
  renderer.setUnits(
    units.map((unit) => unit.position),
    selectedUnitIndex,
    units.map((unit) => unit.offBoardWorld),
  );

  const walkReachable: Hex[] = [];
  const runReachable: Hex[] = [];
  let anchorHex: Hex | null = null;

  const addUnitRanges = (unit: Unit): boolean => {
    if (!grid.has(unit.position)) return false;
    for (const hex of grid.allHexes()) {
      const distance = unit.position.distanceTo(hex);
      if (distance === 0) continue;
      if (distance <= unit.walk) {
        walkReachable.push(hex);
      } else if (distance <= unit.run) {
        runReachable.push(hex);
      }
    }
    return true;
  };

  const rangeSourceIndex =
    draggingUnitIndex !== null
      ? draggingUnitIndex
      : (showSelectedDetails ? selectedUnitIndex : null);

  if (rangeSourceIndex !== null) {
    const selectedUnit = units[rangeSourceIndex];
    if (addUnitRanges(selectedUnit)) {
      anchorHex = selectedUnit.position;
    }
  }

  if (altModActive() && altHoverTarget?.kind === 'small') {
    const hoverUnit = units[altHoverTarget.index];
    if (addUnitRanges(hoverUnit) && anchorHex === null) {
      anchorHex = hoverUnit.position;
    }
  }

  renderer.setMovementHighlights(
    anchorHex,
    walkReachable,
    runReachable,
  );
}

function pushPieceRotationsToRenderer(): void {
  renderer.setUnitSpriteSources(
    unitCardData.map(
      (data, index) =>
        unitMiniatureImageSrc(data) ?? SMALL_UNIT_SPRITES[index % SMALL_UNIT_SPRITES.length] ?? null,
    ),
  );
  renderer.setBigMiniSpriteSources(
    bigMiniCardData.map((d) => unitMiniatureImageSrc(d) ?? BIG_UNIT_SPRITE),
  );
  renderer.setUnitRotations(units.map((u) => u.rotationDeg));
  renderer.setUnitHealth(units.map((u) => u.health), openHealthControlsUnitIndex);
  renderer.setBigMiniHealth(bigMiniatures.map((m) => m.health), openHealthControlsBigMiniIndex);
  renderer.setTerrainRotations(terrainRotationDegs);
  renderer.setBigMiniRotations(bigMiniatures.map((m) => m.rotationDeg));
  // Large minis
  renderer.setLargeMiniRotations(largeMiniatures.map((m) => m.rotationDeg));
  renderer.setLargeMiniHealth(largeMiniatures.map((m) => m.health), openHealthControlsLargeMiniIndex);
  renderer.setLargeMiniSpriteSources(largeMiniCardData.map((d) => unitMiniatureImageSrc(d) ?? LARGE_UNIT_SPRITE));
  // Huge minis
  renderer.setHugeMiniRotations(hugeMiniatures.map((m) => m.rotationDeg));
  renderer.setHugeMiniHealth(hugeMiniatures.map((m) => m.health), openHealthControlsHugeMiniIndex);
  renderer.setHugeMiniSpriteSources(
    hugeMiniCardData.map((d) => unitMiniatureImageSrc(d) ?? LARGE_UNIT_SPRITE),
  );
  renderer.setHugeMiniSpriteOffsets(
    hugeMiniatures.map((m) => m.spriteOffsetLocal ?? { x: 0, y: 0 }),
  );
  renderer.setHugeMiniSpriteLocalRotations(
    hugeMiniatures.map((m) => m.spriteRotationDeg ?? 0),
  );
  renderer.setUnitActivated(units.map((u) => u.activated !== false));
  renderer.setBigMiniActivated(bigMiniatures.map((m) => m.activated !== false));
  renderer.setLargeMiniActivated(largeMiniatures.map((m) => m.activated !== false));
  renderer.setHugeMiniActivated(hugeMiniatures.map((m) => m.activated !== false));
  renderer.setUnitBroomgarHungerPhase(
    units.map((u) => (u.broomgarHungerPhase !== undefined ? u.broomgarHungerPhase : null)),
  );
  renderer.setBigMiniBroomgarHungerPhase(
    bigMiniatures.map((m) => (m.broomgarHungerPhase !== undefined ? m.broomgarHungerPhase : null)),
  );
  renderer.setLargeMiniBroomgarHungerPhase(
    largeMiniatures.map((m) => (m.broomgarHungerPhase !== undefined ? m.broomgarHungerPhase : null)),
  );
  renderer.setHugeMiniBroomgarHungerPhase(
    hugeMiniatures.map((m) => (m.broomgarHungerPhase !== undefined ? m.broomgarHungerPhase : null)),
  );
  // Effect markers live only in the model; push every frame with other piece state so
  // remote board snapshots and local toggles both show on canvas without opening the menu.
  syncEffectMarkersToRenderer();
}

/** Поворот выделенной фишки / ландшафта / вихря (Q/E и тач-панель). */
function rotateSelectedBoardPiece(deltaDeg: number): boolean {
  if (
    draggingUnitIndex !== null ||
    draggingBigMiniIndex !== null ||
    draggingLargeMiniIndex !== null ||
    draggingHugeMiniIndex !== null ||
    isDraggingTerrain ||
    isDraggingEtherVortex
  ) {
    return false;
  }
  const sel = getSelectedEntity();
  if (!sel || sel.kind === 'godTable' || sel.kind === 'inventoryTable') return false;

  switch (sel.kind) {
    case 'small': {
      const u = units[sel.index];
      if (!u) return false;
      u.rotationDeg += deltaDeg;
      return true;
    }
    case 'big': {
      const m = bigMiniatures[sel.index];
      if (!m) return false;
      m.rotationDeg += deltaDeg;
      return true;
    }
    case 'large': {
      const largeIdx = sel.index;
      const m = largeMiniatures[largeIdx];
      if (!m) return false;
      const hex = m.anchor;
      const step =
        Math.abs(deltaDeg) >= ELEMENT_ROT_STEP_FAST - 1
          ? LARGE_MINI_ROT_STEP_FAST
          : LARGE_MINI_ROT_STEP;
      const signed = deltaDeg > 0 ? step : -step;
      const prevAnchor = m.anchor;
      const prevRot = m.rotationDeg;
      const footprintKeys = new Set(largeMiniFootprint(m).map((c) => c.key));
      const pivotRot = largeMiniRotationMatchingFootprint(hex, footprintKeys);
      if (pivotRot === null) return false;
      m.anchor = hex;
      m.rotationDeg = pivotRot;
      m.rotationDeg = ((m.rotationDeg + signed) % 360 + 360) % 360;
      if (!canPlaceLargeMiniAt(m.anchor, largeIdx)) {
        m.anchor = prevAnchor;
        m.rotationDeg = prevRot;
        return false;
      }
      return true;
    }
    case 'huge':
      return applyHugeMiniRotation(sel.index, deltaDeg);
    case 'etherVortex': {
      const v = etherVortexes[sel.index];
      if (!v) return false;
      v.rotationDeg += deltaDeg;
      return true;
    }
    case 'terrain': {
      const ti = sel.index;
      if (ti < 0 || ti >= terrainRotationDegs.length) return false;
      terrainRotationDegs[ti] = (terrainRotationDegs[ti] ?? 0) + deltaDeg;
      return true;
    }
    default:
      return false;
  }
}

function updateBigMiniMovementHighlights(): void {
  /** Keep selection ring on selected big mini; walk/run can preview another one (Alt-hover). */
  const ringIndex = selectedBigMiniIndex;

  if (altModActive() && altHoverTarget?.kind === 'big') {
    const { walk, run } = computeBigMiniWalkRunCenters(altHoverTarget.index);
    renderer.setBigMiniMovement(ringIndex, walk, run);
    return;
  }
  if (altModActive() && altHoverTarget?.kind === 'small') {
    renderer.setBigMiniMovement(ringIndex, [], []);
    return;
  }

  if (selectedBigMiniIndex === null) {
    renderer.setBigMiniMovement(null, [], []);
    return;
  }

  const movementSourceIndex =
    draggingBigMiniIndex !== null
      ? draggingBigMiniIndex
      : (showSelectedDetails ? selectedBigMiniIndex : null);

  if (movementSourceIndex === null) {
    renderer.setBigMiniMovement(ringIndex, [], []);
    return;
  }

  const { walk, run } = computeBigMiniWalkRunCenters(movementSourceIndex);
  renderer.setBigMiniMovement(ringIndex, walk, run);
}

// ── Large mini movement highlights ────────────────────────────

function updateLargeMiniMovementHighlights(): void {
  const ringIndex = selectedLargeMiniIndex;
  if (selectedLargeMiniIndex === null && !(altModActive() && altHoverTarget?.kind === 'large')) {
    renderer.setLargeMiniMovement(null, [], []);
    return;
  }
  const sourceIndex =
    altModActive() && altHoverTarget?.kind === 'large'
      ? altHoverTarget.index
      : draggingLargeMiniIndex !== null
        ? draggingLargeMiniIndex
        : (showSelectedDetails ? selectedLargeMiniIndex : null);
  if (sourceIndex === null) {
    renderer.setLargeMiniMovement(ringIndex, [], []);
    return;
  }
  const m = largeMiniatures[sourceIndex];
  if (!grid.has(m.anchor)) {
    renderer.setLargeMiniMovement(ringIndex, [], []);
    return;
  }
  const footprint = largeMiniFootprint(m);
  const footprintKeys = new Set(footprint.map((c) => c.key));
  const walk: Hex[] = [];
  const run: Hex[] = [];
  for (const hex of grid.allHexes()) {
    if (footprintKeys.has(hex.key)) continue;
    let dMin = Infinity;
    for (const f of footprint) {
      const d = f.distanceTo(hex);
      if (d < dMin) dMin = d;
    }
    if (dMin <= m.walk) walk.push(hex);
    else if (dMin <= m.run) run.push(hex);
  }
  renderer.setLargeMiniMovement(ringIndex, walk, run);
}

// ── Huge mini movement highlights ─────────────────────────────

function computeHugeMiniWalkRunCenters(hugeIndex: number): { walk: Hex[]; run: Hex[] } {
  const selected = hugeMiniatures[hugeIndex];
  const maxRange = selected.run;
  const hexonCenterKeys = new Set(allHexonCenters.map((c) => c.key));
  const footprint = hugeMiniFootprintCenters(selected);
  const visited = new Map<string, number>();
  const queue: Hex[] = [];
  for (const fc of footprint) {
    if (!hexonCenterKeys.has(fc.key)) continue;
    if (visited.has(fc.key)) continue;
    visited.set(fc.key, 0);
    queue.push(fc);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const cd = visited.get(current.key) ?? 0;
    if (cd >= maxRange) continue;
    for (const dir of BIG_HEX_DIRECTIONS) {
      const next = current.add(dir);
      if (!hexonCenterKeys.has(next.key)) continue;
      if (visited.has(next.key)) continue;
      visited.set(next.key, cd + 1);
      queue.push(next);
    }
  }
  const footprintKeys = new Set(footprint.map((c) => c.key));
  const walkCenters: Hex[] = [];
  const runCenters: Hex[] = [];
  for (const center of allHexonCenters) {
    if (footprintKeys.has(center.key)) continue;
    const d = visited.get(center.key);
    if (d === undefined || d <= 0) continue;
    if (d <= selected.walk) walkCenters.push(center);
    if (d <= selected.run) runCenters.push(center);
  }
  return { walk: walkCenters, run: runCenters };
}

function updateHugeMiniMovementHighlights(): void {
  const ringIndex = selectedHugeMiniIndex;
  if (selectedHugeMiniIndex === null && !(altModActive() && altHoverTarget?.kind === 'huge')) {
    renderer.setHugeMiniMovement(null, [], []);
    return;
  }
  const sourceIndex =
    altModActive() && altHoverTarget?.kind === 'huge'
      ? altHoverTarget.index
      : draggingHugeMiniIndex !== null
        ? draggingHugeMiniIndex
        : (showSelectedDetails ? selectedHugeMiniIndex : null);
  if (sourceIndex === null) {
    renderer.setHugeMiniMovement(ringIndex, [], []);
    return;
  }
  const { walk, run } = computeHugeMiniWalkRunCenters(sourceIndex);
  renderer.setHugeMiniMovement(ringIndex, walk, run);
}

// ── Dice roller UI ─────────────────────────────────────────────

// Wire unit card → dice roller
unitCard.onDiceRequest = (req: DiceRequest) => {
  diceRoller.addDice(req.pool, req.source, {
    actionKey: req.actionKey,
    rollImmediately: req.rollImmediately,
  });
};

/** Открытые карты эфирного вихря (индексы в `EPHIRIUM_VORTEX_CARDS`), синхронизируются в MP через снимок стола. */
let ephiriumOpenSpriteIndices: number[] = [];

const ephiriumVortexUi = new EphiriumVortexUi(document.body, {
  requestDraw: () => {
    if (ephiriumOpenSpriteIndices.length >= 2) return;
    const n = EPHIRIUM_VORTEX_CARDS.length;
    ephiriumOpenSpriteIndices = [
      ...ephiriumOpenSpriteIndices,
      Math.floor(Math.random() * n),
    ];
    notifyBoardEditLocal();
    ephiriumVortexUi.applyOpenIndices(ephiriumOpenSpriteIndices);
  },
  requestCloseSlot: (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= ephiriumOpenSpriteIndices.length) return;
    ephiriumOpenSpriteIndices = ephiriumOpenSpriteIndices.filter((_, i) => i !== slotIndex);
    notifyBoardEditLocal();
    ephiriumVortexUi.applyOpenIndices(ephiriumOpenSpriteIndices);
  },
});

function effectiveMyGodSlot(): PlayerSlot {
  return localViewPlayerSlot ?? 0;
}

function effectiveOpponentGodSlot(): PlayerSlot {
  return effectiveMyGodSlot() === 0 ? 1 : 0;
}

function isGodDockInteractive(): boolean {
  if (isBoardMultiplayerSyncActive() && localViewPlayerSlot === null) return false;
  return true;
}

function refreshGodDock(): void {
  if (!godHandBlindDock) return;
  const my = effectiveMyGodSlot();
  const opp = effectiveOpponentGodSlot();
  const myP = godPiles[my];
  const oppP = godPiles[opp];
  const oppBlind =
    oppP.blindCardIds.length > 0 ? oppP.blindCardIds.length : oppP.remoteBlindCount;
  godHandBlindDock.refresh({
    interactive: isGodDockInteractive(),
    myBlindCardIds: [...myP.blindCardIds],
    opponentBlindCount: oppBlind,
  });
}

function serializedWireBlindCount(s: SerializedGodSlotV1): number {
  if (typeof s.blindCount === 'number') return s.blindCount;
  return s.blindHasCard === true ? 1 : 0;
}

function serializeGodSlotForCapture(slot: PlayerSlot): SerializedGodSlotV1 {
  const mp = isBoardMultiplayerSyncActive();
  const v = localViewPlayerSlot;
  const mine = !mp || v === null ? slot === 0 : v === slot;
  const p = godPiles[slot];

  if (mine) {
    return {
      discardIds: [...p.discardIds],
      deckCount: p.deckIds.length,
      deckIds: [...p.deckIds],
      handCount: p.handIds.length,
      handIds: [...p.handIds],
      blindCount: p.blindCardIds.length,
      blindCardIds: [...p.blindCardIds],
    };
  }

  const oppBlind =
    p.blindCardIds.length > 0 ? p.blindCardIds.length : p.remoteBlindCount;
  return {
    discardIds: [...p.discardIds],
    deckCount: p.deckIds.length > 0 ? p.deckIds.length : p.remoteDeckCount,
    handCount: p.handIds.length > 0 ? p.handIds.length : p.remoteHandCount,
    blindCount: oppBlind,
  };
}

function applySerializedGodSlot(slot: PlayerSlot, s: SerializedGodSlotV1): void {
  const mp = isBoardMultiplayerSyncActive();
  const v = localViewPlayerSlot;
  const imOwner = !mp || v === null ? slot === 0 : v === slot;
  const prev = clonePile(godPiles[slot]);

  if (imOwner) {
    const next: GodSlotPile = {
      ...EMPTY_GOD_PILE,
      discardIds: [...s.discardIds],
      remoteBlindCount: 0,
      remoteHandCount: 0,
      remoteDeckCount: 0,
    };
    next.handIds = s.handIds !== undefined ? [...s.handIds] : [...prev.handIds];
    next.deckIds = s.deckIds !== undefined ? [...s.deckIds] : [...prev.deckIds];

    if (s.blindCardIds !== undefined) {
      next.blindCardIds = [...s.blindCardIds];
    } else if (s.blindCardId !== undefined && s.blindCardId !== null) {
      next.blindCardIds = [s.blindCardId];
    } else if (serializedWireBlindCount(s) === 0) {
      next.blindCardIds = [];
    } else {
      next.blindCardIds = [...prev.blindCardIds];
    }
    godPiles[slot] = next;
    return;
  }

  godPiles[slot] = {
    ...EMPTY_GOD_PILE,
    discardIds: [...s.discardIds],
    deckIds: [],
    handIds: [],
    blindCardIds:
      s.blindCardIds !== undefined ? [...s.blindCardIds] : [],
    remoteBlindCount:
      s.blindCardIds !== undefined && s.blindCardIds.length > 0
        ? 0
        : serializedWireBlindCount(s),
    remoteHandCount: s.handCount,
    remoteDeckCount: s.deckCount,
  };
}

function applyGodDeckSlotsFromSnapshot(slots: SerializedGodDeckSlotsV1): void {
  applySerializedGodSlot(0, slots['0']);
  applySerializedGodSlot(1, slots['1']);
}

function moveBlindCardToTableFromZone(
  blindIndex: number,
  clientX: number,
  clientY: number,
): void {
  if (!isGodDockInteractive()) return;
  const s = effectiveMyGodSlot();
  const p = godPiles[s];
  const id = p.blindCardIds[blindIndex];
  if (!id) return;
  const { x, y } = screenToBoardWorld(clientX, clientY);
  godTablePieces.push({ kind: 'single', id, world: { x, y }, faceUp: true });
  playBoardDragDrop();
  p.blindCardIds = p.blindCardIds.filter((_, i) => i !== blindIndex);
  notifyBoardEditLocal();
  scheduleRender();
  refreshGodDock();
  armyBuilderPanel.refresh();
}

registerArmyRosterGodCardIdsInPlay(() => godCardIdsInPlay(godTablePieces, godPiles));

function inventoryItemIdsInPlay(): Set<string> {
  const s = new Set<string>();
  for (const p of inventoryTablePieces) {
    if (!p.spawnedFromArmyPanel || !rosterPieceCountsForLocalArmiesPanel(p)) continue;
    s.add(p.itemId);
  }
  return s;
}

registerArmyRosterInventoryItemIdsInPlay(() => inventoryItemIdsInPlay());

armyBuilderPanel = new ArmyBuilderPanel(document.body, {
  getAltKeyHeld: () => altModActive(),
  getUsedCount: (leaderId, unitId) => countRosterCopies(leaderId, unitId),
  getPointsSpent: () => sumArmyPoints(),
  onTouchArmPayload: (json) => {
    pendingTouchArmyPlaceRaw = json;
  },
  onDiceRequest: (req) => {
    diceRoller.addDice(req.pool, req.source, {
      actionKey: req.actionKey,
      rollImmediately: req.rollImmediately,
    });
  },
});

const { CatalogEditorPanel } = await import('./catalogEditorPanel.ts');
const catalogEditorPanel = new CatalogEditorPanel(armyBuilderPanel.getToolbarMount(), {
  skipToolbarButton: true,
});
if (new URLSearchParams(window.location.search).get('catalogEdit') === '1') {
  catalogEditorPanel.setOpen(true);
}

godHandBlindDock = new GodHandBlindDock(document.body, {
  isInteractive: isGodDockInteractive,
  onBlindCardToTable: moveBlindCardToTableFromZone,
});
refreshGodDock();

// ── Render loop ────────────────────────────────────────────────

let needsRender = true;

function scheduleRender(): void {
  needsRender = true;
  notifyBoardEditLocal();
}

/** После «Завершить ход» все маркеры активации снова жёлтые (юнит может активироваться). */
function resetActivationsForNewTurn(): void {
  for (const u of units) {
    u.activated = true;
  }
  for (const m of bigMiniatures) {
    m.activated = true;
  }
  for (const m of largeMiniatures) {
    m.activated = true;
  }
  for (const m of hugeMiniatures) {
    m.activated = true;
  }
  pushPieceRotationsToRenderer();
  scheduleRender();
}

const topTurnPanel = mountTopTurnPanel(document.body, {
  onAdvanceTurn: resetActivationsForNewTurn,
});

let crystalWalletLocal: CrystalWallet;
let crystalWalletOpp: CrystalWallet;

function crystalWalletRecordForSlot(slot: PlayerSlot): Record<string, number> {
  const m = crystalWalletBySlot[slot];
  const o: Record<string, number> = {};
  for (const [k, v] of m) {
    if (v > 0) o[k] = v;
  }
  return o;
}

function crystalWalletSlotsForUi(): { local: PlayerSlot; opponent: PlayerSlot } {
  if (localViewPlayerSlot === null) return { local: 0, opponent: 1 };
  return { local: localViewPlayerSlot, opponent: (1 - localViewPlayerSlot) as PlayerSlot };
}

function refreshCrystalWalletUis(): void {
  const { local: slL, opponent: slO } = crystalWalletSlotsForUi();
  crystalWalletLocal.setBoundSlot(slL);
  crystalWalletOpp.setBoundSlot(slO);
  crystalWalletLocal.renderFromState(crystalWalletRecordForSlot(slL));
  crystalWalletOpp.renderFromState(crystalWalletRecordForSlot(slO));
}

function applyCrystalWalletDeltaCore(slot: PlayerSlot, crystalId: string, delta: number): void {
  const m = crystalWalletBySlot[slot];
  const cur = m.get(crystalId) ?? 0;
  const sum = cur + delta;
  if (sum <= 0) m.delete(crystalId);
  else m.set(crystalId, Math.min(99, sum));
  refreshCrystalWalletUis();
}

function applyCrystalWalletUserDelta(slot: PlayerSlot, crystalId: string, delta: number): void {
  applyCrystalWalletDeltaCore(slot, crystalId, delta);
  if (isBoardMultiplayerSyncActive() && localViewPlayerSlot !== null) {
    sendRoomClientMessage({ type: 'crystalWalletDelta', slot, crystalId, delta });
  }
  notifyBoardEditLocal();
}

function onPeerCrystalWalletDeltaFromNetwork(p: {
  slot: PlayerSlot;
  crystalId: string;
  delta: number;
}): void {
  applyCrystalWalletDeltaCore(p.slot, p.crystalId, p.delta);
  notifyBoardEditLocal();
}

function loadCrystalWalletsFromSnapshot(w: SerializedCrystalWalletsV1 | undefined): void {
  crystalWalletBySlot[0].clear();
  crystalWalletBySlot[1].clear();
  if (w) {
    for (const [k, v] of Object.entries(w['0'])) {
      if (typeof v === 'number' && v > 0) crystalWalletBySlot[0].set(k, Math.min(99, v));
    }
    for (const [k, v] of Object.entries(w['1'])) {
      if (typeof v === 'number' && v > 0) crystalWalletBySlot[1].set(k, Math.min(99, v));
    }
  }
  refreshCrystalWalletUis();
}

crystalWalletLocal = new CrystalWallet(topTurnPanel.localWalletMount, {
  variant: 'local',
  boundSlot: 0,
  onApplyDelta: (slot, crystalId, delta) => {
    applyCrystalWalletUserDelta(slot, crystalId, delta);
  },
});
crystalWalletOpp = new CrystalWallet(topTurnPanel.opponentWalletMount, {
  variant: 'opponent',
  boundSlot: 1,
  onApplyDelta: (slot, crystalId, delta) => {
    applyCrystalWalletUserDelta(slot, crystalId, delta);
  },
});
refreshCrystalWalletUis();

canvas.addEventListener('hex-cells-svg-ready', () => scheduleRender());
canvas.addEventListener('inventory-sprite-ready', () => scheduleRender());

/** Multiplayer seat: slot 1 sees the board rotated 180° (same model, opposite view). */
function applyMultiplayerViewSeat(slot: PlayerSlot | null): void {
  localViewPlayerSlot = slot;
  diceRoller.setLocalPlayerSlot(slot);
  viewSeatExtraRotationDeg = slot === 1 ? 180 : 0;
  renderer.updateConfig({
    boardRotationDeg: effectiveBoardRotationDeg(),
    oppositeSeatUnitRotationCorrectionDeg: slot === 1 ? -180 : 0,
  });
  refreshCrystalWalletUis();
  scheduleRender();
  refreshGodDock();
}

function loop(): void {
  if (godPieceFlipAnim && performance.now() - godPieceFlipAnim.startMs >= godPieceFlipAnim.durationMs) {
    godPieceFlipAnim = null;
  }
  if (godDeckShuffleAnim && performance.now() - godDeckShuffleAnim.startMs >= godDeckShuffleAnim.durationMs) {
    godDeckShuffleAnim = null;
  }
  if (needsRender) {
    pushPieceRotationsToRenderer();
    // Re-apply drag / preview every frame so renderer state cannot desync from main.ts.
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
    renderer.setBigMiniatures(
      bigMiniatures.map((m) => m.center),
      bigMiniPreviewPosition,
      draggingBigMiniIndex,
      bigMiniDragOverCenter,
      bigMiniOffBoards(),
    );
    renderer.setLargeMiniatures(
      largeMiniatures.map((m) => m.anchor),
      largeMiniPreviewPosition,
      draggingLargeMiniIndex,
      largeMiniDragOverAnchor,
      largeMiniatures.map((m) => m.offBoardWorld),
    );
    renderer.setHugeMiniatures(
      hugeMiniatures.map((m) => m.anchor),
      hugeMiniPreviewPosition,
      draggingHugeMiniIndex,
      hugeMiniDragOverAnchor,
      hugeMiniatures.map((m) => m.offBoardWorld),
    );
    renderer.setTerrain(
      terrains,
      terrainPreviewWorld,
      isDraggingTerrain,
      draggingTerrainIndex,
      terrainDragOverCenter,
      selectedTerrainIndex,
      terrainOffBoardWorlds,
    );
    renderer.setEtherVortexes(etherVortexes, selectedEtherVortexIndex);
    renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, etherVortexDragOverCenter);
    renderer.setGodLoosePieces(
      godTablePieces,
      isDraggingGodLoose ? godDraggingLooseIndex : null,
      godLooseDragPreviewWorld,
      selectedGodTablePieceIndex,
    );
    renderer.setInventoryTablePieces(
      inventoryTablePieces.map((p) => {
        const def = getMergedInventoryItem(p.itemId);
        return { world: p.world, spriteSrc: def?.sprite ?? null };
      }),
      isDraggingInventoryLoose ? inventoryDraggingIndex : null,
      inventoryLooseDragPreviewWorld,
      selectedInventoryTablePieceIndex,
    );
    renderer.setGodPieceFlipAnim(godPieceFlipAnim);
    renderer.setGodDeckShuffleAnim(godDeckShuffleAnim);
    updateMovementHighlights();
    updateBigMiniMovementHighlights();
    updateLargeMiniMovementHighlights();
    updateHugeMiniMovementHighlights();
    updateAttackRangeHighlights();
    updateUnitCard();
    {
      const { center, widthPx, heightPx } = getBoardDecorOverlayLayoutPx();
      renderer.setCellsSvgOverlayLayout({
        cx: center.x + gridOverlayOffsetScreenX,
        cy: center.y + gridOverlayOffsetScreenY,
        w: widthPx,
        h: heightPx,
        /* Поворот сетки не связан с калибровкой текстуры поля (запятая/точка/Alt+[). */
        rotDeg: effectiveBoardRotationDeg() + GRID_OVERLAY_EXTRA_ROTATION_DEG,
      });
    }
    renderer.updateConfig({
      backgroundImageRotationDeg:
        renderConfig.backgroundImageRotationDeg + desertUnderlayExtraRotationDeg,
    });
    renderer.render();
    godHandBlindDock?.applyDualBlindLayouts(
      computeBlindZoneLayoutForSlot(effectiveMyGodSlot()),
      computeBlindZoneLayoutForSlot(effectiveOpponentGodSlot()),
    );
    updateBoardDesertUnderlayTransform();
    updateBoardGridOverlayTransform();
    needsRender = false;
  }
  if (godPieceFlipAnim !== null) needsRender = true;
  if (godDeckShuffleAnim !== null) needsRender = true;
  tickTableDragOutbound(captureTableDragForNetwork);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── Input state ────────────────────────────────────────────────

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let draggingUnitIndex: number | null = null;
let dragOverHex: Hex | null = null;
let dragPreviewPosition: { x: number; y: number } | null = null;
let isDraggingTerrain = false;
let draggingTerrainIndex: number | null = null;
let terrainDragPending = false;
let terrainDragPendingIndex: number | null = null;
let terrainDragPendingStartX = 0;
let terrainDragPendingStartY = 0;
let terrainPreviewWorld: Point | null = null;
let terrainDragOverCenter: Hex | null = null;
let draggingBigMiniIndex: number | null = null;
let bigMiniPreviewPosition: { x: number; y: number } | null = null;
let bigMiniDragOverCenter: Hex | null = null;
let draggingLargeMiniIndex: number | null = null;
let largeMiniPreviewPosition: { x: number; y: number } | null = null;
let largeMiniDragOverAnchor: Hex | null = null;
let draggingHugeMiniIndex: number | null = null;
let hugeMiniPreviewPosition: { x: number; y: number } | null = null;
let hugeMiniDragOverAnchor: Hex | null = null;
/** Hex under mouse for Q/E rotation (null off-board or off-canvas). */
let hoveredHexUnderPointer: Hex | null = null;
/** Mousedown on unit: wait for move (drag) or mouseup (deselect if already selected). */
let unitDragPendingIndex: number | null = null;
let unitDragPendingStartX = 0;
let unitDragPendingStartY = 0;
/** True when the pending click also freshly selected the unit (don't deselect on mouseup). */
let unitDragPendingIsNewSelection = false;
/** Same pending-click behavior for selected big miniature. */
let bigMiniDragPendingIndex: number | null = null;
let bigMiniDragPendingStartX = 0;
let bigMiniDragPendingStartY = 0;
let largeMiniDragPendingIndex: number | null = null;
let largeMiniDragPendingStartX = 0;
let largeMiniDragPendingStartY = 0;
let hugeMiniDragPendingIndex: number | null = null;
let hugeMiniDragPendingStartX = 0;
let hugeMiniDragPendingStartY = 0;
/** Ether vortex drag state (mirrors terrain drag). */
let isDraggingEtherVortex = false;
let draggingEtherVortexIndex: number | null = null;
let etherVortexDragPending = false;
let etherVortexDragPendingIndex: number | null = null;
let etherVortexDragPendingStartX = 0;
let etherVortexDragPendingStartY = 0;
let etherVortexPreviewWorld: Point | null = null;
let etherVortexDragOverCenter: Hex | null = null;

let godLooseCapturePointerId: number | null = null;
/** Pointer captured during board piece drag (touch / pen) so move events keep firing. */
let boardDragCapturePointerId: number | null = null;

/** Active pointers currently down on the canvas (for two-finger zoom/pan). */
const activeCanvasPointers = new Map<number, { x: number; y: number }>();
let twoFingerCameraGesture = false;
let pinchPrevCenterX = 0;
let pinchPrevCenterY = 0;
let pinchPrevDistance = 0;

function releaseBoardDragCaptureIfAny(): void {
  if (boardDragCapturePointerId === null) return;
  try {
    canvas.releasePointerCapture(boardDragCapturePointerId);
  } catch {
    /* not capturing */
  }
  boardDragCapturePointerId = null;
}

function captureBoardDragPointer(pointerId: number | undefined): void {
  if (pointerId === undefined) return;
  releaseBoardDragCaptureIfAny();
  try {
    canvas.setPointerCapture(pointerId);
    boardDragCapturePointerId = pointerId;
  } catch {
    boardDragCapturePointerId = null;
  }
}

function pinchSnapshotFromMap(): { cx: number; cy: number; dist: number } | null {
  if (activeCanvasPointers.size !== 2) return null;
  const pts = [...activeCanvasPointers.values()];
  const cx = (pts[0].x + pts[1].x) / 2;
  const cy = (pts[0].y + pts[1].y) / 2;
  const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  return { cx, cy, dist };
}

function applyTwoFingerPinchPan(): void {
  const snap = pinchSnapshotFromMap();
  if (!snap) return;
  pinchPrevCenterX = snap.cx;
  pinchPrevCenterY = snap.cy;
  pinchPrevDistance = snap.dist;
}

function updateCameraFromTwoFingerMove(): void {
  const snap = pinchSnapshotFromMap();
  if (!snap || pinchPrevDistance <= 0) return;
  const { cx, cy, dist } = snap;
  const panDx = cx - pinchPrevCenterX;
  const panDy = cy - pinchPrevCenterY;
  camera.offsetX += panDx;
  camera.offsetY += panDy;
  const scale = dist / pinchPrevDistance;
  const oldZoom = camera.zoom;
  let newZoom = oldZoom * scale;
  newZoom = Math.max(0.2, Math.min(5, newZoom));
  camera.zoom = newZoom;
  camera.offsetX = cx - (cx - camera.offsetX) * (camera.zoom / oldZoom);
  camera.offsetY = cy - (cy - camera.offsetY) * (camera.zoom / oldZoom);
  pinchPrevCenterX = cx;
  pinchPrevCenterY = cy;
  pinchPrevDistance = dist;
}

/** Commit pending / active board drags as if primary pointer released (used when 2nd finger touches). */
function commitBoardDragStateAsPointerUpAt(clientX: number, clientY: number): void {
  let endedMiniatureDrag = false;
  if (unitDragPendingIndex !== null) {
    unitDragPendingIndex = null;
    if (draggingUnitIndex === null) {
      renderer.setDragState(null, null, null);
    }
  }
  if (bigMiniDragPendingIndex !== null) {
    bigMiniDragPendingIndex = null;
    if (draggingBigMiniIndex === null) {
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null, bigMiniOffBoards());
    }
  }
  largeMiniDragPendingIndex = null;
  hugeMiniDragPendingIndex = null;
  if (terrainDragPending && !isDraggingTerrain) {
    terrainDragPending = false;
    terrainDragPendingIndex = null;
  }
  if (etherVortexDragPending && !isDraggingEtherVortex) {
    etherVortexDragPending = false;
    etherVortexDragPendingIndex = null;
  }
  if (draggingUnitIndex !== null) {
    if (dragOverHex && !isHexOccupiedByOtherUnit(dragOverHex, draggingUnitIndex)) {
      units[draggingUnitIndex].position = dragOverHex;
      units[draggingUnitIndex].offBoardWorld = undefined;
    } else if (!dragOverHex && dragPreviewPosition) {
      units[draggingUnitIndex].offBoardWorld = { ...dragPreviewPosition };
    }
    draggingUnitIndex = null;
    dragOverHex = null;
    dragPreviewPosition = null;
    unitCard.setPassthrough(false);
    renderer.setDragState(null, null, null);
    endedMiniatureDrag = true;
    playBoardDragDrop();
  }
  if (draggingBigMiniIndex !== null) {
    const dropWorld = screenToBoardWorld(clientX, clientY);
    const dropHex = hexAtScreen(clientX, clientY);
    if (dropHex) {
      bigMiniatures[draggingBigMiniIndex].center = nearestHexonCenterFromWorld(dropWorld);
      bigMiniatures[draggingBigMiniIndex].offBoardWorld = undefined;
    } else if (bigMiniPreviewPosition) {
      bigMiniatures[draggingBigMiniIndex].offBoardWorld = { ...bigMiniPreviewPosition };
    }
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    bigMiniDragOverCenter = null;
    unitCard.setPassthrough(false);
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null,
      bigMiniatures.map((m) => m.offBoardWorld));
    endedMiniatureDrag = true;
    playBoardDragDrop();
  }
  if (draggingLargeMiniIndex !== null) {
    const dropHex = hexAtScreen(clientX, clientY);
    if (dropHex && largeMiniDragOverAnchor) {
      largeMiniatures[draggingLargeMiniIndex].anchor = largeMiniDragOverAnchor;
      largeMiniatures[draggingLargeMiniIndex].offBoardWorld = undefined;
    } else if (!dropHex && largeMiniPreviewPosition) {
      largeMiniatures[draggingLargeMiniIndex].offBoardWorld = { ...largeMiniPreviewPosition };
    }
    draggingLargeMiniIndex = null;
    largeMiniPreviewPosition = null;
    largeMiniDragOverAnchor = null;
    unitCard.setPassthrough(false);
    endedMiniatureDrag = true;
    playBoardDragDrop();
  }
  if (draggingHugeMiniIndex !== null) {
    const idx = draggingHugeMiniIndex;
    const dropWorld = hugeMiniPreviewPosition ?? screenToBoardWorld(clientX, clientY);
    const dropHex = hexAtScreen(clientX, clientY);
    if (dropHex) {
      hugeMiniatures[idx].offBoardWorld = { ...dropWorld };
      const anchor = findHugeMiniAnchorForPivotWorld(
        dropWorld,
        hugeMiniatures[idx].rotationDeg,
        idx,
      );
      if (anchor !== null) hugeMiniatures[idx].anchor = anchor;
    } else {
      hugeMiniatures[idx].offBoardWorld = { ...dropWorld };
    }
    draggingHugeMiniIndex = null;
    hugeMiniPreviewPosition = null;
    hugeMiniDragOverAnchor = null;
    unitCard.setPassthrough(false);
    endedMiniatureDrag = true;
    playBoardDragDrop();
  }
  if (isDraggingTerrain && draggingTerrainIndex !== null) {
    const dropWorld = screenToBoardWorld(clientX, clientY);
    const dropHex = hexAtScreen(clientX, clientY);
    if (dropHex) {
      terrains[draggingTerrainIndex] = nearestHexonCenterFromWorld(dropWorld);
      terrainOffBoardWorlds[draggingTerrainIndex] = undefined;
    } else {
      terrainOffBoardWorlds[draggingTerrainIndex] = { ...dropWorld };
    }
    isDraggingTerrain = false;
    draggingTerrainIndex = null;
    terrainDragPendingIndex = null;
    terrainPreviewWorld = null;
    terrainDragOverCenter = null;
    renderer.setTerrain(terrains, null, false, null, null, selectedTerrainIndex, terrainOffBoardWorlds);
    playBoardDragDrop();
  }
  if (isDraggingEtherVortex && draggingEtherVortexIndex !== null) {
    const dropWorld = screenToBoardWorld(clientX, clientY);
    const dropHex = hexAtScreen(clientX, clientY);
    if (dropHex) {
      etherVortexes[draggingEtherVortexIndex].center = nearestHexonCenterFromWorld(dropWorld);
      etherVortexes[draggingEtherVortexIndex].offBoardWorld = undefined;
    } else {
      etherVortexes[draggingEtherVortexIndex].offBoardWorld = { ...dropWorld };
    }
    isDraggingEtherVortex = false;
    draggingEtherVortexIndex = null;
    etherVortexDragPendingIndex = null;
    etherVortexPreviewWorld = null;
    etherVortexDragOverCenter = null;
    renderer.setEtherVortexDrag(null, null, null);
    renderer.setEtherVortexes(etherVortexes, selectedEtherVortexIndex);
    playBoardDragDrop();
  }
  if (endedMiniatureDrag) {
    clearSelectionAfterMiniatureDragEnd();
  }
  releaseBoardDragCaptureIfAny();
  scheduleRender();
}

function captureTableDragForNetwork(): TableDragState {
  if (isDraggingGodLoose && godDraggingLooseIndex !== null && godLooseDragPreviewWorld) {
    return {
      kind: 'godLoose',
      index: godDraggingLooseIndex,
      worldX: godLooseDragPreviewWorld.x,
      worldY: godLooseDragPreviewWorld.y,
      overQ: null,
      overR: null,
    };
  }
  if (isDraggingEtherVortex && draggingEtherVortexIndex !== null && etherVortexPreviewWorld) {
    return {
      kind: 'ether',
      index: draggingEtherVortexIndex,
      worldX: etherVortexPreviewWorld.x,
      worldY: etherVortexPreviewWorld.y,
      overQ: etherVortexDragOverCenter?.q ?? null,
      overR: etherVortexDragOverCenter?.r ?? null,
    };
  }
  if (isDraggingTerrain && draggingTerrainIndex !== null && terrainPreviewWorld) {
    return {
      kind: 'terrain',
      index: draggingTerrainIndex,
      worldX: terrainPreviewWorld.x,
      worldY: terrainPreviewWorld.y,
      overQ: terrainDragOverCenter?.q ?? null,
      overR: terrainDragOverCenter?.r ?? null,
    };
  }
  if (draggingHugeMiniIndex !== null && hugeMiniPreviewPosition) {
    return {
      kind: 'huge',
      index: draggingHugeMiniIndex,
      worldX: hugeMiniPreviewPosition.x,
      worldY: hugeMiniPreviewPosition.y,
      overQ: hugeMiniDragOverAnchor?.q ?? null,
      overR: hugeMiniDragOverAnchor?.r ?? null,
    };
  }
  if (draggingLargeMiniIndex !== null && largeMiniPreviewPosition) {
    return {
      kind: 'large',
      index: draggingLargeMiniIndex,
      worldX: largeMiniPreviewPosition.x,
      worldY: largeMiniPreviewPosition.y,
      overQ: largeMiniDragOverAnchor?.q ?? null,
      overR: largeMiniDragOverAnchor?.r ?? null,
    };
  }
  if (draggingBigMiniIndex !== null && bigMiniPreviewPosition) {
    return {
      kind: 'big',
      index: draggingBigMiniIndex,
      worldX: bigMiniPreviewPosition.x,
      worldY: bigMiniPreviewPosition.y,
      overQ: bigMiniDragOverCenter?.q ?? null,
      overR: bigMiniDragOverCenter?.r ?? null,
    };
  }
  if (draggingUnitIndex !== null && dragPreviewPosition) {
    return {
      kind: 'unit',
      index: draggingUnitIndex,
      worldX: dragPreviewPosition.x,
      worldY: dragPreviewPosition.y,
      overQ: dragOverHex?.q ?? null,
      overR: dragOverHex?.r ?? null,
    };
  }
  return EMPTY_TABLE_DRAG;
}

// ── Helper: get hex under cursor ───────────────────────────────

function screenToBoardWorld(sx: number, sy: number): { x: number; y: number } {
  const world = camera.screenToWorld(sx, sy);
  const boardCenter = getBoardCenterWorld();
  const angleRad = (effectiveBoardRotationDeg() * Math.PI) / 180;
  const inverseAngle = -angleRad;
  const dx = world.x - boardCenter.x;
  const dy = world.y - boardCenter.y;
  return {
    x: boardCenter.x + dx * Math.cos(inverseAngle) - dy * Math.sin(inverseAngle),
    y: boardCenter.y + dx * Math.sin(inverseAngle) + dy * Math.cos(inverseAngle),
  };
}

/** Доп. поворот карт богов на месте напротив (как `oppositeSeatUnitRotationCorrectionDeg` в рендерере). */
function godTableCardOppositeSeatFixDeg(): number {
  return viewSeatExtraRotationDeg === 180 ? -180 : 0;
}

/** Ellipse in card-local space (matches board R then поворот карты на canvas). */
function godEllipseContains(world: Point, center: Point, hw: number, hh: number): boolean {
  const dx = world.x - center.x;
  const dy = world.y - center.y;
  const B = (effectiveBoardRotationDeg() * Math.PI) / 180;
  const dpx = dx * Math.cos(B) + dy * Math.sin(B);
  const dpy = -dx * Math.sin(B) + dy * Math.cos(B);
  const C = ((GOD_TABLE_CARD_ROT_CW_DEG + godTableCardOppositeSeatFixDeg()) * Math.PI) / 180;
  const sx = dpx * Math.cos(C) - dpy * Math.sin(C);
  const sy = dpx * Math.sin(C) + dpy * Math.cos(C);
  const a = sx / hw;
  const b = sy / hh;
  return a * a + b * b <= 1;
}

/** Topmost loose god card under cursor (board-space hit). */
function godLooseHitIndex(clientX: number, clientY: number): number | null {
  const w = screenToBoardWorld(clientX, clientY);
  for (let i = godTablePieces.length - 1; i >= 0; i--) {
    const c = godTablePieces[i]!;
    const center =
      isDraggingGodLoose && godDraggingLooseIndex === i && godLooseDragPreviewWorld
        ? godLooseDragPreviewWorld
        : c.world;
    if (godEllipseContains(w, center, GOD_TABLE_CARD_HW, GOD_TABLE_CARD_HH)) return i;
  }
  return null;
}

function inventoryLooseHitIndex(clientX: number, clientY: number): number | null {
  const pt = screenToBoardWorld(clientX, clientY);
  for (let i = inventoryTablePieces.length - 1; i >= 0; i--) {
    const p = inventoryTablePieces[i]!;
    if (!rosterPieceCountsForLocalArmiesPanel(p)) continue;
    const center =
      isDraggingInventoryLoose && inventoryDraggingIndex === i && inventoryLooseDragPreviewWorld
        ? inventoryLooseDragPreviewWorld
        : p.world;
    if (godEllipseContains(pt, center, INVENTORY_TABLE_MARKER_HW, INVENTORY_TABLE_MARKER_HH)) return i;
  }
  return null;
}

function normalizeGodTablePiece(p: GodTablePiece): GodTablePiece {
  if (p.kind === 'deck' && p.ids.length === 1) {
    return { kind: 'single', id: p.ids[0]!, world: p.world, faceUp: p.faceUp };
  }
  return p;
}

function mergeGodTablePieces(incoming: GodTablePiece, base: GodTablePiece): GodTablePiece {
  const inc = incoming.kind === 'single' ? [incoming.id] : incoming.ids;
  const baseIds = base.kind === 'single' ? [base.id] : base.ids;
  const ids = [...baseIds, ...inc];
  // Ориентация результирующей стопки наследуется от целевой стопки (base),
  // чтобы «доложить в колоду» не переворачивало её состоянием входящей карты.
  const faceUp = base.faceUp;
  const world = { ...base.world };
  if (ids.length === 1) return { kind: 'single', id: ids[0]!, world, faceUp };
  return { kind: 'deck', ids, world, faceUp };
}

function withGodPieceWorld(p: GodTablePiece, w: Point): GodTablePiece {
  if (p.kind === 'single') return { ...p, world: { ...w } };
  return { ...p, world: { ...w } };
}

/** Topmost piece whose ellipse contains `world` (board space), excluding one index. */
function godPieceHitIndexFromWorld(world: Point, excludeIdx: number | null): number | null {
  for (let i = godTablePieces.length - 1; i >= 0; i--) {
    if (excludeIdx !== null && i === excludeIdx) continue;
    const c = godTablePieces[i]!.world;
    if (godEllipseContains(world, c, GOD_TABLE_CARD_HW, GOD_TABLE_CARD_HH)) return i;
  }
  return null;
}

/** Remove loose god piece from the table entirely. */
function removeGodTablePieceAtIndex(i: number): void {
  if (i < 0 || i >= godTablePieces.length) return;

  if (isDraggingGodLoose && godDraggingLooseIndex === i) {
    isDraggingGodLoose = false;
    godDraggingLooseIndex = null;
    godLooseDragPreviewWorld = null;
    godDragWholeGodDeck = false;
    releaseGodLoosePointerCaptureIfAny();
  } else if (isDraggingGodLoose && godDraggingLooseIndex !== null && godDraggingLooseIndex > i) {
    godDraggingLooseIndex -= 1;
  }

  if (godLooseDragPending && godLooseDragPendingIndex === i) {
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDragWholeGodDeck = false;
    releaseGodLoosePointerCaptureIfAny();
  } else if (godLooseDragPending && godLooseDragPendingIndex !== null && godLooseDragPendingIndex > i) {
    godLooseDragPendingIndex -= 1;
  }

  godTablePieces.splice(i, 1);

  if (godPieceFlipAnim) {
    if (godPieceFlipAnim.index === i) godPieceFlipAnim = null;
    else if (godPieceFlipAnim.index > i)
      godPieceFlipAnim = { ...godPieceFlipAnim, index: godPieceFlipAnim.index - 1 };
  }

  if (selectedGodTablePieceIndex !== null) {
    if (selectedGodTablePieceIndex === i) selectedGodTablePieceIndex = null;
    else if (selectedGodTablePieceIndex > i) selectedGodTablePieceIndex -= 1;
  }
}

function removeInventoryTablePieceAtIndex(i: number): void {
  if (i < 0 || i >= inventoryTablePieces.length) return;

  if (isDraggingInventoryLoose && inventoryDraggingIndex === i) {
    isDraggingInventoryLoose = false;
    inventoryDraggingIndex = null;
    inventoryLooseDragPreviewWorld = null;
  } else if (isDraggingInventoryLoose && inventoryDraggingIndex !== null && inventoryDraggingIndex > i) {
    inventoryDraggingIndex -= 1;
  }

  if (inventoryLooseDragPending && inventoryLooseDragPendingIndex === i) {
    inventoryLooseDragPending = false;
    inventoryLooseDragPendingIndex = null;
  } else if (inventoryLooseDragPending && inventoryLooseDragPendingIndex !== null && inventoryLooseDragPendingIndex > i) {
    inventoryLooseDragPendingIndex -= 1;
  }

  inventoryTablePieces.splice(i, 1);

  if (selectedInventoryTablePieceIndex !== null) {
    if (selectedInventoryTablePieceIndex === i) selectedInventoryTablePieceIndex = null;
    else if (selectedInventoryTablePieceIndex > i) selectedInventoryTablePieceIndex -= 1;
  }
}

function hexAtScreen(sx: number, sy: number): Hex | null {
  const boardWorld = screenToBoardWorld(sx, sy);
  const hex = layout.pixelToHex(boardWorld);
  return grid.has(hex) ? hex : null;
}

/** Hex under the last known pointer position if it lies over the canvas (for Alt without relying on canvas-only hover). */
function hexUnderGlobalPointer(): Hex | null {
  const r = canvas.getBoundingClientRect();
  if (
    pointerScreenX < r.left ||
    pointerScreenX >= r.right ||
    pointerScreenY < r.top ||
    pointerScreenY >= r.bottom
  ) {
    return null;
  }
  return hexAtScreen(pointerScreenX, pointerScreenY);
}

function isHexOccupiedByOtherUnit(target: Hex, movingUnitIndex: number): boolean {
  return units.some((unit, index) => index !== movingUnitIndex && unit.position.key === target.key);
}

function hexonCells(center: Hex): Hex[] {
  return [center, ...Hex.directions.map((direction) => center.add(direction))];
}

function findTerrainAtHex(hex: Hex): number {
  return terrains.findIndex((center) =>
    hexonCells(center).some((cell) => cell.key === hex.key),
  );
}

function findBigMiniAtHex(hex: Hex): number {
  return bigMiniatures.findIndex((m) =>
    hexonCells(m.center).some((cell) => cell.key === hex.key),
  );
}

function findLargeMiniAtHex(hex: Hex): number {
  return largeMiniatures.findIndex((m) =>
    largeMiniFootprint(m).some((cell) => cell.key === hex.key),
  );
}

function findHugeMiniAtHex(hex: Hex): number {
  return hugeMiniatures.findIndex((m) =>
    hugeMiniAllCells(m).some((cell) => cell.key === hex.key),
  );
}

function hugeMiniPivotWorld(m: HugeMini): Point {
  return m.offBoardWorld ?? hugeMiniDrawPivotWorld(m.anchor, m.rotationDeg, layout);
}

function findHugeMiniIndexNearPivotWorld(world: Point): number {
  const r = OFF_BOARD_HUGE_HIT_RADIUS * 1.2;
  const r2 = r * r;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < hugeMiniatures.length; i++) {
    const m = hugeMiniatures[i]!;
    const p = hugeMiniPivotWorld(m);
    const d2 = (p.x - world.x) ** 2 + (p.y - world.y) ** 2;
    if (d2 > r2) continue;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

/** Prefer cell hit, else silhouette pivot proximity (free-placed huge minis). */
function resolveHugeMiniIndexAtPointer(hex: Hex | null, world: Point): number {
  if (hex) {
    const i = findHugeMiniAtHex(hex);
    if (i !== -1) return i;
  }
  return findHugeMiniIndexNearPivotWorld(world);
}

function findEtherVortexAtHex(hex: Hex): number {
  return etherVortexes.findIndex((v) =>
    etherVortexFootprint(v.center).some((cell) => cell.key === hex.key),
  );
}

// ── Off-board hit-testing (world-coordinate distance) ──────────

/** Hit radius for a small unit drawn off-board (world units). */
const OFF_BOARD_SMALL_HIT_RADIUS = HEX_SIZE * 0.9;
/** Hit radius for a hexon-sized element drawn off-board (world units). */
const OFF_BOARD_HEXON_HIT_RADIUS = HEX_SIZE * 2.2;
/** Hit radius for a large mini (3-hex) drawn off-board. */
const OFF_BOARD_LARGE_HIT_RADIUS = HEX_SIZE * 1.5;
/** Hit radius for a huge mini (3-hexon) drawn off-board. */
const OFF_BOARD_HUGE_HIT_RADIUS = HEX_SIZE * 3.5;

function findOffBoardUnitAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < units.length; i++) {
    const ob = units[i].offBoardWorld;
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_SMALL_HIT_RADIUS * OFF_BOARD_SMALL_HIT_RADIUS) return i;
  }
  return -1;
}

function findOffBoardBigMiniAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < bigMiniatures.length; i++) {
    const ob = bigMiniatures[i].offBoardWorld;
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_HEXON_HIT_RADIUS * OFF_BOARD_HEXON_HIT_RADIUS) return i;
  }
  return -1;
}

function findOffBoardTerrainAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < terrains.length; i++) {
    const ob = terrainOffBoardWorlds[i];
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_HEXON_HIT_RADIUS * OFF_BOARD_HEXON_HIT_RADIUS) return i;
  }
  return -1;
}

function findOffBoardEtherVortexAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < etherVortexes.length; i++) {
    const ob = etherVortexes[i].offBoardWorld;
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_HEXON_HIT_RADIUS * OFF_BOARD_HEXON_HIT_RADIUS) return i;
  }
  return -1;
}

function findOffBoardLargeMiniAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < largeMiniatures.length; i++) {
    const ob = largeMiniatures[i].offBoardWorld;
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_LARGE_HIT_RADIUS * OFF_BOARD_LARGE_HIT_RADIUS) return i;
  }
  return -1;
}

function findOffBoardHugeMiniAtScreen(sx: number, sy: number): number {
  const world = screenToBoardWorld(sx, sy);
  for (let i = 0; i < hugeMiniatures.length; i++) {
    const ob = hugeMiniatures[i].offBoardWorld;
    if (!ob) continue;
    const dx = world.x - ob.x;
    const dy = world.y - ob.y;
    if (dx * dx + dy * dy <= OFF_BOARD_HUGE_HIT_RADIUS * OFF_BOARD_HUGE_HIT_RADIUS) return i;
  }
  return -1;
}

type RosterTaggedPiece = {
  spawnedFromArmyPanel?: boolean;
  armyOwnerPlayerSlot?: PlayerSlot;
};

/** Solo: all roster pieces count. MP player: only own slot. MP spectator: none. */
function rosterPieceCountsForLocalArmiesPanel(p: RosterTaggedPiece): boolean {
  if (!isBoardMultiplayerSyncActive()) return true;
  if (localViewPlayerSlot === null) return false;
  return p.armyOwnerPlayerSlot === localViewPlayerSlot;
}

/** On paste in MP: assign local slot to roster pieces missing owner (e.g. legacy clipboard). */
function rosterPasteOwnerOverride<T extends RosterTaggedPiece>(src: T): { armyOwnerPlayerSlot?: PlayerSlot } {
  if (
    !isBoardMultiplayerSyncActive() ||
    localViewPlayerSlot === null ||
    !src.spawnedFromArmyPanel ||
    src.armyOwnerPlayerSlot !== undefined
  ) {
    return {};
  }
  return { armyOwnerPlayerSlot: localViewPlayerSlot };
}

function countRosterCopies(leaderId: string, unitId: string): number {
  let n = 0;
  for (const u of units) {
    if (
      u.spawnedFromArmyPanel &&
      rosterPieceCountsForLocalArmiesPanel(u) &&
      u.rosterLeaderId === leaderId &&
      u.catalogUnitId === unitId
    ) {
      n++;
    }
  }
  for (const m of bigMiniatures) {
    if (
      m.spawnedFromArmyPanel &&
      rosterPieceCountsForLocalArmiesPanel(m) &&
      m.rosterLeaderId === leaderId &&
      m.catalogUnitId === unitId
    )
      n++;
  }
  for (const m of largeMiniatures) {
    if (
      m.spawnedFromArmyPanel &&
      rosterPieceCountsForLocalArmiesPanel(m) &&
      m.rosterLeaderId === leaderId &&
      m.catalogUnitId === unitId
    )
      n++;
  }
  for (const m of hugeMiniatures) {
    if (
      m.spawnedFromArmyPanel &&
      rosterPieceCountsForLocalArmiesPanel(m) &&
      m.rosterLeaderId === leaderId &&
      m.catalogUnitId === unitId
    )
      n++;
  }
  return n;
}

function sumRosterPoints(): number {
  let s = 0;
  for (const u of units) {
    if (!u.spawnedFromArmyPanel || !u.catalogUnitId || !rosterPieceCountsForLocalArmiesPanel(u)) continue;
    if (u.rosterLeaderId) s += rosterSpawnPoints(u.rosterLeaderId, u.catalogUnitId);
  }
  for (const m of bigMiniatures) {
    if (!m.spawnedFromArmyPanel || !m.catalogUnitId || !rosterPieceCountsForLocalArmiesPanel(m)) continue;
    if (m.rosterLeaderId) s += rosterSpawnPoints(m.rosterLeaderId, m.catalogUnitId);
  }
  for (const m of largeMiniatures) {
    if (!m.spawnedFromArmyPanel || !m.catalogUnitId || !rosterPieceCountsForLocalArmiesPanel(m)) continue;
    if (m.rosterLeaderId) s += rosterSpawnPoints(m.rosterLeaderId, m.catalogUnitId);
  }
  for (const m of hugeMiniatures) {
    if (!m.spawnedFromArmyPanel || !m.catalogUnitId || !rosterPieceCountsForLocalArmiesPanel(m)) continue;
    if (m.rosterLeaderId) s += rosterSpawnPoints(m.rosterLeaderId, m.catalogUnitId);
  }
  return s;
}

function isInventoryItemIdInPlay(itemId: string): boolean {
  for (const p of inventoryTablePieces) {
    if (!p.spawnedFromArmyPanel || !rosterPieceCountsForLocalArmiesPanel(p)) continue;
    if (p.itemId === itemId) return true;
  }
  return false;
}

/** Очки за предметы, уже вынесенные на стол из панели армии (каждый id предмета — один раз). */
function sumInventoryPoints(): number {
  let s = 0;
  const seen = new Set<string>();
  for (const p of inventoryTablePieces) {
    if (!p.spawnedFromArmyPanel || !rosterPieceCountsForLocalArmiesPanel(p)) continue;
    if (seen.has(p.itemId)) continue;
    seen.add(p.itemId);
    const def = getMergedInventoryItem(p.itemId);
    if (def) s += def.points;
  }
  return s;
}

function sumArmyPoints(): number {
  return sumRosterPoints() + sumInventoryPoints();
}

function isHexBlockedForSmall(hex: Hex): boolean {
  if (!grid.has(hex)) return true;
  if (units.some((u) => u.position.key === hex.key)) return true;
  for (const m of bigMiniatures) {
    if (hexonCells(m.center).some((c) => c.key === hex.key)) return true;
  }
  for (const m of largeMiniatures) {
    if (largeMiniFootprint(m).some((c) => c.key === hex.key)) return true;
  }
  for (const m of hugeMiniatures) {
    if (hugeMiniAllCells(m).some((c) => c.key === hex.key)) return true;
  }
  return false;
}

function canPlaceBigMiniAt(center: Hex): boolean {
  const cells = hexonCells(center);
  for (const h of cells) {
    if (!grid.has(h)) return false;
    if (units.some((u) => u.position.key === h.key)) return false;
  }
  for (const m of bigMiniatures) {
    const keys = new Set(hexonCells(m.center).map((c) => c.key));
    if (cells.some((c) => keys.has(c.key))) return false;
  }
  return true;
}

function largeMiniPlacementRotationDeg(excludeIndex: number, candidateRotationDeg?: number): number {
  if (excludeIndex >= 0) return largeMiniatures[excludeIndex]!.rotationDeg;
  return candidateRotationDeg ?? 0;
}

function canPlaceLargeMiniAt(anchor: Hex, excludeIndex = -1, candidateRotationDeg?: number): boolean {
  const rot = largeMiniPlacementRotationDeg(excludeIndex, candidateRotationDeg);
  const cells = largeTriangleCellsOriented(anchor, rot);
  for (const h of cells) {
    if (!grid.has(h)) return false;
    if (units.some((u) => u.position.key === h.key)) return false;
  }
  for (const m of bigMiniatures) {
    const keys = new Set(hexonCells(m.center).map((c) => c.key));
    if (cells.some((c) => keys.has(c.key))) return false;
  }
  for (let i = 0; i < largeMiniatures.length; i++) {
    if (i === excludeIndex) continue;
    const keys = new Set(largeMiniFootprint(largeMiniatures[i]).map((c) => c.key));
    if (cells.some((c) => keys.has(c.key))) return false;
  }
  return true;
}

function largeTriangleTripleSnapWorld(anchor: Hex, rotationDeg: number): Point {
  const t = largeTriangleCellsOriented(anchor, rotationDeg);
  return layoutSharedVertexThreeHexes(layout, t[0], t[1], t[2]);
}

/** Hover cell may belong to up to three valid triangle anchors; snap to shared-vertex closest to pointer. */
const LARGE_TRI_ANCHOR_CANDIDATE_OFFSETS: Hex[] = [new Hex(0, 0), new Hex(-1, 0), new Hex(0, -1)];

function bestLargeMiniAnchorForPointer(
  hoverHex: Hex,
  world: Point,
  excludeIndex: number,
  candidateRotationDeg?: number,
): Hex | null {
  const rot = largeMiniPlacementRotationDeg(excludeIndex, candidateRotationDeg);
  const candidates: Hex[] = [];
  const seen = new Set<string>();
  for (const off of LARGE_TRI_ANCHOR_CANDIDATE_OFFSETS) {
    const a = hoverHex.add(off);
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    if (!canPlaceLargeMiniAt(a, excludeIndex, candidateRotationDeg)) continue;
    candidates.push(a);
  }
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestD = Infinity;
  for (const a of candidates) {
    const c = largeTriangleTripleSnapWorld(a, rot);
    const d2 = (c.x - world.x) ** 2 + (c.y - world.y) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = a;
    }
  }
  return best;
}

function hexonCenterOwningSmallHex(hex: Hex): Hex | null {
  for (const c of allHexonCenters) {
    if (hexonCells(c).some((cell) => cell.key === hex.key)) return c;
  }
  return null;
}

/** Same pattern as large: hover hexon may be any of three roles in the huge triangle. */
const HUGE_TRI_ANCHOR_CANDIDATE_OFFSETS: Hex[] = [new Hex(0, 0), new Hex(-3, 1), new Hex(-1, -2)];

function hugeMiniPlacementRotationDeg(excludeIndex: number, candidateRotationDeg?: number): number {
  if (excludeIndex >= 0) return hugeMiniatures[excludeIndex]!.rotationDeg;
  return candidateRotationDeg ?? 0;
}

function bestHugeMiniAnchorForPointer(
  hoverHex: Hex | null,
  world: Point,
  excludeIndex: number,
  candidateRotationDeg?: number,
): Hex | null {
  const rot = hugeMiniPlacementRotationDeg(excludeIndex, candidateRotationDeg);
  const hc = hoverHex ? hexonCenterOwningSmallHex(hoverHex) : null;
  if (!hc) return null;
  const candidates: Hex[] = [];
  const seen = new Set<string>();
  for (const off of HUGE_TRI_ANCHOR_CANDIDATE_OFFSETS) {
    const a = hc.add(off);
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    if (!allHexonCenters.some((cc) => cc.key === a.key)) continue;
    if (!canPlaceHugeMiniAt(a, excludeIndex, candidateRotationDeg)) continue;
    candidates.push(a);
  }
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestD = Infinity;
  for (const a of candidates) {
    const p = layoutHugeMiniTriplePointWorld(layout, a, rot);
    const d2 = (p.x - world.x) ** 2 + (p.y - world.y) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = a;
    }
  }
  return best;
}

function canPlaceHugeMiniAt(anchor: Hex, excludeIndex = -1, candidateRotationDeg?: number): boolean {
  const rot = hugeMiniPlacementRotationDeg(excludeIndex, candidateRotationDeg);
  const centers = hugeTriangleHexonCentersOriented(anchor, rot);
  const hexonCenterKeys = new Set(allHexonCenters.map((c) => c.key));
  for (const c of centers) {
    if (!hexonCenterKeys.has(c.key)) return false;
  }
  for (let i = 0; i < hugeMiniatures.length; i++) {
    if (i === excludeIndex) continue;
    const otherCenters = new Set(hugeMiniFootprintCenters(hugeMiniatures[i]).map((c) => c.key));
    if (centers.some((c) => otherCenters.has(c.key))) return false;
  }
  return true;
}

/** Hexon anchor whose grid pivot best matches `world` at the given visual rotation. */
function findHugeMiniAnchorForPivotWorld(world: Point, rotationDeg: number, excludeIndex: number): Hex | null {
  let best: Hex | null = null;
  let bestD = Infinity;
  for (const a of allHexonCenters) {
    if (!canPlaceHugeMiniAt(a, excludeIndex)) continue;
    const p = hugeMiniDrawPivotWorld(a, rotationDeg, layout);
    const d2 = (p.x - world.x) ** 2 + (p.y - world.y) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = a;
    }
  }
  return best;
}

function applyHugeMiniRotation(hugeIdx: number, deltaDeg: number): boolean {
  const m = hugeMiniatures[hugeIdx];
  if (!m) return false;
  const step =
    Math.abs(deltaDeg) >= ELEMENT_ROT_STEP_FAST - 1 ? ELEMENT_ROT_STEP_FAST : ELEMENT_ROT_STEP;
  const signed = deltaDeg > 0 ? step : -step;
  const prevRot = m.rotationDeg;
  const prevAnchor = m.anchor;
  m.rotationDeg += signed;
  if (m.offBoardWorld) {
    const newA = findHugeMiniAnchorForPivotWorld(m.offBoardWorld, m.rotationDeg, hugeIdx);
    if (newA !== null && canPlaceHugeMiniAt(newA, hugeIdx)) {
      m.anchor = newA;
      return true;
    }
  } else if (canPlaceHugeMiniAt(m.anchor, hugeIdx)) {
    return true;
  }
  m.rotationDeg = prevRot;
  m.anchor = prevAnchor;
  return false;
}

/** Shared placement for army-panel spawns (troop + leader miniature) by `card.size`. */
function placeArmyCatalogUnitOnBoard(
  def: CatalogUnitDef,
  card: UnitCardData,
  unitId: string,
  leaderId: string,
  screenX: number,
  screenY: number,
): boolean {
  const rosterMeta =
    isBoardMultiplayerSyncActive() && localViewPlayerSlot !== null
      ? ({
          spawnedFromArmyPanel: true as const,
          catalogUnitId: unitId,
          rosterLeaderId: leaderId,
          armyOwnerPlayerSlot: localViewPlayerSlot,
        } as const)
      : ({
          spawnedFromArmyPanel: true as const,
          catalogUnitId: unitId,
          rosterLeaderId: leaderId,
        } as const);
  const broomgarHungerMeta =
    isBroomgarRosterLeader(leaderId) && getCatalogUnit(unitId)?.mercenary !== true
      ? ({ broomgarHungerPhase: 0 as BroomgarHungerPhase })
      : {};

  if (def.card.size === 'small') {
    const world = screenToBoardWorld(screenX, screenY);
    const hex = hexAtScreen(screenX, screenY);
    if (hex) {
      if (isHexBlockedForSmall(hex)) return false;
      units.push({
        position: hex,
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    } else {
      units.push({
        position: layout.pixelToHex(world),
        offBoardWorld: { ...world },
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    }
    unitCardData.push(card);
    clearSelection();
    selectedUnitIndex = units.length - 1;
    armyBuilderPanel.refresh();
    scheduleRender();
    return true;
  }

  if (def.card.size === 'large') {
    const world = screenToBoardWorld(screenX, screenY);
    const hex = hexAtScreen(screenX, screenY);
    if (hex) {
      const anchor = bestLargeMiniAnchorForPointer(hex, world, -1);
      if (!anchor) return false;
      largeMiniatures.push({
        anchor,
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    } else {
      largeMiniatures.push({
        anchor: layout.pixelToHex(world),
        offBoardWorld: { ...world },
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    }
    largeMiniCardData.push(card);
    clearSelection();
    selectedLargeMiniIndex = largeMiniatures.length - 1;
    armyBuilderPanel.refresh();
    scheduleRender();
    return true;
  }

  if (def.card.size === 'huge') {
    const world = screenToBoardWorld(screenX, screenY);
    const hex = hexAtScreen(screenX, screenY);
    if (hex) {
      const anchor = bestHugeMiniAnchorForPointer(hex, world, -1);
      if (!anchor) return false;
      hugeMiniatures.push({
        anchor,
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...hugeSpriteAlignFromCard(card, unitId),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    } else {
      const anchor = nearestHexonCenterFromWorld(world);
      hugeMiniatures.push({
        anchor,
        offBoardWorld: { ...world },
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        activated: true,
        effectMarkers: new Set(),
        ...hugeSpriteAlignFromCard(card, unitId),
        ...rosterMeta,
        ...broomgarHungerMeta,
      });
    }
    hugeMiniCardData.push(card);
    clearSelection();
    selectedHugeMiniIndex = hugeMiniatures.length - 1;
    armyBuilderPanel.refresh();
    scheduleRender();
    return true;
  }

  // Default: big
  const world = screenToBoardWorld(screenX, screenY);
  const hex = hexAtScreen(screenX, screenY);
  const center = nearestHexonCenterFromWorld(world);
  if (hex) {
    if (!canPlaceBigMiniAt(center)) return false;
    bigMiniatures.push({
      center,
      walk: card.walk,
      run: card.run,
      rotationDeg: 0,
      health: card.health,
      activated: true,
      effectMarkers: new Set(),
      ...rosterMeta,
      ...broomgarHungerMeta,
    });
  } else {
    bigMiniatures.push({
      center,
      offBoardWorld: { ...world },
      walk: card.walk,
      run: card.run,
      rotationDeg: 0,
      health: card.health,
      activated: true,
      effectMarkers: new Set(),
      ...rosterMeta,
      ...broomgarHungerMeta,
    });
  }
  bigMiniCardData.push(card);
  clearSelection();
  selectedBigMiniIndex = bigMiniatures.length - 1;
  armyBuilderPanel.refresh();
  scheduleRender();
  return true;
}

function trySpawnTroopFromArmyBuilder(
  unitId: string,
  leaderId: string,
  screenX: number,
  screenY: number,
): boolean {
  const def = getCatalogUnit(unitId);
  if (!def) return false;
  const maxC = maxCopiesForSlot(leaderId, unitId);
  if (maxC === null) return false;
  if (countRosterCopies(leaderId, unitId) >= maxC) return false;

  const card = structuredClone(def.card);
  card.catalogUnitId = unitId;
  return placeArmyCatalogUnitOnBoard(def, card, unitId, leaderId, screenX, screenY);
}

function trySpawnLeaderMiniFromArmyBuilder(
  leaderId: string,
  unitId: string,
  screenX: number,
  screenY: number,
): boolean {
  const leader = getLeader(leaderId);
  if (!leader || leader.catalogUnitId !== unitId) return false;
  const def = getCatalogUnit(unitId);
  if (!def) return false;
  if (countRosterCopies(leaderId, unitId) >= LEADER_MINI_MAX_COPIES) return false;

  const card = structuredClone(def.card);
  card.catalogUnitId = unitId;
  return placeArmyCatalogUnitOnBoard(def, card, unitId, leaderId, screenX, screenY);
}

function trySpawnInventoryFromArmyBuilder(
  leaderId: string,
  itemId: string,
  screenX: number,
  screenY: number,
): boolean {
  const def = getMergedInventoryItem(itemId);
  if (!def) return false;
  if (isInventoryItemIdInPlay(itemId)) return false;
  const cap = armyBuilderPanel.getArmyPointsCap();
  const rosterPts = sumRosterPoints();
  const invPts = sumInventoryPoints();
  if (rosterPts + invPts + def.points > cap) return false;

  const w = screenToBoardWorld(screenX, screenY);
  const piece: InventoryTablePiece =
    isBoardMultiplayerSyncActive() && localViewPlayerSlot !== null
      ? {
          rosterLeaderId: leaderId,
          itemId,
          world: w,
          spawnedFromArmyPanel: true,
          armyOwnerPlayerSlot: localViewPlayerSlot,
        }
      : {
          rosterLeaderId: leaderId,
          itemId,
          world: w,
          spawnedFromArmyPanel: true,
        };
  inventoryTablePieces.push(piece);
  clearSelection();
  armyBuilderPanel.refresh();
  notifyBoardEditLocal();
  scheduleRender();
  return true;
}

function parseArmyDragPayload(raw: string): ArmyDragPayload | null {
  try {
    const o = JSON.parse(raw) as Partial<ArmyDragPayload> & {
      unitId?: string;
      leaderId?: string;
      cardId?: string;
      itemId?: string;
      kind?: string;
    };
    if (o.kind === 'inventory' && typeof o.itemId === 'string' && typeof o.leaderId === 'string') {
      return { kind: 'inventory', leaderId: o.leaderId, itemId: o.itemId };
    }
    if (o.kind === 'god' && typeof o.cardId === 'string') {
      return { kind: 'god', cardId: o.cardId };
    }
    if (typeof o.unitId !== 'string' || typeof o.leaderId !== 'string') return null;
    if (o.kind === 'leader') {
      return { kind: 'leader', leaderId: o.leaderId, unitId: o.unitId };
    }
    if (o.kind === 'troop') {
      return { kind: 'troop', leaderId: o.leaderId, unitId: o.unitId };
    }
    // `kind` missing / stripped — leader miniature is not on the roster, so troop spawn would fail.
    const lg = getLeader(o.leaderId);
    if (lg && lg.catalogUnitId === o.unitId) {
      return { kind: 'leader', leaderId: o.leaderId, unitId: o.unitId };
    }
    return { kind: 'troop', leaderId: o.leaderId, unitId: o.unitId };
  } catch {
    return null;
  }
}

function handleArmyBuilderDrop(clientX: number, clientY: number, raw: string): void {
  const p = parseArmyDragPayload(raw);
  if (!p) return;
  if (p.kind === 'inventory') {
    const placed = trySpawnInventoryFromArmyBuilder(p.leaderId, p.itemId, clientX, clientY);
    if (placed) playBoardDragDrop();
    return;
  }
  if (p.kind === 'god') {
    if (!getGodCardById(p.cardId)) return;
    const w = screenToBoardWorld(clientX, clientY);
    const incoming: GodTablePiece = { kind: 'single', id: p.cardId, world: w, faceUp: true };
    const mergeI = godPieceHitIndexFromWorld(w, null);
    if (mergeI !== null) {
      const base = godTablePieces[mergeI]!;
      godTablePieces[mergeI] = normalizeGodTablePiece(mergeGodTablePieces(incoming, base));
    } else {
      godTablePieces.push(incoming);
    }
    playBoardDragDrop();
    scheduleRender();
    armyBuilderPanel.refresh();
    return;
  }
  if (p.kind === 'leader') {
    const placed = trySpawnLeaderMiniFromArmyBuilder(p.leaderId, p.unitId, clientX, clientY);
    if (placed) playBoardDragDrop();
  } else {
    const placed = trySpawnTroopFromArmyBuilder(p.unitId, p.leaderId, clientX, clientY);
    if (placed) playBoardDragDrop();
  }
}

function refreshAltHoverTarget(hex: Hex | null): void {
  if (!altModActive() || !hex) {
    altHoverTarget = null;
    return;
  }
  const unitIdx = units.findIndex(
    (unit) => unit.position.key === hex.key && grid.has(unit.position),
  );
  if (unitIdx !== -1) {
    altHoverTarget = { kind: 'small', index: unitIdx };
    return;
  }
  const wHover = screenToBoardWorld(pointerScreenX, pointerScreenY);
  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    if (
      isWorldPointInBigMiniSilhouette(
        wHover,
        bigMiniPivotWorldForHit(bigIdx),
        bigMiniatures[bigIdx]!.rotationDeg,
        layout,
      )
    ) {
      altHoverTarget = { kind: 'big', index: bigIdx };
      return;
    }
  }
  const largeIdx = findLargeMiniAtHex(hex);
  if (largeIdx !== -1) {
    if (
      isWorldPointInLargeMiniSilhouette(
        wHover,
        largeMiniPivotWorldForHit(largeIdx),
        largeMiniatures[largeIdx]!.rotationDeg,
        layout,
      )
    ) {
      altHoverTarget = { kind: 'large', index: largeIdx };
      return;
    }
  }
  const hugeIdx = resolveHugeMiniIndexAtPointer(hex, wHover);
  if (hugeIdx !== -1) {
    altHoverTarget = { kind: 'huge', index: hugeIdx };
    return;
  }
  altHoverTarget = null;
}

function refreshShiftHoverTarget(hex: Hex | null): void {
  if (!shiftModActive() || !hex) {
    shiftHoverTarget = null;
    return;
  }
  const unitIdx = units.findIndex(
    (unit) => unit.position.key === hex.key && grid.has(unit.position),
  );
  if (unitIdx !== -1) {
    shiftHoverTarget = { kind: 'small', index: unitIdx };
    return;
  }
  const wShift = screenToBoardWorld(pointerScreenX, pointerScreenY);
  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    if (
      isWorldPointInBigMiniSilhouette(
        wShift,
        bigMiniPivotWorldForHit(bigIdx),
        bigMiniatures[bigIdx]!.rotationDeg,
        layout,
      )
    ) {
      shiftHoverTarget = { kind: 'big', index: bigIdx };
      return;
    }
  }
  const largeIdx = findLargeMiniAtHex(hex);
  if (largeIdx !== -1) {
    if (
      isWorldPointInLargeMiniSilhouette(
        wShift,
        largeMiniPivotWorldForHit(largeIdx),
        largeMiniatures[largeIdx]!.rotationDeg,
        layout,
      )
    ) {
      shiftHoverTarget = { kind: 'large', index: largeIdx };
      return;
    }
  }
  const hugeIdx = resolveHugeMiniIndexAtPointer(hex, wShift);
  if (hugeIdx !== -1) {
    shiftHoverTarget = { kind: 'huge', index: hugeIdx };
    return;
  }
  shiftHoverTarget = null;
}

/** BFS in hexon-center space (same as selected big-mini range). */
function computeBigMiniWalkRunCenters(bigIndex: number): { walk: Hex[]; run: Hex[] } {
  const BIG_HEX_DIRECTIONS = [
    new Hex(3, -1),
    new Hex(1, 2),
    new Hex(-2, 3),
    new Hex(-3, 1),
    new Hex(-1, -2),
    new Hex(2, -3),
  ];
  const selected = bigMiniatures[bigIndex];
  const maxRange = selected.run;
  const visited = new Map<string, number>([[selected.center.key, 0]]);
  const queue: Hex[] = [selected.center];
  const hexonCenterKeys = new Set(allHexonCenters.map((center) => center.key));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = visited.get(current.key) ?? 0;
    if (currentDistance >= maxRange) continue;

    for (const direction of BIG_HEX_DIRECTIONS) {
      const next = current.add(direction);
      if (!hexonCenterKeys.has(next.key)) continue;
      if (visited.has(next.key)) continue;
      visited.set(next.key, currentDistance + 1);
      queue.push(next);
    }
  }

  const walkCenters: Hex[] = [];
  const runCenters: Hex[] = [];
  for (const center of allHexonCenters) {
    const distance = visited.get(center.key);
    if (!distance || distance <= 0) continue;
    if (distance <= selected.walk) walkCenters.push(center);
    if (distance <= selected.run) runCenters.push(center);
  }
  return { walk: walkCenters, run: runCenters };
}

function tryPromoteUnitDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (unitDragPendingIndex === null) return;
  const dx = e.clientX - unitDragPendingStartX;
  const dy = e.clientY - unitDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = unitDragPendingIndex;
  unitDragPendingIndex = null;
  draggingUnitIndex = idx;
  unitCard.setPassthrough(showSelectedDetails);
  const hex = hexAtScreen(e.clientX, e.clientY);
  dragOverHex = hex && !isHexOccupiedByOtherUnit(hex, idx) ? hex : null;
  dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteBigMiniDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (bigMiniDragPendingIndex === null) return;
  const dx = e.clientX - bigMiniDragPendingStartX;
  const dy = e.clientY - bigMiniDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = bigMiniDragPendingIndex;
  bigMiniDragPendingIndex = null;
  draggingBigMiniIndex = idx;
  unitCard.setPassthrough(showSelectedDetails);
  bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  bigMiniDragOverCenter = nearestHexonCenterFromWorld(bigMiniPreviewPosition);
  renderer.setBigMiniatures(
    bigMiniatures.map((m) => m.center),
    bigMiniPreviewPosition,
    draggingBigMiniIndex,
    bigMiniDragOverCenter,
  );
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteTerrainDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (!terrainDragPending || isDraggingTerrain || terrainDragPendingIndex === null) return;
  const dx = e.clientX - terrainDragPendingStartX;
  const dy = e.clientY - terrainDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = terrainDragPendingIndex;
  terrainDragPending = false;
  terrainDragPendingIndex = null;
  draggingTerrainIndex = idx;
  isDraggingTerrain = true;
  terrainPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
  terrainDragOverCenter = nearestHexonCenterFromWorld(terrainPreviewWorld);
  renderer.setTerrain(
    terrains,
    terrainPreviewWorld,
    true,
    draggingTerrainIndex,
    terrainDragOverCenter,
    selectedTerrainIndex,
    terrainOffBoardWorlds,
  );
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteLargeMiniDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (largeMiniDragPendingIndex === null) return;
  const dx = e.clientX - largeMiniDragPendingStartX;
  const dy = e.clientY - largeMiniDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = largeMiniDragPendingIndex;
  largeMiniDragPendingIndex = null;
  draggingLargeMiniIndex = idx;
  unitCard.setPassthrough(showSelectedDetails);
  largeMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  const hex = hexAtScreen(e.clientX, e.clientY);
  largeMiniDragOverAnchor = hex ? bestLargeMiniAnchorForPointer(hex, largeMiniPreviewPosition, idx) : null;
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteHugeMiniDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (hugeMiniDragPendingIndex === null) return;
  const dx = e.clientX - hugeMiniDragPendingStartX;
  const dy = e.clientY - hugeMiniDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = hugeMiniDragPendingIndex;
  hugeMiniDragPendingIndex = null;
  draggingHugeMiniIndex = idx;
  unitCard.setPassthrough(showSelectedDetails);
  hugeMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  hugeMiniDragOverAnchor = null;
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteEtherVortexDragFromPending(e: ClientXY, pointerId?: number): void {
  if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (!etherVortexDragPending || isDraggingEtherVortex || etherVortexDragPendingIndex === null) return;
  const dx = e.clientX - etherVortexDragPendingStartX;
  const dy = e.clientY - etherVortexDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = etherVortexDragPendingIndex;
  etherVortexDragPending = false;
  etherVortexDragPendingIndex = null;
  draggingEtherVortexIndex = idx;
  isDraggingEtherVortex = true;
  etherVortexPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
  etherVortexDragOverCenter = nearestHexonCenterFromWorld(etherVortexPreviewWorld);
  renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, etherVortexDragOverCenter);
  captureBoardDragPointer(pointerId);
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteGodLooseDrag(e: ClientXY): void {
  if (inventoryLooseDragPending || isDraggingInventoryLoose) return;
  if (!godLooseDragPending || isDraggingGodLoose || godLooseDragPendingIndex === null) return;
  const dx = e.clientX - godLooseDragPendingStartX;
  const dy = e.clientY - godLooseDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = godLooseDragPendingIndex;
  const piece = godTablePieces[idx]!;
  unitDragPendingIndex = null;
  bigMiniDragPendingIndex = null;
  terrainDragPending = false;
  terrainDragPendingIndex = null;
  etherVortexDragPending = false;
  etherVortexDragPendingIndex = null;
  if (draggingUnitIndex !== null) {
    draggingUnitIndex = null;
    dragOverHex = null;
    dragPreviewPosition = null;
    unitCard.setPassthrough(false);
  }
  if (draggingBigMiniIndex !== null) {
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    bigMiniDragOverCenter = null;
    unitCard.setPassthrough(false);
  }
  godLooseDragPending = false;
  godLooseDragPendingIndex = null;
  isDraggingGodLoose = true;
  const previewW = screenToBoardWorld(e.clientX, e.clientY);

  if (piece.kind === 'deck' && !godDragWholeGodDeck) {
    const ids = [...piece.ids];
    const top = ids.pop()!;
    if (ids.length === 1) {
      godTablePieces[idx] = {
        kind: 'single',
        id: ids[0]!,
        world: { ...piece.world },
        faceUp: piece.faceUp,
      };
    } else {
      godTablePieces[idx] = {
        kind: 'deck',
        ids,
        world: { ...piece.world },
        faceUp: piece.faceUp,
      };
    }
    godTablePieces.push({
      kind: 'single',
      id: top,
      world: previewW,
      faceUp: piece.faceUp,
    });
    godDraggingLooseIndex = godTablePieces.length - 1;
  } else {
    godDraggingLooseIndex = idx;
  }

  godDragWholeGodDeck = false;
  godLooseDragPreviewWorld = previewW;
  playBoardDragLift();
  scheduleRender();
}

function tryPromoteInventoryLooseDrag(e: ClientXY): void {
  if (!inventoryLooseDragPending || isDraggingInventoryLoose || inventoryLooseDragPendingIndex === null) return;
  if (godLooseDragPending || isDraggingGodLoose) return;
  const dx = e.clientX - inventoryLooseDragPendingStartX;
  const dy = e.clientY - inventoryLooseDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = inventoryLooseDragPendingIndex;
  unitDragPendingIndex = null;
  bigMiniDragPendingIndex = null;
  terrainDragPending = false;
  terrainDragPendingIndex = null;
  etherVortexDragPending = false;
  etherVortexDragPendingIndex = null;
  if (draggingUnitIndex !== null) {
    draggingUnitIndex = null;
    dragOverHex = null;
    dragPreviewPosition = null;
    unitCard.setPassthrough(false);
  }
  if (draggingBigMiniIndex !== null) {
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    bigMiniDragOverCenter = null;
    unitCard.setPassthrough(false);
  }
  inventoryLooseDragPending = false;
  inventoryLooseDragPendingIndex = null;
  isDraggingInventoryLoose = true;
  inventoryDraggingIndex = idx;
  inventoryLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
  playBoardDragLift();
  scheduleRender();
}

function tryHandleInventoryTablePrimaryDown(clientX: number, clientY: number): boolean {
  if (!isPointOverCanvas(clientX, clientY)) return false;
  if (godLooseDragPending || isDraggingGodLoose) return false;
  const ii = inventoryLooseHitIndex(clientX, clientY);
  if (ii === null) return false;
  clearSelection();
  inventoryLooseDragPending = true;
  inventoryLooseDragPendingIndex = ii;
  inventoryLooseDragPendingStartX = clientX;
  inventoryLooseDragPendingStartY = clientY;
  return true;
}

// ── Collect all hexon centers from the grid build ──────────────

const allHexonCenters: Hex[] = [];

function collectHexonCenters(): void {
  // Re-derive from the addHexonRow calls above
  const rows: { start: Hex; count: number }[] = [
    { start: new Hex(2, 0), count: 6 },
    { start: new Hex(0, 3), count: 7 },
    { start: new Hex(1, 5), count: 6 },
    { start: new Hex(-1, 8), count: 7 },
    { start: new Hex(0, 10), count: 6 },
    { start: new Hex(-2, 13), count: 7 },
    { start: new Hex(-1, 15), count: 6 },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      allHexonCenters.push(new Hex(row.start.q + i * 3, row.start.r - i));
    }
  }
}
collectHexonCenters();
updateBigMiniMovementHighlights();

function nearestHexonCenterFromWorld(world: { x: number; y: number }): Hex {
  let best = allHexonCenters[0];
  const bestPixel = layout.hexToPixel(best);
  let bestDist2 = (bestPixel.x - world.x) ** 2 + (bestPixel.y - world.y) ** 2;

  for (let i = 1; i < allHexonCenters.length; i++) {
    const candidate = allHexonCenters[i];
    const p = layout.hexToPixel(candidate);
    const d2 = (p.x - world.x) ** 2 + (p.y - world.y) ** 2;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      best = candidate;
    }
  }
  return best;
}

function offsetHexForPaste(base: Hex): Hex {
  lastPasteOffsetStep += 1;
  const step = lastPasteOffsetStep;
  const dir = Hex.directions[(step - 1) % Hex.directions.length];
  const dist = Math.floor((step - 1) / Hex.directions.length) + 1;
  const candidate = base.add(new Hex(dir.q * dist, dir.r * dist));
  return grid.has(candidate) ? candidate : base;
}

const BIG_HEX_DIRECTIONS = [
  new Hex(3, -1),
  new Hex(1, 2),
  new Hex(-2, 3),
  new Hex(-3, 1),
  new Hex(-1, -2),
  new Hex(2, -3),
];

function offsetHexonCenterForPaste(base: Hex): Hex {
  lastPasteOffsetStep += 1;
  const step = lastPasteOffsetStep;
  const dir = BIG_HEX_DIRECTIONS[(step - 1) % BIG_HEX_DIRECTIONS.length];
  const dist = Math.floor((step - 1) / BIG_HEX_DIRECTIONS.length) + 1;
  const candidate = base.add(new Hex(dir.q * dist, dir.r * dist));
  return allHexonCenters.some((c) => c.key === candidate.key) ? candidate : base;
}

function cursorWorldOnCanvas(): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect();
  if (
    pointerScreenX < r.left ||
    pointerScreenX >= r.right ||
    pointerScreenY < r.top ||
    pointerScreenY >= r.bottom
  ) {
    return null;
  }
  return screenToBoardWorld(pointerScreenX, pointerScreenY);
}

function copySelected(): void {
  const sel = getSelectedEntity();
  if (!sel) return;
  if (sel.kind === 'godTable' || sel.kind === 'inventoryTable') return;
  if (sel.kind === 'small') {
    const unit = units[sel.index];
    const card = unitCardData[sel.index];
    clipboardEntity = {
      kind: 'small',
      unit: { ...unit, position: new Hex(unit.position.q, unit.position.r) },
      card: structuredClone(card),
    };
    return;
  }
  if (sel.kind === 'big') {
    const unit = bigMiniatures[sel.index];
    const card = bigMiniCardData[sel.index];
    clipboardEntity = {
      kind: 'big',
      unit: { ...unit, center: new Hex(unit.center.q, unit.center.r) },
      card: structuredClone(card),
    };
    return;
  }
  if (sel.kind === 'large') {
    const unit = largeMiniatures[sel.index];
    const card = largeMiniCardData[sel.index];
    clipboardEntity = {
      kind: 'large',
      unit: { ...unit, anchor: new Hex(unit.anchor.q, unit.anchor.r) },
      card: structuredClone(card),
    };
    return;
  }
  if (sel.kind === 'huge') {
    const unit = hugeMiniatures[sel.index];
    const card = hugeMiniCardData[sel.index];
    clipboardEntity = {
      kind: 'huge',
      unit: { ...unit, anchor: new Hex(unit.anchor.q, unit.anchor.r) },
      card: structuredClone(card),
    };
    return;
  }
  if (sel.kind === 'etherVortex') {
    const v = etherVortexes[sel.index];
    clipboardEntity = {
      kind: 'etherVortex',
      state: {
        center: new Hex(v.center.q, v.center.r),
        etherCrystals: v.etherCrystals,
        domain: v.domain,
        rotationDeg: v.rotationDeg,
        offBoardWorld: v.offBoardWorld ? { ...v.offBoardWorld } : undefined,
      },
    };
    return;
  }
  const t = terrains[sel.index];
  clipboardEntity = {
    kind: 'terrain',
    center: new Hex(t.q, t.r),
    rotationDeg: terrainRotationDegs[sel.index] ?? 0,
  };
}

function pasteClipboard(): void {
  if (!clipboardEntity) return;
  if (clipboardEntity.kind === 'small') {
    const cursorHex = hexUnderGlobalPointer();
    let nextPos = cursorHex ?? offsetHexForPaste(clipboardEntity.unit.position);
    if (units.some((u) => u.position.key === nextPos.key)) {
      nextPos = offsetHexForPaste(clipboardEntity.unit.position);
    }
    if (!grid.has(nextPos) || units.some((u) => u.position.key === nextPos.key)) return;
    units.push({
      ...clipboardEntity.unit,
      ...rosterPasteOwnerOverride(clipboardEntity.unit),
      position: nextPos,
      effectMarkers: new Set(clipboardEntity.unit.effectMarkers),
    });
    unitCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedUnitIndex = units.length - 1;
    armyBuilderPanel.refresh();
    return;
  }
  if (clipboardEntity.kind === 'big') {
    const cursorWorld = cursorWorldOnCanvas();
    const nextCenter = cursorWorld
      ? nearestHexonCenterFromWorld(cursorWorld)
      : offsetHexonCenterForPaste(clipboardEntity.unit.center);
    bigMiniatures.push({
      ...clipboardEntity.unit,
      ...rosterPasteOwnerOverride(clipboardEntity.unit),
      center: nextCenter,
      effectMarkers: new Set(clipboardEntity.unit.effectMarkers),
    });
    bigMiniCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedBigMiniIndex = bigMiniatures.length - 1;
    armyBuilderPanel.refresh();
    return;
  }
  if (clipboardEntity.kind === 'large') {
    const cursorHex = hexUnderGlobalPointer();
    const cursorWorld = cursorWorldOnCanvas();
    let nextAnchor: Hex;
    const pasteRot = clipboardEntity.unit.rotationDeg;
    if (cursorHex && cursorWorld) {
      const best = bestLargeMiniAnchorForPointer(cursorHex, cursorWorld, -1, pasteRot);
      if (best) nextAnchor = best;
      else if (canPlaceLargeMiniAt(cursorHex, -1, pasteRot)) nextAnchor = cursorHex;
      else nextAnchor = offsetHexForPaste(clipboardEntity.unit.anchor);
    } else if (cursorHex) {
      nextAnchor = canPlaceLargeMiniAt(cursorHex, -1, pasteRot)
        ? cursorHex
        : offsetHexForPaste(clipboardEntity.unit.anchor);
    } else {
      nextAnchor = offsetHexForPaste(clipboardEntity.unit.anchor);
    }
    if (!canPlaceLargeMiniAt(nextAnchor, -1, pasteRot)) return;
    largeMiniatures.push({
      ...clipboardEntity.unit,
      ...rosterPasteOwnerOverride(clipboardEntity.unit),
      anchor: nextAnchor,
      effectMarkers: new Set(clipboardEntity.unit.effectMarkers),
    });
    largeMiniCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedLargeMiniIndex = largeMiniatures.length - 1;
    armyBuilderPanel.refresh();
    return;
  }
  if (clipboardEntity.kind === 'huge') {
    const cursorHex = hexUnderGlobalPointer();
    const cursorWorld = cursorWorldOnCanvas();
    let nextAnchor: Hex;
    const pasteRot = clipboardEntity.unit.rotationDeg;
    if (cursorHex && cursorWorld) {
      const best = bestHugeMiniAnchorForPointer(cursorHex, cursorWorld, -1, pasteRot);
      if (best) nextAnchor = best;
      else nextAnchor = nearestHexonCenterFromWorld(cursorWorld);
    } else if (cursorWorld) {
      nextAnchor = nearestHexonCenterFromWorld(cursorWorld);
    } else {
      nextAnchor = offsetHexonCenterForPaste(clipboardEntity.unit.anchor);
    }
    if (!canPlaceHugeMiniAt(nextAnchor, -1, pasteRot)) return;
    hugeMiniatures.push({
      ...clipboardEntity.unit,
      ...rosterPasteOwnerOverride(clipboardEntity.unit),
      anchor: nextAnchor,
      effectMarkers: new Set(clipboardEntity.unit.effectMarkers),
    });
    hugeMiniCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedHugeMiniIndex = hugeMiniatures.length - 1;
    armyBuilderPanel.refresh();
    return;
  }
  if (clipboardEntity.kind === 'etherVortex') {
    const s = clipboardEntity.state;
    const cursorWorld = cursorWorldOnCanvas();
    const nextCenter = cursorWorld
      ? nearestHexonCenterFromWorld(cursorWorld)
      : offsetHexonCenterForPaste(s.center);
    etherVortexes.push({
      center: nextCenter,
      etherCrystals: s.etherCrystals,
      domain: s.domain,
      rotationDeg: s.rotationDeg ?? 0,
    });
    clearSelection();
    selectedEtherVortexIndex = etherVortexes.length - 1;
    return;
  }
  const base = clipboardEntity.center;
  const cursorWorld = cursorWorldOnCanvas();
  const nextCenter = cursorWorld
    ? nearestHexonCenterFromWorld(cursorWorld)
    : offsetHexonCenterForPaste(base);
  terrains.push(nextCenter);
  terrainOffBoardWorlds.push(undefined);
  terrainRotationDegs.push(clipboardEntity.rotationDeg);
  clearSelection();
  selectedTerrainIndex = terrains.length - 1;
}

function duplicateSelected(): void {
  copySelected();
  pasteClipboard();
}

function deleteSelected(): void {
  const sel = getSelectedEntity();
  if (!sel) return;
  if (sel.kind === 'godTable') {
    removeGodTablePieceAtIndex(sel.index);
    clearSelection();
    armyBuilderPanel.refresh();
    return;
  }
  if (sel.kind === 'inventoryTable') {
    removeInventoryTablePieceAtIndex(sel.index);
    clearSelection();
    armyBuilderPanel.refresh();
    notifyBoardEditLocal();
    return;
  }
  if (sel.kind === 'small') {
    units.splice(sel.index, 1);
    unitCardData.splice(sel.index, 1);
    clearSelection();
    armyBuilderPanel.refresh();
    return;
  }
  if (sel.kind === 'big') {
    bigMiniatures.splice(sel.index, 1);
    bigMiniCardData.splice(sel.index, 1);
    clearSelection();
    armyBuilderPanel.refresh();
    return;
  }
  if (sel.kind === 'large') {
    largeMiniatures.splice(sel.index, 1);
    largeMiniCardData.splice(sel.index, 1);
    clearSelection();
    armyBuilderPanel.refresh();
    return;
  }
  if (sel.kind === 'huge') {
    hugeMiniatures.splice(sel.index, 1);
    hugeMiniCardData.splice(sel.index, 1);
    clearSelection();
    armyBuilderPanel.refresh();
    return;
  }
  if (sel.kind === 'etherVortex') {
    etherVortexes.splice(sel.index, 1);
    clearSelection();
    return;
  }
  terrains.splice(sel.index, 1);
  terrainOffBoardWorlds.splice(sel.index, 1);
  terrainRotationDegs.splice(sel.index, 1);
  clearSelection();
}

function boardWorldToScreen(world: { x: number; y: number }): { x: number; y: number } {
  const boardCenter = getBoardCenterWorld();
  const angleRad = (effectiveBoardRotationDeg() * Math.PI) / 180;
  const dx = world.x - boardCenter.x;
  const dy = world.y - boardCenter.y;
  const rotatedX = boardCenter.x + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
  const rotatedY = boardCenter.y + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
  return {
    x: rotatedX * camera.zoom + camera.offsetX,
    y: rotatedY * camera.zoom + camera.offsetY,
  };
}

/** Общие размеры/центр декоративных слоёв «поле» (пустыня + сетка). */
function getBoardDecorOverlayLayoutPx(): {
  center: { x: number; y: number };
  widthPx: number;
  heightPx: number;
} {
  const ext = getBoardWorldExtentsForGodBlind();
  const center = boardWorldToScreen({ x: ext.cx, y: ext.cy });
  const boardWorldWidth = ext.maxX - ext.minX + HEX_SIZE * 3;
  const boardWorldHeight = ext.maxY - ext.minY + HEX_SIZE * 3;
  const autoW = Math.max(1, boardWorldWidth * camera.zoom);
  const autoH = Math.max(1, boardWorldHeight * camera.zoom);
  const widthPx =
    gridOverlayManualWidthPx != null ? Math.max(1, gridOverlayManualWidthPx) : autoW;
  const heightPx =
    gridOverlayManualHeightPx != null ? Math.max(1, gridOverlayManualHeightPx) : autoH;
  return { center, widthPx, heightPx };
}

function updateBoardDesertUnderlayTransform(): void {
  const { center, widthPx, heightPx } = getBoardDecorOverlayLayoutPx();
  const visualRotation = effectiveBoardRotationDeg() + desertUnderlayExtraRotationDeg;
  boardDesertUnderlay.style.left = `${center.x}px`;
  boardDesertUnderlay.style.top = `${center.y}px`;
  boardDesertUnderlay.style.width = `${widthPx}px`;
  boardDesertUnderlay.style.height = `${heightPx}px`;
  boardDesertUnderlay.style.transform = `translate(-50%, -50%) rotate(${visualRotation}deg)`;
}

function updateBoardGridOverlayTransform(): void {
  const { center, widthPx, heightPx } = getBoardDecorOverlayLayoutPx();
  const visualRotation = effectiveBoardRotationDeg() + GRID_OVERLAY_EXTRA_ROTATION_DEG;

  boardGridOverlay.style.left = `${center.x + gridOverlayOffsetScreenX}px`;
  boardGridOverlay.style.top = `${center.y + gridOverlayOffsetScreenY}px`;
  boardGridOverlay.style.width = `${widthPx}px`;
  boardGridOverlay.style.height = `${heightPx}px`;
  boardGridOverlay.style.transform = `translate(-50%, -50%) rotate(${visualRotation}deg)`;
}

function smallUnitHexHalfExtent(): { halfW: number; halfH: number } {
  const offs = [0, 1, 2, 3, 4, 5].map((i) => layout.hexCornerOffset(i));
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const o of offs) {
    if (Math.abs(o.x) > maxAbsX) maxAbsX = Math.abs(o.x);
    if (Math.abs(o.y) > maxAbsY) maxAbsY = Math.abs(o.y);
  }
  return { halfW: maxAbsX, halfH: maxAbsY };
}

function getUnitHealthUiGeometry(unitIndex: number): {
  badgeCenter: { x: number; y: number };
  badgeRadius: number;
  minusCenter: { x: number; y: number };
  plusCenter: { x: number; y: number };
  buttonRadius: number;
} {
  const { halfH } = smallUnitHexHalfExtent();
  const draggingPreview =
    draggingUnitIndex === unitIndex && dragPreviewPosition !== null;
  const unitCenterWorld = draggingPreview
    ? dragPreviewPosition!
    : layout.hexToPixel(units[unitIndex].position);
  const rotRad = unitRotationRadForMiniatureLocalUi(units[unitIndex].rotationDeg);
  const expanded = openHealthControlsUnitIndex === unitIndex;
  const effectiveR =
    halfH *
    SMALL_UNIT_HEALTH_BADGE_SCALE *
    (expanded ? SMALL_UNIT_HEALTH_BADGE_EXPAND_WHEN_OPEN : 1);
  const badgeCenterWorld = smallUnitHealthBadgeCenterWorldRad(
    unitCenterWorld,
    rotRad,
    layout,
  );
  const badgeRadiusWorld = effectiveR * 0.48;
  const buttonRadiusWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE;
  const buttonOffsetWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC;
  const pm = healthBadgePlusMinusCentersWorld(badgeCenterWorld, buttonOffsetWorld);
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen(pm.minus),
    plusCenter: boardWorldToScreen(pm.plus),
    buttonRadius: buttonRadiusWorld * camera.zoom,
  };
}

function getBigMiniHealthUiGeometry(
  centerWorld: { x: number; y: number },
  rotationDeg: number,
): {
  badgeCenter: { x: number; y: number };
  badgeRadius: number;
  minusCenter: { x: number; y: number };
  plusCenter: { x: number; y: number };
  buttonRadius: number;
} {
  const badgeRadiusWorld =
    Math.min(layout.size.x, layout.size.y) *
    1.58 *
    BIG_MINI_VISUAL_SCALE *
    BIG_UNIT_HEALTH_UI_SCALE *
    0.48;
  const badgeCenterWorld = bigMiniHealthBadgeCenterWorld(
    centerWorld,
    unitRotationDegForMiniatureLocalUi(rotationDeg),
    layout,
  );
  const buttonRadiusWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE;
  const buttonOffsetWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC;
  const pm = healthBadgePlusMinusCentersWorld(badgeCenterWorld, buttonOffsetWorld);
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen(pm.minus),
    plusCenter: boardWorldToScreen(pm.plus),
    buttonRadius: buttonRadiusWorld * camera.zoom,
  };
}

function bigMiniHealthCenterWorld(bigMiniIndex: number): { x: number; y: number } {
  if (
    draggingBigMiniIndex === bigMiniIndex &&
    bigMiniPreviewPosition !== null
  ) {
    return bigMiniPreviewPosition;
  }
  return layout.hexToPixel(bigMiniatures[bigMiniIndex].center);
}

function getLargeMiniHealthUiGeometry(
  anchorWorld: { x: number; y: number },
  rotationDeg: number,
): {
  badgeCenter: { x: number; y: number };
  badgeRadius: number;
  minusCenter: { x: number; y: number };
  plusCenter: { x: number; y: number };
  buttonRadius: number;
} {
  const badgeRadiusWorld =
    Math.min(layout.size.x, layout.size.y) *
    1.58 *
    LARGE_MINI_VISUAL_SCALE *
    LARGE_UNIT_HEALTH_UI_SCALE *
    0.48;
  // Model rotation only — matches renderer large tri (see drawLargeMiniatures).
  const badgeCenterWorld = largeMiniHealthBadgeCenterWorld(
    anchorWorld,
    rotationDeg,
    layout,
  );
  const buttonRadiusWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE;
  const buttonOffsetWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC;
  const pm = healthBadgePlusMinusCentersWorld(badgeCenterWorld, buttonOffsetWorld);
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen(pm.minus),
    plusCenter: boardWorldToScreen(pm.plus),
    buttonRadius: buttonRadiusWorld * camera.zoom,
  };
}

function largeMiniHealthAnchorWorld(idx: number): { x: number; y: number } {
  const m = largeMiniatures[idx]!;
  if (m.offBoardWorld) return m.offBoardWorld;
  if (draggingLargeMiniIndex === idx && largeMiniPreviewPosition !== null) {
    return largeMiniPreviewPosition;
  }
  return layout.hexToPixel(m.anchor);
}

/** Pivot used for draw + silhouette hit-test (preview / off-board aware). */
function bigMiniPivotWorldForHit(index: number): Point {
  const m = bigMiniatures[index]!;
  if (m.offBoardWorld) return m.offBoardWorld;
  if (draggingBigMiniIndex === index && bigMiniPreviewPosition !== null) {
    return bigMiniPreviewPosition;
  }
  return layout.hexToPixel(m.center);
}

function largeMiniPivotWorldForHit(index: number): Point {
  const m = largeMiniatures[index]!;
  if (m.offBoardWorld) return m.offBoardWorld;
  if (draggingLargeMiniIndex === index && largeMiniPreviewPosition !== null) {
    return largeMiniPreviewPosition;
  }
  return layout.hexToPixel(m.anchor);
}

function getHugeMiniHealthUiGeometry(
  anchorWorld: { x: number; y: number },
  rotationDeg: number,
): {
  badgeCenter: { x: number; y: number };
  badgeRadius: number;
  minusCenter: { x: number; y: number };
  plusCenter: { x: number; y: number };
  buttonRadius: number;
} {
  const badgeRadiusWorld =
    Math.min(layout.size.x, layout.size.y) *
    1.58 *
    HUGE_MINI_VISUAL_SCALE *
    HUGE_UNIT_HEALTH_UI_SCALE *
    0.48;
  const badgeCenterWorld = hugeMiniHealthBadgeCenterWorld(
    anchorWorld,
    unitRotationDegForMiniatureLocalUi(rotationDeg),
    layout,
  );
  const buttonRadiusWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_BUTTON_RADIUS_FRAC_OF_BADGE;
  const buttonOffsetWorld =
    badgeRadiusWorld * HEALTH_PLUS_MINUS_OFFSET_FROM_BADGE_CENTER_FRAC;
  const pm = healthBadgePlusMinusCentersWorld(badgeCenterWorld, buttonOffsetWorld);
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen(pm.minus),
    plusCenter: boardWorldToScreen(pm.plus),
    buttonRadius: buttonRadiusWorld * camera.zoom,
  };
}

function hugeMiniHealthAnchorWorld(idx: number): { x: number; y: number } {
  const m = hugeMiniatures[idx]!;
  if (draggingHugeMiniIndex === idx && hugeMiniPreviewPosition !== null) {
    return hugeMiniPreviewPosition;
  }
  if (m.offBoardWorld) return m.offBoardWorld;
  return hugeMiniDrawPivotWorld(m.anchor, m.rotationDeg, layout);
}

function isPointInCircle(
  pointX: number,
  pointY: number,
  center: { x: number; y: number },
  radius: number,
): boolean {
  const dx = pointX - center.x;
  const dy = pointY - center.y;
  return dx * dx + dy * dy <= radius * radius;
}

function unitCenterWorldForHud(unitIndex: number): Point {
  const u = units[unitIndex]!;
  if (draggingUnitIndex === unitIndex && dragPreviewPosition !== null) {
    return dragPreviewPosition;
  }
  return u.offBoardWorld ?? layout.hexToPixel(u.position);
}

function getUnitActivationToggleGeometry(unitIndex: number): {
  center: Point;
  radiusScreen: number;
} {
  const { halfH } = smallUnitHexHalfExtent();
  const cw = unitCenterWorldForHud(unitIndex);
  const rotRad = unitRotationRadForMiniatureLocalUi(units[unitIndex]!.rotationDeg);
  const world = smallUnitActivationToggleCenterWorldRad(cw, rotRad, layout);
  const rw = halfH * 0.2175;
  return {
    center: boardWorldToScreen(world),
    radiusScreen: rw * camera.zoom,
  };
}

function bigActivationToggleRadiusWorld(): number {
  return (
    Math.min(layout.size.x, layout.size.y) *
    1.58 *
    BIG_MINI_VISUAL_SCALE *
    0.22
  );
}

function getBigMiniActivationToggleGeometry(
  centerWorld: Point,
  rotationDeg: number,
): { center: Point; radiusScreen: number } {
  const w = bigMiniActivationToggleCenterWorld(
    centerWorld,
    unitRotationDegForMiniatureLocalUi(rotationDeg),
    layout,
  );
  const rw = bigActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function largeActivationToggleRadiusWorld(): number {
  return (
    Math.min(layout.size.x, layout.size.y) *
    1.2 *
    LARGE_MINI_VISUAL_SCALE *
    0.22
  );
}

function getLargeMiniActivationToggleGeometry(
  anchorWorld: Point,
  rotationDeg: number,
): { center: Point; radiusScreen: number } {
  const w = largeMiniActivationToggleCenterWorld(anchorWorld, rotationDeg, layout);
  const rw = largeActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function hugeActivationToggleRadiusWorld(): number {
  return (
    Math.min(layout.size.x, layout.size.y) *
    1.58 *
    HUGE_MINI_VISUAL_SCALE *
    0.22
  );
}

function getHugeMiniActivationToggleGeometry(
  pivotWorld: Point,
  rotationDeg: number,
): { center: Point; radiusScreen: number } {
  const w = hugeMiniActivationToggleCenterFromPivotWorld(
    pivotWorld,
    unitRotationDegForMiniatureLocalUi(rotationDeg),
    layout,
  );
  const rw = hugeActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function getUnitBroomgarHungerGeometry(unitIndex: number): { center: Point; radiusScreen: number } {
  const { halfH } = smallUnitHexHalfExtent();
  const cw = unitCenterWorldForHud(unitIndex);
  const rotRad = unitRotationRadForMiniatureLocalUi(units[unitIndex]!.rotationDeg);
  const world = smallUnitBroomgarHungerCenterWorldRad(cw, rotRad, layout);
  const rw = halfH * 0.2175;
  return {
    center: boardWorldToScreen(world),
    radiusScreen: rw * camera.zoom,
  };
}

function getBigMiniBroomgarHungerGeometry(bigMiniIndex: number): { center: Point; radiusScreen: number } {
  const rotDeg = bigMiniatures[bigMiniIndex]!.rotationDeg;
  const rotDegVis = unitRotationDegForMiniatureLocalUi(rotDeg);
  const cw = bigMiniHealthCenterWorld(bigMiniIndex);
  const w = bigMiniBroomgarHungerCenterWorld(cw, rotDegVis, layout);
  const rw = bigActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function getLargeMiniBroomgarHungerGeometry(largeIdx: number): { center: Point; radiusScreen: number } {
  const anchorWorld = largeMiniHealthAnchorWorld(largeIdx);
  const rotDeg = largeMiniatures[largeIdx]!.rotationDeg;
  const w = largeMiniBroomgarHungerCenterWorld(anchorWorld, rotDeg, layout);
  const rw = largeActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function getHugeMiniBroomgarHungerGeometry(hugeIdx: number): { center: Point; radiusScreen: number } {
  const pivotWorld = hugeMiniHealthAnchorWorld(hugeIdx);
  const rotDeg = hugeMiniatures[hugeIdx]!.rotationDeg;
  const w = hugeMiniBroomgarHungerCenterFromPivotWorld(pivotWorld, rotDeg, layout);
  const rw = hugeActivationToggleRadiusWorld();
  return { center: boardWorldToScreen(w), radiusScreen: rw * camera.zoom };
}

function handleBroomgarHungerClick(screenX: number, screenY: number): boolean {
  for (let i = 0; i < units.length; i++) {
    const ph = units[i]!.broomgarHungerPhase;
    if (ph === undefined) continue;
    const g = getUnitBroomgarHungerGeometry(i);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      units[i]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
  }
  for (let i = 0; i < bigMiniatures.length; i++) {
    const ph = bigMiniatures[i]!.broomgarHungerPhase;
    if (ph === undefined) continue;
    const g = getBigMiniBroomgarHungerGeometry(i);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      bigMiniatures[i]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
  }
  for (let i = 0; i < largeMiniatures.length; i++) {
    const ph = largeMiniatures[i]!.broomgarHungerPhase;
    if (ph === undefined) continue;
    const g = getLargeMiniBroomgarHungerGeometry(i);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      largeMiniatures[i]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
  }
  for (let i = 0; i < hugeMiniatures.length; i++) {
    const ph = hugeMiniatures[i]!.broomgarHungerPhase;
    if (ph === undefined) continue;
    const g = getHugeMiniBroomgarHungerGeometry(i);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      hugeMiniatures[i]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
  }
  return false;
}

function handleMiniatureActivationClick(screenX: number, screenY: number): boolean {
  for (let i = 0; i < units.length; i++) {
    const g = getUnitActivationToggleGeometry(i);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      units[i]!.activated = units[i]!.activated === false;
      return true;
    }
  }
  for (let i = 0; i < largeMiniatures.length; i++) {
    const g = getLargeMiniActivationToggleGeometry(
      largeMiniHealthAnchorWorld(i),
      largeMiniatures[i]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      largeMiniatures[i]!.activated = largeMiniatures[i]!.activated === false;
      return true;
    }
  }
  for (let i = 0; i < hugeMiniatures.length; i++) {
    const g = getHugeMiniActivationToggleGeometry(
      hugeMiniHealthAnchorWorld(i),
      hugeMiniatures[i]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      hugeMiniatures[i]!.activated = hugeMiniatures[i]!.activated === false;
      return true;
    }
  }
  for (let i = 0; i < bigMiniatures.length; i++) {
    const g = getBigMiniActivationToggleGeometry(
      bigMiniHealthCenterWorld(i),
      bigMiniatures[i]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      bigMiniatures[i]!.activated = bigMiniatures[i]!.activated === false;
      return true;
    }
  }
  return false;
}

/** LMB on ether chip: open compact − / + popover. */
function tryEtherVortexCrystalBadgeOpen(screenX: number, screenY: number): boolean {
  const w = screenToBoardWorld(screenX, screenY);
  const hitR = etherVortexCrystalBadgeHitRadiusWorld(layout);
  const hitR2 = (hitR * 1.08) ** 2;
  for (let i = 0; i < etherVortexes.length; i++) {
    const v = etherVortexes[i]!;
    const pivot =
      draggingEtherVortexIndex === i && isDraggingEtherVortex && etherVortexPreviewWorld
        ? etherVortexPreviewWorld
        : (v.offBoardWorld ?? layout.hexToPixel(v.center));
    const badge = renderer.getEtherVortexCrystalBadgeBoardAtPivot(pivot, v.rotationDeg);
    const dx = w.x - badge.x;
    const dy = w.y - badge.y;
    if (dx * dx + dy * dy <= hitR2) {
      const scr = boardWorldToScreen(badge);
      etherVortexMenu.hide();
      clearSelection();
      selectedEtherVortexIndex = i;
      etherVortexDragPending = false;
      etherVortexDragPendingIndex = null;
      etherVortexCrystalPopover.show(scr.x, scr.y, {
        getCrystalCount: () => v.etherCrystals,
        onCrystalsDelta: (delta) => {
          v.etherCrystals = Math.max(0, v.etherCrystals + delta);
          scheduleRender();
        },
      });
      return true;
    }
  }
  return false;
}

function handleMiniatureHealthClick(screenX: number, screenY: number): boolean {
  if (openHealthControlsUnitIndex !== null) {
    const openGeom = getUnitHealthUiGeometry(openHealthControlsUnitIndex);
    if (isPointInCircle(screenX, screenY, openGeom.minusCenter, openGeom.buttonRadius)) {
      units[openHealthControlsUnitIndex].health = Math.max(
        UNIT_HEALTH_MIN,
        units[openHealthControlsUnitIndex].health - 1,
      );
      return true;
    }
    if (isPointInCircle(screenX, screenY, openGeom.plusCenter, openGeom.buttonRadius)) {
      units[openHealthControlsUnitIndex].health += 1;
      return true;
    }
  }

  if (openHealthControlsBigMiniIndex !== null) {
    const bi = openHealthControlsBigMiniIndex;
    const openGeom = getBigMiniHealthUiGeometry(
      bigMiniHealthCenterWorld(bi),
      bigMiniatures[bi].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, openGeom.minusCenter, openGeom.buttonRadius)) {
      bigMiniatures[openHealthControlsBigMiniIndex].health = Math.max(
        UNIT_HEALTH_MIN,
        bigMiniatures[openHealthControlsBigMiniIndex].health - 1,
      );
      return true;
    }
    if (isPointInCircle(screenX, screenY, openGeom.plusCenter, openGeom.buttonRadius)) {
      bigMiniatures[openHealthControlsBigMiniIndex].health += 1;
      return true;
    }
  }

  if (openHealthControlsLargeMiniIndex !== null) {
    const li = openHealthControlsLargeMiniIndex;
    const openGeom = getLargeMiniHealthUiGeometry(
      largeMiniHealthAnchorWorld(li),
      largeMiniatures[li].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, openGeom.minusCenter, openGeom.buttonRadius)) {
      largeMiniatures[li].health = Math.max(UNIT_HEALTH_MIN, largeMiniatures[li].health - 1);
      return true;
    }
    if (isPointInCircle(screenX, screenY, openGeom.plusCenter, openGeom.buttonRadius)) {
      largeMiniatures[li].health += 1;
      return true;
    }
  }

  if (openHealthControlsHugeMiniIndex !== null) {
    const hi = openHealthControlsHugeMiniIndex;
    const openGeom = getHugeMiniHealthUiGeometry(
      hugeMiniHealthAnchorWorld(hi),
      hugeMiniatures[hi].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, openGeom.minusCenter, openGeom.buttonRadius)) {
      hugeMiniatures[hi].health = Math.max(UNIT_HEALTH_MIN, hugeMiniatures[hi].health - 1);
      return true;
    }
    if (isPointInCircle(screenX, screenY, openGeom.plusCenter, openGeom.buttonRadius)) {
      hugeMiniatures[hi].health += 1;
      return true;
    }
  }

  for (let i = 0; i < units.length; i++) {
    const geom = getUnitHealthUiGeometry(i);
    if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
      openHealthControlsUnitIndex = i;
      openHealthControlsBigMiniIndex = null;
      openHealthControlsLargeMiniIndex = null;
      openHealthControlsHugeMiniIndex = null;
      return true;
    }
  }

  for (let i = 0; i < bigMiniatures.length; i++) {
    if (draggingBigMiniIndex === i && bigMiniPreviewPosition !== null) {
      const geom = getBigMiniHealthUiGeometry(
        bigMiniPreviewPosition,
        bigMiniatures[i].rotationDeg,
      );
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsBigMiniIndex = i;
        openHealthControlsUnitIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        return true;
      }
      continue;
    }
    const geom = getBigMiniHealthUiGeometry(
      layout.hexToPixel(bigMiniatures[i].center),
      bigMiniatures[i].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
      openHealthControlsBigMiniIndex = i;
      openHealthControlsUnitIndex = null;
      openHealthControlsLargeMiniIndex = null;
      openHealthControlsHugeMiniIndex = null;
      return true;
    }
  }

  for (let i = 0; i < largeMiniatures.length; i++) {
    const geom = getLargeMiniHealthUiGeometry(
      largeMiniHealthAnchorWorld(i),
      largeMiniatures[i].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
      openHealthControlsLargeMiniIndex = i;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      openHealthControlsHugeMiniIndex = null;
      return true;
    }
  }

  for (let i = 0; i < hugeMiniatures.length; i++) {
    const geom = getHugeMiniHealthUiGeometry(
      hugeMiniHealthAnchorWorld(i),
      hugeMiniatures[i].rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
      openHealthControlsHugeMiniIndex = i;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      openHealthControlsLargeMiniIndex = null;
      return true;
    }
  }

  if (
    openHealthControlsUnitIndex !== null ||
    openHealthControlsBigMiniIndex !== null ||
    openHealthControlsLargeMiniIndex !== null ||
    openHealthControlsHugeMiniIndex !== null
  ) {
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    return true;
  }
  return false;
}

// ── Input: pointer hover + board drag (touch-safe via pointer events) ─

let effectMarkerLongPressTimer: ReturnType<typeof setTimeout> | null = null;
let effectMarkerLongPressStartX = 0;
let effectMarkerLongPressStartY = 0;

function clearEffectMarkerLongPressTimer(): void {
  if (effectMarkerLongPressTimer !== null) {
    clearTimeout(effectMarkerLongPressTimer);
    effectMarkerLongPressTimer = null;
  }
}

let godLooseLastTapMs = 0;
let godLooseLastTapX = 0;
let godLooseLastTapY = 0;
let godLooseLastTapGodIndex: number | null = null;

let unitCardDoubleTapLastKey: string | null = null;
let unitCardDoubleTapLastMs = 0;
let unitCardDoubleTapLastX = 0;
let unitCardDoubleTapLastY = 0;
/** After touch double-tap opens card, skip duplicate mousedown handling. */
let touchUnitDoubleTapSuppressMouseDown = false;

/** Hit test for small/big/large/huge (on- or off-board); order matches canvas mousedown. */
function resolveMiniatureTapKeyForDoubleTap(clientX: number, clientY: number): string | null {
  const hex = hexAtScreen(clientX, clientY);
  if (!hex) {
    const obUnit = findOffBoardUnitAtScreen(clientX, clientY);
    if (obUnit !== -1) return `os:${obUnit}`;
    const obBig = findOffBoardBigMiniAtScreen(clientX, clientY);
    if (obBig !== -1) return `ob:${obBig}`;
    const obLarge = findOffBoardLargeMiniAtScreen(clientX, clientY);
    if (obLarge !== -1) return `ol:${obLarge}`;
    const obHuge = findOffBoardHugeMiniAtScreen(clientX, clientY);
    if (obHuge !== -1) return `oh:${obHuge}`;
    return null;
  }
  if (altModActive()) {
    const altTerrainIdx = findTerrainAtHex(hex);
    if (altTerrainIdx !== -1) return null;
  }
  const clickedUnitIndex = units.findIndex((unit) => unit.position.key === hex.key);
  if (clickedUnitIndex !== -1) return `s:${clickedUnitIndex}`;
  const wTap = screenToBoardWorld(clientX, clientY);
  const bigMiniIdx = findBigMiniAtHex(hex);
  if (
    bigMiniIdx !== -1 &&
    isWorldPointInBigMiniSilhouette(
      wTap,
      bigMiniPivotWorldForHit(bigMiniIdx),
      bigMiniatures[bigMiniIdx]!.rotationDeg,
      layout,
    )
  ) {
    return `b:${bigMiniIdx}`;
  }
  const largeMiniIdx = findLargeMiniAtHex(hex);
  if (
    largeMiniIdx !== -1 &&
    isWorldPointInLargeMiniSilhouette(
      wTap,
      largeMiniPivotWorldForHit(largeMiniIdx),
      largeMiniatures[largeMiniIdx]!.rotationDeg,
      layout,
    )
  ) {
    return `l:${largeMiniIdx}`;
  }
  const hugeMiniIdx = resolveHugeMiniIndexAtPointer(hex, wTap);
  if (hugeMiniIdx !== -1) return `h:${hugeMiniIdx}`;
  return null;
}

function applyTouchDoubleTapUnitCard(key: string, clientX: number, clientY: number): void {
  if (key.startsWith('os:')) {
    const n = Number(key.slice(3));
    if (Number.isNaN(n)) return;
    bigMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    selectedEtherVortexIndex = null;
    unitDragPendingIndex = n;
    unitDragPendingStartX = clientX;
    unitDragPendingStartY = clientY;
    unitDragPendingIsNewSelection = selectedUnitIndex !== n;
    if (unitDragPendingIsNewSelection) {
      selectedUnitIndex = n;
      selectedBigMiniIndex = null;
      selectedTerrainIndex = null;
      selectedGodTablePieceIndex = null;
      selectedInventoryTablePieceIndex = null;
      updateBigMiniMovementHighlights();
      updateMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('ob:')) {
    const n = Number(key.slice(3));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    selectedEtherVortexIndex = null;
    bigMiniDragPendingIndex = n;
    bigMiniDragPendingStartX = clientX;
    bigMiniDragPendingStartY = clientY;
    if (selectedBigMiniIndex !== n) {
      selectedUnitIndex = null;
      updateMovementHighlights();
      selectedBigMiniIndex = n;
      selectedTerrainIndex = null;
      selectedGodTablePieceIndex = null;
      selectedInventoryTablePieceIndex = null;
      updateBigMiniMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('ol:')) {
    const n = Number(key.slice(3));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    bigMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    selectedEtherVortexIndex = null;
    largeMiniDragPendingIndex = n;
    largeMiniDragPendingStartX = clientX;
    largeMiniDragPendingStartY = clientY;
    if (selectedLargeMiniIndex !== n) {
      selectedUnitIndex = null;
      selectedBigMiniIndex = null;
      selectedHugeMiniIndex = null;
      selectedTerrainIndex = null;
      selectedGodTablePieceIndex = null;
      selectedInventoryTablePieceIndex = null;
      selectedLargeMiniIndex = n;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      updateLargeMiniMovementHighlights();
      updateHugeMiniMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('oh:')) {
    const n = Number(key.slice(3));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    bigMiniDragPendingIndex = null;
    largeMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    selectedEtherVortexIndex = null;
    hugeMiniDragPendingIndex = n;
    hugeMiniDragPendingStartX = clientX;
    hugeMiniDragPendingStartY = clientY;
    if (selectedHugeMiniIndex !== n) {
      selectedUnitIndex = null;
      selectedBigMiniIndex = null;
      selectedLargeMiniIndex = null;
      selectedTerrainIndex = null;
      selectedGodTablePieceIndex = null;
      selectedInventoryTablePieceIndex = null;
      selectedHugeMiniIndex = n;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      updateLargeMiniMovementHighlights();
      updateHugeMiniMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('s:')) {
    const n = Number(key.slice(2));
    if (Number.isNaN(n)) return;
    bigMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    selectedEtherVortexIndex = null;
    unitDragPendingIndex = n;
    unitDragPendingStartX = clientX;
    unitDragPendingStartY = clientY;
    unitDragPendingIsNewSelection = selectedUnitIndex !== n;
    if (unitDragPendingIsNewSelection) {
      selectedUnitIndex = n;
      selectedBigMiniIndex = null;
      selectedLargeMiniIndex = null;
      selectedHugeMiniIndex = null;
      selectedTerrainIndex = null;
      selectedGodTablePieceIndex = null;
      selectedInventoryTablePieceIndex = null;
      updateBigMiniMovementHighlights();
      updateMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('b:')) {
    const n = Number(key.slice(2));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    largeMiniDragPendingIndex = null;
    hugeMiniDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    selectedEtherVortexIndex = null;
    bigMiniDragPendingIndex = n;
    bigMiniDragPendingStartX = clientX;
    bigMiniDragPendingStartY = clientY;
    if (selectedBigMiniIndex !== n) {
      clearSelection();
      selectedBigMiniIndex = n;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('l:')) {
    const n = Number(key.slice(2));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    bigMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    hugeMiniDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    selectedEtherVortexIndex = null;
    largeMiniDragPendingIndex = n;
    largeMiniDragPendingStartX = clientX;
    largeMiniDragPendingStartY = clientY;
    if (selectedLargeMiniIndex !== n) {
      clearSelection();
      selectedLargeMiniIndex = n;
      updateMovementHighlights();
      updateLargeMiniMovementHighlights();
    }
    showSelectedDetails = true;
    return;
  }
  if (key.startsWith('h:')) {
    const n = Number(key.slice(2));
    if (Number.isNaN(n)) return;
    unitDragPendingIndex = null;
    bigMiniDragPendingIndex = null;
    largeMiniDragPendingIndex = null;
    terrainDragPendingIndex = null;
    etherVortexDragPendingIndex = null;
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    selectedEtherVortexIndex = null;
    hugeMiniDragPendingIndex = n;
    hugeMiniDragPendingStartX = clientX;
    hugeMiniDragPendingStartY = clientY;
    if (selectedHugeMiniIndex !== n) {
      clearSelection();
      selectedHugeMiniIndex = n;
      updateMovementHighlights();
      updateHugeMiniMovementHighlights();
    }
    showSelectedDetails = true;
  }
}

function tryTouchDoubleTapOnMiniatureForCard(e: PointerEvent): boolean {
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return false;
  if (e.button !== 0 || e.ctrlKey) return false;
  if (!isPointOverCanvas(e.clientX, e.clientY)) return false;
  if (armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)) return false;
  if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY)) return false;
  if (handleBroomgarHungerClick(e.clientX, e.clientY)) return false;
  if (handleMiniatureActivationClick(e.clientX, e.clientY)) return false;
  if (handleMiniatureHealthClick(e.clientX, e.clientY)) return false;
  if (godLooseHitIndex(e.clientX, e.clientY) !== null) return false;

  const key = resolveMiniatureTapKeyForDoubleTap(e.clientX, e.clientY);
  if (key === null) {
    unitCardDoubleTapLastKey = null;
    return false;
  }
  const now = Date.now();
  if (
    unitCardDoubleTapLastKey === key &&
    now - unitCardDoubleTapLastMs < UNIT_CARD_DOUBLE_TAP_MS &&
    Math.hypot(e.clientX - unitCardDoubleTapLastX, e.clientY - unitCardDoubleTapLastY) <
      UNIT_CARD_DOUBLE_TAP_DIST_PX
  ) {
    applyTouchDoubleTapUnitCard(key, e.clientX, e.clientY);
    unitCardDoubleTapLastKey = null;
    touchUnitDoubleTapSuppressMouseDown = true;
    pointerScreenX = e.clientX;
    pointerScreenY = e.clientY;
    // Passthrough = ghost + no pointer capture (only while dragging a pinned card). Docked card must stay opaque and scrollable.
    unitCard.setPassthrough(false);
    e.preventDefault();
    updateUnitCard();
    return true;
  }
  unitCardDoubleTapLastKey = key;
  unitCardDoubleTapLastMs = now;
  unitCardDoubleTapLastX = e.clientX;
  unitCardDoubleTapLastY = e.clientY;
  return false;
}

function handleCanvasPointerMove(clientX: number, clientY: number, pointerId?: number): void {
  pointerScreenX = clientX;
  pointerScreenY = clientY;
  const e: ClientXY = { clientX, clientY };
  tryPromoteGodLooseDrag(e);
  tryPromoteInventoryLooseDrag(e);
  tryPromoteUnitDragFromPending(e, pointerId);
  tryPromoteBigMiniDragFromPending(e, pointerId);
  tryPromoteLargeMiniDragFromPending(e, pointerId);
  tryPromoteHugeMiniDragFromPending(e, pointerId);
  tryPromoteTerrainDragFromPending(e, pointerId);
  tryPromoteEtherVortexDragFromPending(e, pointerId);

  const hex = hexAtScreen(clientX, clientY);
  if (!hex) {
    hoveredHexUnderPointer = null;
    renderer.setHoveredHex(null);
    refreshAltHoverTarget(null);
    refreshShiftHoverTarget(null);
    if (draggingUnitIndex !== null && !isDraggingGodLoose) {
      dragOverHex = null;
      dragPreviewPosition = screenToBoardWorld(clientX, clientY);
      renderer.setDragState(draggingUnitIndex, null, dragPreviewPosition);
    }
    if (isDraggingTerrain && !isDraggingGodLoose) {
      terrainPreviewWorld = screenToBoardWorld(clientX, clientY);
      terrainDragOverCenter = null;
      renderer.setTerrain(terrains, terrainPreviewWorld, true, draggingTerrainIndex, null, selectedTerrainIndex, terrainOffBoardWorlds);
    }
    if (draggingBigMiniIndex !== null && !isDraggingGodLoose) {
      bigMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
      bigMiniDragOverCenter = null;
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), bigMiniPreviewPosition, draggingBigMiniIndex, null, bigMiniOffBoards());
    }
    if (draggingLargeMiniIndex !== null && !isDraggingGodLoose) {
      largeMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
      largeMiniDragOverAnchor = null;
    }
    if (draggingHugeMiniIndex !== null && !isDraggingGodLoose) {
      hugeMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
      hugeMiniDragOverAnchor = null;
    }
    if (isDraggingEtherVortex && !isDraggingGodLoose) {
      etherVortexPreviewWorld = screenToBoardWorld(clientX, clientY);
      etherVortexDragOverCenter = null;
      renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, null);
    }
    if (isDraggingGodLoose) {
      godLooseDragPreviewWorld = screenToBoardWorld(clientX, clientY);
    }
    if (isDraggingInventoryLoose) {
      inventoryLooseDragPreviewWorld = screenToBoardWorld(clientX, clientY);
    }
    scheduleRender();
    return;
  }

  hoveredHexUnderPointer = hex;
  renderer.setHoveredHex(hex);
  refreshAltHoverTarget(hex);
  refreshShiftHoverTarget(hex);

  if (draggingUnitIndex !== null && !isDraggingGodLoose) {
    dragOverHex = isHexOccupiedByOtherUnit(hex, draggingUnitIndex) ? null : hex;
    dragPreviewPosition = screenToBoardWorld(clientX, clientY);
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  }
  if (isDraggingTerrain && !isDraggingGodLoose) {
    terrainPreviewWorld = screenToBoardWorld(clientX, clientY);
    terrainDragOverCenter = nearestHexonCenterFromWorld(terrainPreviewWorld);
    renderer.setTerrain(terrains, terrainPreviewWorld, true, draggingTerrainIndex, terrainDragOverCenter, selectedTerrainIndex, terrainOffBoardWorlds);
  }
  if (draggingBigMiniIndex !== null && !isDraggingGodLoose) {
    bigMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
    bigMiniDragOverCenter = nearestHexonCenterFromWorld(bigMiniPreviewPosition);
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), bigMiniPreviewPosition, draggingBigMiniIndex, bigMiniDragOverCenter, bigMiniOffBoards());
  }
  if (draggingLargeMiniIndex !== null && !isDraggingGodLoose) {
    largeMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
    largeMiniDragOverAnchor = bestLargeMiniAnchorForPointer(hex, largeMiniPreviewPosition, draggingLargeMiniIndex);
  }
  if (draggingHugeMiniIndex !== null && !isDraggingGodLoose) {
    hugeMiniPreviewPosition = screenToBoardWorld(clientX, clientY);
    hugeMiniDragOverAnchor = null;
  }
  if (isDraggingEtherVortex && !isDraggingGodLoose) {
    etherVortexPreviewWorld = screenToBoardWorld(clientX, clientY);
    etherVortexDragOverCenter = nearestHexonCenterFromWorld(etherVortexPreviewWorld);
    renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, etherVortexDragOverCenter);
  }
  if (isDraggingGodLoose) {
    godLooseDragPreviewWorld = screenToBoardWorld(clientX, clientY);
  }
  if (isDraggingInventoryLoose) {
    inventoryLooseDragPreviewWorld = screenToBoardWorld(clientX, clientY);
  }

  scheduleRender();
}

canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (!isPointOverCanvas(e.clientX, e.clientY)) return;
    activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeCanvasPointers.size === 2) {
      commitBoardDragStateAsPointerUpAt(e.clientX, e.clientY);
      clearEffectMarkerLongPressTimer();
      twoFingerCameraGesture = true;
      applyTwoFingerPinchPan();
    }
  },
  true,
);

window.addEventListener('pointermove', (e) => {
  if (effectMarkerLongPressTimer !== null) {
    const dx = e.clientX - effectMarkerLongPressStartX;
    const dy = e.clientY - effectMarkerLongPressStartY;
    if (dx * dx + dy * dy > EFFECT_MARKER_LONG_PRESS_MOVE_PX * EFFECT_MARKER_LONG_PRESS_MOVE_PX) {
      clearEffectMarkerLongPressTimer();
    }
  }
  if (isPanning) {
    camera.offsetX = e.clientX - panStartX;
    camera.offsetY = e.clientY - panStartY;
    scheduleRender();
  }
  pointerScreenX = e.clientX;
  pointerScreenY = e.clientY;
  tryPromoteGodLooseDrag(e);
  tryPromoteInventoryLooseDrag(e);
  if (isDraggingGodLoose) {
    godLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    scheduleRender();
  }
  if (isDraggingInventoryLoose) {
    inventoryLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    scheduleRender();
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (effectMarkerLongPressTimer !== null) {
    const dx = e.clientX - effectMarkerLongPressStartX;
    const dy = e.clientY - effectMarkerLongPressStartY;
    if (dx * dx + dy * dy > EFFECT_MARKER_LONG_PRESS_MOVE_PX * EFFECT_MARKER_LONG_PRESS_MOVE_PX) {
      clearEffectMarkerLongPressTimer();
    }
  }
  if (activeCanvasPointers.has(e.pointerId)) {
    activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (twoFingerCameraGesture && activeCanvasPointers.size === 2) {
    updateCameraFromTwoFingerMove();
    scheduleRender();
    return;
  }
  if (twoFingerCameraGesture) return;
  handleCanvasPointerMove(e.clientX, e.clientY, e.pointerId);
});

canvas.addEventListener('pointerleave', () => {
  hoveredHexUnderPointer = null;
  renderer.setHoveredHex(null);
  refreshAltHoverTarget(null);
  refreshShiftHoverTarget(null);
  scheduleRender();
});

// ── Army Builder: drop on board ────────────────────────────────
// Full-screen panel overlay sits above the canvas, so canvas never receives dragover/drop.
// Handle on document (capture) and only accept drops over the canvas rect (not over the panel).

function isArmyUnitDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).some(
    (t) => t === DND_MIME || t.toLowerCase() === DND_MIME.toLowerCase(),
  );
}

function isPointOverCanvas(clientX: number, clientY: number): boolean {
  const r = canvas.getBoundingClientRect();
  return clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom;
}

function releaseGodLoosePointerCaptureIfAny(): void {
  if (godLooseCapturePointerId == null) return;
  try {
    canvas.releasePointerCapture(godLooseCapturePointerId);
  } catch {
    /* not capturing */
  }
  godLooseCapturePointerId = null;
}

/** End loose god-card drag (pointerup is required — mouseup alone can be missing after canvas+DOM mixes). */
function finishGodLooseDragIfActive(e: MouseEvent | PointerEvent): void {
  if (e.button !== 0) return;
  releaseGodLoosePointerCaptureIfAny();
  if (godLooseDragPending && !isDraggingGodLoose) {
    const clickIdx = godLooseDragPendingIndex;
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDragWholeGodDeck = false;
    if (clickIdx !== null) {
      const pc = godTablePieces[clickIdx];
      if (pc?.kind === 'deck') selectedGodTablePieceIndex = clickIdx;
    }
    scheduleRender();
  }
  if (isDraggingGodLoose && godDraggingLooseIndex !== null) {
    const w =
      godLooseDragPreviewWorld ?? screenToBoardWorld(e.clientX, e.clientY);
    const idx = godDraggingLooseIndex;
    const entry = godTablePieces[idx];
    if (entry) {
      const slot = effectiveMyGodSlot();
      const pile = godPiles[slot];
      if (
        isGodDockInteractive() &&
        godBlindZoneContainsWorldForSlot(w, effectiveMyGodSlot()) &&
        entry.kind === 'single' &&
        pile.blindCardIds.length < GOD_BLIND_ZONE_MAX_CARDS
      ) {
        pile.blindCardIds.push(entry.id);
        godTablePieces.splice(idx, 1);
        if (selectedGodTablePieceIndex !== null) {
          if (selectedGodTablePieceIndex === idx) selectedGodTablePieceIndex = null;
          else if (selectedGodTablePieceIndex > idx) selectedGodTablePieceIndex -= 1;
        }
        notifyBoardEditLocal();
        refreshGodDock();
        armyBuilderPanel.refresh();
        isDraggingGodLoose = false;
        godDraggingLooseIndex = null;
        godLooseDragPreviewWorld = null;
        godLooseDragPending = false;
        godLooseDragPendingIndex = null;
        godDragWholeGodDeck = false;
        playBoardDragDrop();
        scheduleRender();
        return;
      }

      const mergeI = godPieceHitIndexFromWorld(w, idx);
      if (mergeI !== null) {
        const target = godTablePieces[mergeI]!;
        const merged = normalizeGodTablePiece(mergeGodTablePieces(entry, target));
        const hi = Math.max(idx, mergeI);
        const lo = Math.min(idx, mergeI);
        const sel = selectedGodTablePieceIndex;
        const mergedWasSelected = sel === idx || sel === mergeI;
        godTablePieces.splice(hi, 1);
        godTablePieces.splice(lo, 1);
        godTablePieces.push(merged);
        if (mergedWasSelected) selectedGodTablePieceIndex = godTablePieces.length - 1;
        else if (sel !== null) {
          let s = sel;
          if (s > hi) s -= 1;
          if (s > lo) s -= 1;
          selectedGodTablePieceIndex = s;
        }
      } else {
        godTablePieces[idx] = withGodPieceWorld(entry, w);
      }
    }
    playBoardDragDrop();
    isDraggingGodLoose = false;
    godDraggingLooseIndex = null;
    godLooseDragPreviewWorld = null;
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDragWholeGodDeck = false;
    scheduleRender();
  }
}

function finishInventoryLooseDragIfActive(e: MouseEvent | PointerEvent): void {
  if (e.button !== 0) return;
  if (inventoryLooseDragPending && !isDraggingInventoryLoose) {
    const tappedIdx = inventoryLooseDragPendingIndex;
    inventoryLooseDragPending = false;
    inventoryLooseDragPendingIndex = null;
    if (tappedIdx !== null) {
      clearSelection();
      selectedInventoryTablePieceIndex = tappedIdx;
    }
    scheduleRender();
  }
  if (isDraggingInventoryLoose && inventoryDraggingIndex !== null) {
    const w = inventoryLooseDragPreviewWorld ?? screenToBoardWorld(e.clientX, e.clientY);
    const idx = inventoryDraggingIndex;
    const entry = inventoryTablePieces[idx];
    if (entry) {
      inventoryTablePieces[idx] = { ...entry, world: { ...w } };
    }
    playBoardDragDrop();
    isDraggingInventoryLoose = false;
    inventoryDraggingIndex = null;
    inventoryLooseDragPreviewWorld = null;
    inventoryLooseDragPending = false;
    inventoryLooseDragPendingIndex = null;
    notifyBoardEditLocal();
    scheduleRender();
  }
}

/** Loose god cards on canvas (primary button). */
function tryHandleGodTablePrimaryDown(clientX: number, clientY: number, altKey: boolean): boolean {
  if (!isPointOverCanvas(clientX, clientY)) return false;
  if (inventoryLooseDragPending || isDraggingInventoryLoose) return false;
  if (!altKey && godTablePieces.length > 0) {
    const looseI = godLooseHitIndex(clientX, clientY);
    if (looseI !== null) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      terrainDragPending = false;
      terrainDragPendingIndex = null;
      etherVortexDragPending = false;
      etherVortexDragPendingIndex = null;
      releaseGodLoosePointerCaptureIfAny();
      const piece = godTablePieces[looseI]!;
      const wasDeckSelected =
        selectedGodTablePieceIndex === looseI && piece.kind === 'deck';
      clearSelection();
      if (piece.kind === 'deck') {
        if (wasDeckSelected) {
          selectedGodTablePieceIndex = looseI;
          godDragWholeGodDeck = true;
        } else {
          godDragWholeGodDeck = false;
        }
      } else {
        selectedGodTablePieceIndex = looseI;
        godDragWholeGodDeck = false;
      }
      godLooseDragPending = true;
      godLooseDragPendingIndex = looseI;
      godLooseDragPendingStartX = clientX;
      godLooseDragPendingStartY = clientY;
      return true;
    }
  }

  return false;
}

document.addEventListener(
  'dragover',
  (e) => {
    if (!isArmyUnitDrag(e.dataTransfer)) return;
    if (armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)) {
      e.dataTransfer!.dropEffect = 'none';
      return;
    }
    if (!isPointOverCanvas(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  },
  true,
);

document.addEventListener(
  'drop',
  (e) => {
    if (!isArmyUnitDrag(e.dataTransfer)) return;
    if (armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)) return;
    if (!isPointOverCanvas(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    let raw = dt?.getData(DND_MIME) ?? '';
    if (!raw && dt) {
      const plain = dt.getData('text/plain');
      if (plain.trimStart().startsWith('{')) raw = plain;
    }
    if (!raw) return;
    handleArmyBuilderDrop(e.clientX, e.clientY, raw);
  },
  true,
);

// ── Input: pointerdown (god piles + deck pull w/ capture) ──────

canvas.addEventListener('dblclick', (e: MouseEvent) => {
  if (e.button !== 0 || e.ctrlKey) return;
  if (!isPointOverCanvas(e.clientX, e.clientY)) return;
  const i = godLooseHitIndex(e.clientX, e.clientY);
  if (i === null) return;
  e.preventDefault();
  const p = godTablePieces[i]!;
  const fromFaceUp = p.faceUp;
  godTablePieces[i] = { ...p, faceUp: !p.faceUp };
  godPieceFlipAnim = {
    index: i,
    startMs: performance.now(),
    durationMs: GOD_TABLE_CARD_FLIP_MS,
    fromFaceUp,
  };
  scheduleRender();
});

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (e.button !== 0 || e.ctrlKey) return;
  const looseTapI = godLooseHitIndex(e.clientX, e.clientY);
  if (looseTapI !== null && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
    const now = Date.now();
    if (
      godLooseLastTapGodIndex === looseTapI &&
      now - godLooseLastTapMs < GOD_LOOSE_DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - godLooseLastTapX, e.clientY - godLooseLastTapY) < GOD_LOOSE_DOUBLE_TAP_DIST_PX
    ) {
      godLooseLastTapMs = 0;
      godLooseLastTapGodIndex = null;
      e.preventDefault();
      const p = godTablePieces[looseTapI]!;
      const fromFaceUp = p.faceUp;
      godTablePieces[looseTapI] = { ...p, faceUp: !p.faceUp };
      godPieceFlipAnim = {
        index: looseTapI,
        startMs: performance.now(),
        durationMs: GOD_TABLE_CARD_FLIP_MS,
        fromFaceUp,
      };
      scheduleRender();
      return;
    }
    godLooseLastTapMs = now;
    godLooseLastTapX = e.clientX;
    godLooseLastTapY = e.clientY;
    godLooseLastTapGodIndex = looseTapI;
  }
  if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleBroomgarHungerClick(e.clientX, e.clientY)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleMiniatureActivationClick(e.clientX, e.clientY)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleMiniatureHealthClick(e.clientX, e.clientY)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (tryTouchDoubleTapOnMiniatureForCard(e)) {
    scheduleRender();
    return;
  }
  if (tryHandleInventoryTablePrimaryDown(e.clientX, e.clientY)) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (tryHandleGodTablePrimaryDown(e.clientX, e.clientY, e.altKey)) {
    if (godLooseDragPending) {
      try {
        canvas.setPointerCapture(e.pointerId);
        godLooseCapturePointerId = e.pointerId;
      } catch {
        godLooseCapturePointerId = null;
      }
    }
    e.preventDefault();
    scheduleRender();
    return;
  }
});

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (e.button !== 0 || e.ctrlKey) return;
  if (e.defaultPrevented) return;
  if (!isPointOverCanvas(e.clientX, e.clientY)) return;
  if (armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)) return;
  clearEffectMarkerLongPressTimer();
  effectMarkerLongPressStartX = e.clientX;
  effectMarkerLongPressStartY = e.clientY;
  effectMarkerLongPressTimer = window.setTimeout(() => {
    effectMarkerLongPressTimer = null;
    showBoardContextMenuAt(e.clientX, e.clientY);
  }, EFFECT_MARKER_LONG_PRESS_MS);
});

// ── Input: mousedown ───────────────────────────────────────────

function tryStartCameraPanFromMouseDown(e: MouseEvent): boolean {
  if (!(e.button === 1 || (e.button === 0 && e.ctrlKey))) return false;
  if (!isPointOverCanvas(e.clientX, e.clientY)) return false;
  if (armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)) return false;
  isPanning = true;
  panStartX = e.clientX - camera.offsetX;
  panStartY = e.clientY - camera.offsetY;
  e.preventDefault();
  return true;
}

// Start pan from anywhere above the board (including DOM overlays over canvas).
window.addEventListener(
  'mousedown',
  (e: MouseEvent) => {
    tryStartCameraPanFromMouseDown(e);
  },
  true,
);

canvas.addEventListener('mousedown', (e) => {
  // Pan: middle-click or Ctrl+left-click
  if (tryStartCameraPanFromMouseDown(e)) return;

  // Left-click: select piece; double-click: pin card + walk/run (Alt+hover still previews ranges)
  if (e.button === 0) {
    if (touchUnitDoubleTapSuppressMouseDown) {
      touchUnitDoubleTapSuppressMouseDown = false;
      e.preventDefault();
      scheduleRender();
      return;
    }
    clearEffectMarkerLongPressTimer();
    if (
      pendingTouchArmyPlaceRaw &&
      isPointOverCanvas(e.clientX, e.clientY) &&
      !armyBuilderPanel.isScreenPointOverPanel(e.clientX, e.clientY)
    ) {
      handleArmyBuilderDrop(e.clientX, e.clientY, pendingTouchArmyPlaceRaw);
      pendingTouchArmyPlaceRaw = null;
      e.preventDefault();
      scheduleRender();
      return;
    }
    if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }
    if (handleBroomgarHungerClick(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }
    if (handleMiniatureActivationClick(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }
    if (handleMiniatureHealthClick(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }

    // God table: handled on pointerdown when Pointer Events exist (deck pull uses setPointerCapture).
    if (typeof PointerEvent === 'undefined') {
      if (tryHandleInventoryTablePrimaryDown(e.clientX, e.clientY)) {
        e.preventDefault();
        scheduleRender();
        return;
      }
      if (tryHandleGodTablePrimaryDown(e.clientX, e.clientY, e.altKey)) {
        e.preventDefault();
        scheduleRender();
        return;
      }
    }

    if (godLooseDragPending || isDraggingGodLoose || inventoryLooseDragPending || isDraggingInventoryLoose) {
      e.preventDefault();
      scheduleRender();
      return;
    }

    const hex = hexAtScreen(e.clientX, e.clientY);
    if (!hex) {
      // Check off-board elements before giving up
      const obUnit = findOffBoardUnitAtScreen(e.clientX, e.clientY);
      if (obUnit !== -1) {
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        selectedEtherVortexIndex = null;
        showSelectedDetails = e.detail === 2;
        unitDragPendingIndex = obUnit;
        unitDragPendingStartX = e.clientX;
        unitDragPendingStartY = e.clientY;
        unitDragPendingIsNewSelection = selectedUnitIndex !== obUnit;
        if (unitDragPendingIsNewSelection) {
          selectedUnitIndex = obUnit;
          selectedBigMiniIndex = null;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
          selectedInventoryTablePieceIndex = null;
          updateBigMiniMovementHighlights();
          updateMovementHighlights();
        }
        scheduleRender();
        return;
      }
      const obBig = findOffBoardBigMiniAtScreen(e.clientX, e.clientY);
      if (obBig !== -1) {
        unitDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        selectedEtherVortexIndex = null;
        showSelectedDetails = e.detail === 2;
        bigMiniDragPendingIndex = obBig;
        bigMiniDragPendingStartX = e.clientX;
        bigMiniDragPendingStartY = e.clientY;
        if (selectedBigMiniIndex !== obBig) {
          selectedUnitIndex = null;
          updateMovementHighlights();
          selectedBigMiniIndex = obBig;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
          selectedInventoryTablePieceIndex = null;
          updateBigMiniMovementHighlights();
        }
        scheduleRender();
        return;
      }
      const obLarge = findOffBoardLargeMiniAtScreen(e.clientX, e.clientY);
      if (obLarge !== -1) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        selectedEtherVortexIndex = null;
        showSelectedDetails = e.detail === 2;
        largeMiniDragPendingIndex = obLarge;
        largeMiniDragPendingStartX = e.clientX;
        largeMiniDragPendingStartY = e.clientY;
        if (selectedLargeMiniIndex !== obLarge) {
          selectedUnitIndex = null;
          selectedBigMiniIndex = null;
          selectedHugeMiniIndex = null;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
          selectedInventoryTablePieceIndex = null;
          selectedLargeMiniIndex = obLarge;
          updateMovementHighlights();
          updateBigMiniMovementHighlights();
          updateLargeMiniMovementHighlights();
          updateHugeMiniMovementHighlights();
        }
        scheduleRender();
        return;
      }
      const obHuge = findOffBoardHugeMiniAtScreen(e.clientX, e.clientY);
      if (obHuge !== -1) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        largeMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        selectedEtherVortexIndex = null;
        showSelectedDetails = e.detail === 2;
        hugeMiniDragPendingIndex = obHuge;
        hugeMiniDragPendingStartX = e.clientX;
        hugeMiniDragPendingStartY = e.clientY;
        if (selectedHugeMiniIndex !== obHuge) {
          selectedUnitIndex = null;
          selectedBigMiniIndex = null;
          selectedLargeMiniIndex = null;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
          selectedInventoryTablePieceIndex = null;
          selectedHugeMiniIndex = obHuge;
          updateMovementHighlights();
          updateBigMiniMovementHighlights();
          updateLargeMiniMovementHighlights();
          updateHugeMiniMovementHighlights();
        }
        scheduleRender();
        return;
      }
      const obTerrain = findOffBoardTerrainAtScreen(e.clientX, e.clientY);
      if (obTerrain !== -1) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        clearSelection();
        selectedTerrainIndex = obTerrain;
        terrainDragPendingIndex = obTerrain;
        terrainDragPending = true;
        terrainDragPendingStartX = e.clientX;
        terrainDragPendingStartY = e.clientY;
        updateMovementHighlights();
        updateBigMiniMovementHighlights();
        scheduleRender();
        return;
      }
      const obVortex = findOffBoardEtherVortexAtScreen(e.clientX, e.clientY);
      if (obVortex !== -1) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        clearSelection();
        selectedEtherVortexIndex = obVortex;
        etherVortexDragPendingIndex = obVortex;
        etherVortexDragPending = true;
        etherVortexDragPendingStartX = e.clientX;
        etherVortexDragPendingStartY = e.clientY;
        scheduleRender();
        return;
      }
      // Nothing hit off-board — clear selection
      if (
        selectedUnitIndex !== null ||
        selectedBigMiniIndex !== null ||
        selectedLargeMiniIndex !== null ||
        selectedHugeMiniIndex !== null ||
        selectedTerrainIndex !== null ||
        selectedEtherVortexIndex !== null ||
        selectedGodTablePieceIndex !== null ||
        selectedInventoryTablePieceIndex !== null
      ) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        largeMiniDragPendingIndex = null;
        hugeMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        clearSelection();
        updateMovementHighlights();
        updateBigMiniMovementHighlights();
        updateLargeMiniMovementHighlights();
        updateHugeMiniMovementHighlights();
      }
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      openHealthControlsLargeMiniIndex = null;
      openHealthControlsHugeMiniIndex = null;
      scheduleRender();
      return;
    }

    // Alt+click: pick terrain even when a small or big miniature shares its hexes (normal hit order hides terrain).
    if (altModActive()) {
      const altTerrainIdx = findTerrainAtHex(hex);
      if (altTerrainIdx !== -1) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        terrainDragPendingIndex = altTerrainIdx;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        clearSelection();
        selectedTerrainIndex = altTerrainIdx;
        updateMovementHighlights();
        updateBigMiniMovementHighlights();
        terrainDragPending = true;
        terrainDragPendingStartX = e.clientX;
        terrainDragPendingStartY = e.clientY;
        scheduleRender();
        return;
      }
    }

    const clickedUnitIndex = units.findIndex((unit) => unit.position.key === hex.key);
    if (clickedUnitIndex !== -1) {
      bigMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      selectedEtherVortexIndex = null;
      showSelectedDetails = e.detail === 2;
      // Always use pending — drag starts only after threshold
      unitDragPendingIndex = clickedUnitIndex;
      unitDragPendingStartX = e.clientX;
      unitDragPendingStartY = e.clientY;
      unitDragPendingIsNewSelection = selectedUnitIndex !== clickedUnitIndex;
      // Select immediately (visual feedback), but don't drag yet
      if (unitDragPendingIsNewSelection) {
        selectedUnitIndex = clickedUnitIndex;
        selectedBigMiniIndex = null;
        selectedLargeMiniIndex = null;
        selectedHugeMiniIndex = null;
        selectedTerrainIndex = null;
        selectedGodTablePieceIndex = null;
        selectedInventoryTablePieceIndex = null;
        updateBigMiniMovementHighlights();
        updateMovementHighlights();
      }
      scheduleRender();
      return;
    }

    const boardWorldAtClick = screenToBoardWorld(e.clientX, e.clientY);
    const bigMiniIdx = findBigMiniAtHex(hex);
    if (bigMiniIdx !== -1) {
      if (
        isWorldPointInBigMiniSilhouette(
          boardWorldAtClick,
          bigMiniPivotWorldForHit(bigMiniIdx),
          bigMiniatures[bigMiniIdx]!.rotationDeg,
          layout,
        )
      ) {
        unitDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        largeMiniDragPendingIndex = null;
        hugeMiniDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        selectedEtherVortexIndex = null;
        bigMiniDragPendingIndex = bigMiniIdx;
        bigMiniDragPendingStartX = e.clientX;
        bigMiniDragPendingStartY = e.clientY;
        if (selectedBigMiniIndex !== bigMiniIdx) {
          clearSelection();
          selectedBigMiniIndex = bigMiniIdx;
          updateMovementHighlights();
          updateBigMiniMovementHighlights();
        }
        // After clearSelection — it resets showSelectedDetails
        showSelectedDetails = e.detail === 2;
        scheduleRender();
        return;
      }
    }

    const largeMiniIdx = findLargeMiniAtHex(hex);
    if (largeMiniIdx !== -1) {
      if (
        isWorldPointInLargeMiniSilhouette(
          boardWorldAtClick,
          largeMiniPivotWorldForHit(largeMiniIdx),
          largeMiniatures[largeMiniIdx]!.rotationDeg,
          layout,
        )
      ) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        hugeMiniDragPendingIndex = null;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        selectedEtherVortexIndex = null;
        largeMiniDragPendingIndex = largeMiniIdx;
        largeMiniDragPendingStartX = e.clientX;
        largeMiniDragPendingStartY = e.clientY;
        if (selectedLargeMiniIndex !== largeMiniIdx) {
          clearSelection();
          selectedLargeMiniIndex = largeMiniIdx;
          updateMovementHighlights();
          updateLargeMiniMovementHighlights();
        }
        showSelectedDetails = e.detail === 2;
        scheduleRender();
        return;
      }
    }

    const hugeMiniIdx = resolveHugeMiniIndexAtPointer(hex, screenToBoardWorld(e.clientX, e.clientY));
    if (hugeMiniIdx !== -1) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      largeMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      openHealthControlsHugeMiniIndex = null;
      selectedEtherVortexIndex = null;
      hugeMiniDragPendingIndex = hugeMiniIdx;
      hugeMiniDragPendingStartX = e.clientX;
      hugeMiniDragPendingStartY = e.clientY;
      if (selectedHugeMiniIndex !== hugeMiniIdx) {
        clearSelection();
        selectedHugeMiniIndex = hugeMiniIdx;
        updateMovementHighlights();
        updateHugeMiniMovementHighlights();
      }
      showSelectedDetails = e.detail === 2;
      scheduleRender();
      return;
    }

    const etherVortexIdx = findEtherVortexAtHex(hex);
    if (etherVortexIdx !== -1) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
      terrainDragPending = false;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      clearSelection();
      selectedEtherVortexIndex = etherVortexIdx;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      // Enable drag pending for ether vortex
      etherVortexDragPendingIndex = etherVortexIdx;
      etherVortexDragPending = true;
      etherVortexDragPendingStartX = e.clientX;
      etherVortexDragPendingStartY = e.clientY;
      scheduleRender();
      return;
    }

    const terrainIdx = findTerrainAtHex(hex);
    if (terrainIdx !== -1) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      terrainDragPendingIndex = terrainIdx;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      clearSelection();
      selectedTerrainIndex = terrainIdx;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      terrainDragPending = true;
      terrainDragPendingStartX = e.clientX;
      terrainDragPendingStartY = e.clientY;
      scheduleRender();
      return;
    }

    if (
      selectedUnitIndex !== null ||
      selectedBigMiniIndex !== null ||
      selectedLargeMiniIndex !== null ||
      selectedHugeMiniIndex !== null ||
      selectedTerrainIndex !== null ||
      selectedEtherVortexIndex !== null ||
      selectedGodTablePieceIndex !== null ||
      selectedInventoryTablePieceIndex !== null
    ) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      largeMiniDragPendingIndex = null;
      hugeMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      clearSelection();
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      updateLargeMiniMovementHighlights();
      updateHugeMiniMovementHighlights();
      scheduleRender();
    }
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
  }
});

// ── Input: pointerup / cancel (touch + mouse) ─────────────────

function onWindowPointerUpOrCancel(e: PointerEvent): void {
  activeCanvasPointers.delete(e.pointerId);
  if (activeCanvasPointers.size < 2) {
    twoFingerCameraGesture = false;
    pinchPrevDistance = 0;
  }
  clearEffectMarkerLongPressTimer();
  finishGodLooseDragIfActive(e);
  finishInventoryLooseDragIfActive(e);
  if (boardDragCapturePointerId === e.pointerId) {
    releaseBoardDragCaptureIfAny();
  }
  if (e.button === 0 && unitDragPendingIndex !== null) {
    unitDragPendingIndex = null;
    if (draggingUnitIndex === null) {
      renderer.setDragState(null, null, null);
      scheduleRender();
    }
  } else if (e.button === 0 && bigMiniDragPendingIndex !== null) {
    bigMiniDragPendingIndex = null;
    if (draggingBigMiniIndex === null) {
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null, bigMiniOffBoards());
      scheduleRender();
    }
  } else if (e.button === 0 && largeMiniDragPendingIndex !== null) {
    largeMiniDragPendingIndex = null;
    scheduleRender();
  } else if (e.button === 0 && hugeMiniDragPendingIndex !== null) {
    hugeMiniDragPendingIndex = null;
    scheduleRender();
  } else if (e.button === 0 && terrainDragPending && !isDraggingTerrain) {
    terrainDragPending = false;
    terrainDragPendingIndex = null;
    scheduleRender();
  } else if (e.button === 0 && etherVortexDragPending && !isDraggingEtherVortex) {
    etherVortexDragPending = false;
    etherVortexDragPendingIndex = null;
    scheduleRender();
  } else if (e.button === 0 && draggingUnitIndex !== null) {
    if (dragOverHex && !isHexOccupiedByOtherUnit(dragOverHex, draggingUnitIndex)) {
      // Dropped on a valid hex → place on board
      units[draggingUnitIndex].position = dragOverHex;
      units[draggingUnitIndex].offBoardWorld = undefined;
    } else if (!dragOverHex && dragPreviewPosition) {
      // Dropped off-board → store world position
      units[draggingUnitIndex].offBoardWorld = { ...dragPreviewPosition };
    }
    draggingUnitIndex = null;
    dragOverHex = null;
    dragPreviewPosition = null;
    unitCard.setPassthrough(false);
    renderer.setDragState(null, null, null);
    clearSelectionAfterMiniatureDragEnd();
    playBoardDragDrop();
    scheduleRender();
  }
  if (e.button === 0 && draggingBigMiniIndex !== null) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    const dropHex = hexAtScreen(e.clientX, e.clientY);
    if (dropHex) {
      // Dropped on board → snap to hexon center
      bigMiniatures[draggingBigMiniIndex].center = nearestHexonCenterFromWorld(dropWorld);
      bigMiniatures[draggingBigMiniIndex].offBoardWorld = undefined;
    } else {
      // Dropped off-board → store world position
      bigMiniatures[draggingBigMiniIndex].offBoardWorld = { ...dropWorld };
    }
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    bigMiniDragOverCenter = null;
    unitCard.setPassthrough(false);
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null,
      bigMiniatures.map((m) => m.offBoardWorld));
    clearSelectionAfterMiniatureDragEnd();
    playBoardDragDrop();
    scheduleRender();
  }
  if (e.button === 0 && draggingLargeMiniIndex !== null) {
    const dropHex = hexAtScreen(e.clientX, e.clientY);
    if (dropHex && largeMiniDragOverAnchor) {
      largeMiniatures[draggingLargeMiniIndex].anchor = largeMiniDragOverAnchor;
      largeMiniatures[draggingLargeMiniIndex].offBoardWorld = undefined;
    } else if (!dropHex && largeMiniPreviewPosition) {
      largeMiniatures[draggingLargeMiniIndex].offBoardWorld = { ...largeMiniPreviewPosition };
    }
    draggingLargeMiniIndex = null;
    largeMiniPreviewPosition = null;
    largeMiniDragOverAnchor = null;
    unitCard.setPassthrough(false);
    clearSelectionAfterMiniatureDragEnd();
    playBoardDragDrop();
    scheduleRender();
  }
  if (e.button === 0 && draggingHugeMiniIndex !== null) {
    const idx = draggingHugeMiniIndex;
    const dropWorld = hugeMiniPreviewPosition ?? screenToBoardWorld(e.clientX, e.clientY);
    const dropHex = hexAtScreen(e.clientX, e.clientY);
    if (dropHex) {
      hugeMiniatures[idx].offBoardWorld = { ...dropWorld };
      const anchor = findHugeMiniAnchorForPivotWorld(
        dropWorld,
        hugeMiniatures[idx].rotationDeg,
        idx,
      );
      if (anchor !== null) hugeMiniatures[idx].anchor = anchor;
    } else {
      hugeMiniatures[idx].offBoardWorld = { ...dropWorld };
    }
    draggingHugeMiniIndex = null;
    hugeMiniPreviewPosition = null;
    hugeMiniDragOverAnchor = null;
    unitCard.setPassthrough(false);
    clearSelectionAfterMiniatureDragEnd();
    playBoardDragDrop();
    scheduleRender();
  }
  if (e.button === 0 && isDraggingTerrain) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    const dropHex = hexAtScreen(e.clientX, e.clientY);
    if (draggingTerrainIndex !== null) {
      if (dropHex) {
        terrains[draggingTerrainIndex] = nearestHexonCenterFromWorld(dropWorld);
        terrainOffBoardWorlds[draggingTerrainIndex] = undefined;
      } else {
        terrainOffBoardWorlds[draggingTerrainIndex] = { ...dropWorld };
      }
    }
    isDraggingTerrain = false;
    draggingTerrainIndex = null;
    terrainDragPendingIndex = null;
    terrainPreviewWorld = null;
    terrainDragOverCenter = null;
    renderer.setTerrain(terrains, null, false, null, null, selectedTerrainIndex, terrainOffBoardWorlds);
    playBoardDragDrop();
    scheduleRender();
  }
  if (e.button === 0 && isDraggingEtherVortex) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    const dropHex = hexAtScreen(e.clientX, e.clientY);
    if (draggingEtherVortexIndex !== null) {
      if (dropHex) {
        etherVortexes[draggingEtherVortexIndex].center = nearestHexonCenterFromWorld(dropWorld);
        etherVortexes[draggingEtherVortexIndex].offBoardWorld = undefined;
      } else {
        etherVortexes[draggingEtherVortexIndex].offBoardWorld = { ...dropWorld };
      }
    }
    isDraggingEtherVortex = false;
    draggingEtherVortexIndex = null;
    etherVortexDragPendingIndex = null;
    etherVortexPreviewWorld = null;
    etherVortexDragOverCenter = null;
    renderer.setEtherVortexDrag(null, null, null);
    renderer.setEtherVortexes(etherVortexes, selectedEtherVortexIndex);
    playBoardDragDrop();
    scheduleRender();
  }
  isPanning = false;
}

window.addEventListener('pointerup', onWindowPointerUpOrCancel);
window.addEventListener('pointercancel', onWindowPointerUpOrCancel);

window.addEventListener('keydown', (e) => {
  if (isEditableTarget(e.target)) return;
  // Use e.code (physical key) so Ctrl+C/V/D work with non-Latin keyboard layouts (e.g. Russian).
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.code === 'KeyC') {
    copySelected();
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (mod && !e.shiftKey && e.code === 'KeyV') {
    pasteClipboard();
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (mod && !e.shiftKey && e.code === 'KeyD') {
    duplicateSelected();
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (!mod && !e.repeat && e.code === 'KeyR') {
    if (
      isPointOverCanvas(pointerScreenX, pointerScreenY) &&
      !armyBuilderPanel.isScreenPointOverPanel(pointerScreenX, pointerScreenY) &&
      !godHandBlindDock?.isPointOverBlindZoneChrome(pointerScreenX, pointerScreenY)
    ) {
      const hi = godLooseHitIndex(pointerScreenX, pointerScreenY);
      if (hi !== null) {
        const p = godTablePieces[hi]!;
        if (p.kind === 'deck' && p.ids.length >= 2) {
          godTablePieces[hi] = { ...p, ids: shuffleIds(p.ids) };
          godDeckShuffleAnim = {
            index: hi,
            startMs: performance.now(),
            durationMs: 320,
          };
          playGodDeckShuffle();
          notifyBoardEditLocal();
          e.preventDefault();
          scheduleRender();
          return;
        }
      }
    }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
    e.preventDefault();
    scheduleRender();
    return;
  }

  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    altKeyHeld = true;
    refreshAltHoverTarget(hexUnderGlobalPointer() ?? hoveredHexUnderPointer);
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    shiftKeyHeld = true;
    refreshShiftHoverTarget(hexUnderGlobalPointer() ?? hoveredHexUnderPointer);
    scheduleRender();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    altKeyHeld = false;
    altHoverTarget = null;
    scheduleRender();
    return;
  }
  if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    shiftKeyHeld = false;
    shiftHoverTarget = null;
    hoveredAttack = null;
    scheduleRender();
  }
});

window.addEventListener('blur', () => {
  releaseGodLoosePointerCaptureIfAny();
  godPieceFlipAnim = null;
  godDragWholeGodDeck = false;

  godLooseDragPending = false;
  godLooseDragPendingIndex = null;
  if (isDraggingGodLoose && godDraggingLooseIndex !== null && godLooseDragPreviewWorld) {
    const idx = godDraggingLooseIndex;
    const entry = godTablePieces[idx];
    if (entry) godTablePieces[idx]!.world = { ...godLooseDragPreviewWorld };
  }
  isDraggingGodLoose = false;
  godDraggingLooseIndex = null;
  godLooseDragPreviewWorld = null;

  altKeyHeld = false;
  shiftKeyHeld = false;
  touchAltSticky = false;
  touchShiftSticky = false;
  altHoverTarget = null;
  shiftHoverTarget = null;
  hoveredAttack = null;
  scheduleRender();
});

// ── Input: zoom + pan (wheel / trackpad) ────────────────────────
// Режим «Зум»: любая прокрутка меняет масштаб.
// Режим «Панорама»: прокрутка сдвигает камеру; Ctrl/Cmd+wheel (пинч) — зум.
// Панорама: только сырые дельты (coalesced + нормализация deltaMode), без подмешивания осей.
// Зум: линейно от нормализованной dy; тачпад (DOM_DELTA_PIXEL) — тот же k × множитель, мышь LINE/PAGE не трогаем.

/** Базовый коэффициент для мыши (LINE / PAGE). Тачпад: × WHEEL_ZOOM_TOUCHPAD_MULT. */
const WHEEL_ZOOM_LINEAR = 0.00052;
const WHEEL_ZOOM_TOUCHPAD_MULT = 3;

function rawWheelDeltaToPixels(ev: WheelEvent): { dx: number; dy: number } {
  let x = ev.deltaX;
  let y = ev.deltaY;
  const mode = ev.deltaMode;
  if (mode === WheelEvent.DOM_DELTA_LINE) {
    x *= 16;
    y *= 16;
  } else if (mode === WheelEvent.DOM_DELTA_PAGE) {
    x *= window.innerWidth;
    y *= window.innerHeight;
  }
  return { dx: x, dy: y };
}

function wheelDeltasInCssPixels(e: WheelEvent): { dx: number; dy: number } {
  const coalesce = (e as WheelEvent & { getCoalescedEvents?: () => WheelEvent[] }).getCoalescedEvents;
  const parts = typeof coalesce === 'function' ? coalesce.call(e) : [];
  if (parts.length > 0) {
    let dx = 0;
    let dy = 0;
    for (const ev of parts) {
      const p = rawWheelDeltaToPixels(ev);
      dx += p.dx;
      dy += p.dy;
    }
    return { dx, dy };
  }
  return rawWheelDeltaToPixels(e);
}

/** Шаги зума из одного WheelEvent: у coalesced — по под-событиям со своим deltaMode (иначе k зума не совпадает с суммой dy). */
type BoardWheelZoomStep = { dy: number; deltaMode: number };

function wheelZoomStepsFromEvent(e: WheelEvent): BoardWheelZoomStep[] {
  const coalesce = (e as WheelEvent & { getCoalescedEvents?: () => WheelEvent[] }).getCoalescedEvents;
  const parts = typeof coalesce === 'function' ? coalesce.call(e) : [];
  if (parts.length > 0) {
    return parts.map((ev) => {
      const p = rawWheelDeltaToPixels(ev);
      return { dy: p.dy, deltaMode: ev.deltaMode };
    });
  }
  const p = rawWheelDeltaToPixels(e);
  return [{ dy: p.dy, deltaMode: e.deltaMode }];
}

let boardWheelZoomQueue: BoardWheelZoomStep[] = [];
let boardWheelZoomRaf = 0;
let boardWheelZoomClientX = 0;
let boardWheelZoomClientY = 0;

function flushBoardWheelZoomQueue(): void {
  boardWheelZoomRaf = 0;
  if (boardWheelZoomQueue.length === 0) return;
  const steps = boardWheelZoomQueue;
  boardWheelZoomQueue = [];
  const mx = boardWheelZoomClientX;
  const my = boardWheelZoomClientY;
  for (const step of steps) {
    const oldZoom = camera.zoom;
    const zoomK =
      step.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        ? WHEEL_ZOOM_LINEAR * WHEEL_ZOOM_TOUCHPAD_MULT
        : WHEEL_ZOOM_LINEAR;
    let newZoom = oldZoom * (1 - step.dy * zoomK);
    newZoom = Math.max(0.2, Math.min(5, newZoom));
    camera.zoom = newZoom;
    camera.offsetX = mx - (mx - camera.offsetX) * (camera.zoom / oldZoom);
    camera.offsetY = my - (my - camera.offsetY) * (camera.zoom / oldZoom);
  }
  scheduleRender();
}

function scheduleBoardWheelZoomFlush(): void {
  if (boardWheelZoomRaf !== 0) return;
  boardWheelZoomRaf = requestAnimationFrame(flushBoardWheelZoomQueue);
}

/** Колесо над канвасом или слепой зоной богов (оверлей поверх канваса — target не canvas). */
function shouldApplyBoardCameraWheel(e: WheelEvent): boolean {
  if (isEditableTarget(e.target)) return false;
  const t = e.target;
  if (!(t instanceof Node)) return false;
  if (t === canvas || canvas.contains(t)) return true;
  if (t instanceof Element && t.closest('.god-blind-table-wrap')) return true;
  return false;
}

window.addEventListener(
  'wheel',
  (e) => {
    if (!shouldApplyBoardCameraWheel(e)) return;
    e.preventDefault();
    const pinchOrZoomGesture = e.ctrlKey || e.metaKey;
    const wheelMode = getWheelBehavior();

    if (wheelMode === 'pan' && !pinchOrZoomGesture) {
      e.stopPropagation();
      const { dx, dy } = wheelDeltasInCssPixels(e);
      camera.offsetX -= dx;
      camera.offsetY -= dy;
      scheduleRender();
      return;
    }

    boardWheelZoomClientX = e.clientX;
    boardWheelZoomClientY = e.clientY;
    boardWheelZoomQueue.push(...wheelZoomStepsFromEvent(e));
    scheduleBoardWheelZoomFlush();
  },
  { passive: false, capture: true },
);

// ── Resize ─────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  resizeCanvas();
  centerCamera();
  scheduleRender();
});

window.addEventListener('keydown', (e) => {
  if (isEditableTarget(e.target)) return;
  const cameraPanStep = e.shiftKey ? 40 : 20;
  if (!e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'KeyA') {
      camera.offsetX += cameraPanStep;
      e.preventDefault();
      scheduleRender();
      return;
    }
    if (e.code === 'KeyD') {
      camera.offsetX -= cameraPanStep;
      e.preventDefault();
      scheduleRender();
      return;
    }
    if (e.code === 'KeyW') {
      camera.offsetY += cameraPanStep;
      e.preventDefault();
      scheduleRender();
      return;
    }
    if (e.code === 'KeyS') {
      camera.offsetY -= cameraPanStep;
      e.preventDefault();
      scheduleRender();
      return;
    }
  }
  const moveStep = e.shiftKey ? BG_CALIBRATION_STEP_FAST : BG_CALIBRATION_STEP;
  const scaleStep = e.shiftKey ? BG_CALIBRATION_SCALE_STEP * 2 : BG_CALIBRATION_SCALE_STEP;
  const elementRotStep = e.shiftKey ? ELEMENT_ROT_STEP_FAST : ELEMENT_ROT_STEP;
  let changed = false;

  if (
    selectedHugeMiniIndex !== null &&
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    (e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown')
  ) {
    const step = e.shiftKey ? HUGE_SPRITE_NUDGE_STEP_FAST : HUGE_SPRITE_NUDGE_STEP;
    const m = hugeMiniatures[selectedHugeMiniIndex];
    if (m) {
      if (!m.spriteOffsetLocal) m.spriteOffsetLocal = { x: 0, y: 0 };
      if (e.code === 'ArrowLeft') m.spriteOffsetLocal.x -= step;
      else if (e.code === 'ArrowRight') m.spriteOffsetLocal.x += step;
      else if (e.code === 'ArrowUp') m.spriteOffsetLocal.y -= step;
      else m.spriteOffsetLocal.y += step;
      e.preventDefault();
      scheduleRender();
      return;
    }
  }
  if (selectedHugeMiniIndex !== null && e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR') {
    const m = hugeMiniatures[selectedHugeMiniIndex];
    if (m) {
      m.spriteOffsetLocal = { x: 0, y: 0 };
      m.spriteRotationDeg = 0;
      e.preventDefault();
      scheduleRender();
      return;
    }
  }

  if (
    selectedHugeMiniIndex !== null &&
    e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    (e.code === 'KeyQ' || e.code === 'KeyE')
  ) {
    const step = e.shiftKey ? HUGE_SPRITE_ROT_STEP_FAST : HUGE_SPRITE_ROT_STEP;
    const m = hugeMiniatures[selectedHugeMiniIndex];
    if (m) {
      let r = m.spriteRotationDeg ?? 0;
      r += e.code === 'KeyQ' ? -step : step;
      r = ((r % 360) + 360) % 360;
      m.spriteRotationDeg = r;
      e.preventDefault();
      scheduleRender();
      return;
    }
  }

  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'KeyP') {
      console.log('[board overlays] values for hardcode:', {
        GRID_OVERLAY_EXTRA_ROTATION_DEG,
        gridOverlayOffsetScreenX: Number(gridOverlayOffsetScreenX.toFixed(2)),
        gridOverlayOffsetScreenY: Number(gridOverlayOffsetScreenY.toFixed(2)),
        gridOverlayManualWidthPx: gridOverlayManualWidthPx,
        gridOverlayManualHeightPx: gridOverlayManualHeightPx,
        desertUnderlayExtraRotationDeg: Number(desertUnderlayExtraRotationDeg.toFixed(3)),
      });
      e.preventDefault();
      return;
    }
    if (
      selectedHugeMiniIndex === null &&
      (e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown')
    ) {
      const gridMoveStep = e.shiftKey ? GRID_OVERLAY_MOVE_STEP_FAST : GRID_OVERLAY_MOVE_STEP;
      if (e.code === 'ArrowLeft') gridOverlayOffsetScreenX -= gridMoveStep;
      else if (e.code === 'ArrowRight') gridOverlayOffsetScreenX += gridMoveStep;
      else if (e.code === 'ArrowUp') gridOverlayOffsetScreenY -= gridMoveStep;
      else gridOverlayOffsetScreenY += gridMoveStep;
      e.preventDefault();
      scheduleRender();
      return;
    }
  }

  // Physical keys (e.code) so Q/E work with non-Latin layouts (e.g. Russian).
  if (e.code === 'KeyQ') {
    if (
      draggingUnitIndex === null &&
      draggingBigMiniIndex === null &&
      draggingLargeMiniIndex === null &&
      draggingHugeMiniIndex === null &&
      !isDraggingTerrain &&
      rotateSelectedBoardPiece(-elementRotStep)
    ) {
      scheduleRender();
      e.preventDefault();
    }
    return;
  }
  if (e.code === 'KeyE') {
    if (
      draggingUnitIndex === null &&
      draggingBigMiniIndex === null &&
      draggingLargeMiniIndex === null &&
      draggingHugeMiniIndex === null &&
      !isDraggingTerrain &&
      rotateSelectedBoardPiece(elementRotStep)
    ) {
      scheduleRender();
      e.preventDefault();
    }
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':
      renderConfig.backgroundImageOffsetX -= moveStep;
      changed = true;
      break;
    case 'ArrowRight':
      renderConfig.backgroundImageOffsetX += moveStep;
      changed = true;
      break;
    case 'ArrowUp':
      renderConfig.backgroundImageOffsetY -= moveStep;
      changed = true;
      break;
    case 'ArrowDown':
      renderConfig.backgroundImageOffsetY += moveStep;
      changed = true;
      break;
    case '[':
      renderConfig.backgroundImageScale = Math.max(0.1, renderConfig.backgroundImageScale - scaleStep);
      changed = true;
      break;
    case ']':
      renderConfig.backgroundImageScale = Math.min(4, renderConfig.backgroundImageScale + scaleStep);
      changed = true;
      break;
    case '0':
      if (e.altKey) break;
      renderConfig.backgroundImageOffsetX = FIELD_BG_PRESET.backgroundImageOffsetX;
      renderConfig.backgroundImageOffsetY = FIELD_BG_PRESET.backgroundImageOffsetY;
      renderConfig.backgroundImageScale = FIELD_BG_PRESET.backgroundImageScale;
      renderConfig.backgroundImageRotationDeg = FIELD_BG_PRESET.backgroundImageRotationDeg;
      changed = true;
      break;
    case 'p':
    case 'P': {
      e.preventDefault();
      const ox = Number(renderConfig.backgroundImageOffsetX.toFixed(2));
      const oy = Number(renderConfig.backgroundImageOffsetY.toFixed(2));
      const sc = Number(renderConfig.backgroundImageScale.toFixed(4));
      const baseRot = Number(renderConfig.backgroundImageRotationDeg.toFixed(3));
      const desert = Number(desertUnderlayExtraRotationDeg.toFixed(3));
      const effectiveRot = Number((renderConfig.backgroundImageRotationDeg + desertUnderlayExtraRotationDeg).toFixed(3));
      console.log('[field image] текущая калибровка (скопируйте в FIELD_BG_PRESET / renderConfig):', {
        backgroundImageFit: renderConfig.backgroundImageFit,
        backgroundImageOffsetX: ox,
        backgroundImageOffsetY: oy,
        backgroundImageScale: sc,
        backgroundImageRotationDeg: baseRot,
        desertUnderlayExtraRotationDeg: desert,
        // итог для Renderer.updateConfig (base + desert)
        effectiveBackgroundImageRotationDeg: effectiveRot,
      });
      console.log(
        '[field image] вставка в FIELD_BG_PRESET:',
        JSON.stringify(
          {
            backgroundImageOffsetX: ox,
            backgroundImageOffsetY: oy,
            backgroundImageScale: sc,
            backgroundImageRotationDeg: baseRot,
          },
          null,
          2,
        ),
      );
      break;
    }
    default:
      break;
  }

  if (changed) {
    e.preventDefault();
    renderer.updateConfig({
      backgroundImageOffsetX: renderConfig.backgroundImageOffsetX,
      backgroundImageOffsetY: renderConfig.backgroundImageOffsetY,
      backgroundImageScale: renderConfig.backgroundImageScale,
      backgroundImageRotationDeg:
        renderConfig.backgroundImageRotationDeg + desertUnderlayExtraRotationDeg,
    });
    scheduleRender();
  }
});

function showBoardContextMenuAt(clientX: number, clientY: number): boolean {
  const hex = hexAtScreen(clientX, clientY);

  if (!hex) {
    const obUnit = findOffBoardUnitAtScreen(clientX, clientY);
    if (obUnit !== -1) {
      const unit = units[obUnit];
      effectMarkerMenu.show(clientX, clientY, unit.effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return true;
    }
    const obBig = findOffBoardBigMiniAtScreen(clientX, clientY);
    if (obBig !== -1) {
      const bm = bigMiniatures[obBig];
      effectMarkerMenu.show(clientX, clientY, bm.effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return true;
    }
    const obLarge = findOffBoardLargeMiniAtScreen(clientX, clientY);
    if (obLarge !== -1) {
      effectMarkerMenu.show(clientX, clientY, largeMiniatures[obLarge].effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return true;
    }
    const obHuge = findOffBoardHugeMiniAtScreen(clientX, clientY);
    if (obHuge !== -1) {
      effectMarkerMenu.show(clientX, clientY, hugeMiniatures[obHuge].effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return true;
    }
    return false;
  }

  const clickedUnitIndex = units.findIndex((unit) => unit.position.key === hex.key);
  if (clickedUnitIndex !== -1) {
    const unit = units[clickedUnitIndex];
    effectMarkerMenu.show(clientX, clientY, unit.effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return true;
  }

  const wCtx = screenToBoardWorld(clientX, clientY);
  const bigIdx = findBigMiniAtHex(hex);
  if (
    bigIdx !== -1 &&
    isWorldPointInBigMiniSilhouette(
      wCtx,
      bigMiniPivotWorldForHit(bigIdx),
      bigMiniatures[bigIdx]!.rotationDeg,
      layout,
    )
  ) {
    const bm = bigMiniatures[bigIdx];
    effectMarkerMenu.show(clientX, clientY, bm.effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return true;
  }

  const largeIdx = findLargeMiniAtHex(hex);
  if (
    largeIdx !== -1 &&
    isWorldPointInLargeMiniSilhouette(
      wCtx,
      largeMiniPivotWorldForHit(largeIdx),
      largeMiniatures[largeIdx]!.rotationDeg,
      layout,
    )
  ) {
    effectMarkerMenu.show(clientX, clientY, largeMiniatures[largeIdx].effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return true;
  }

  const hugeIdx = resolveHugeMiniIndexAtPointer(hex, wCtx);
  if (hugeIdx !== -1) {
    effectMarkerMenu.show(clientX, clientY, hugeMiniatures[hugeIdx].effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return true;
  }

  const vi = findEtherVortexAtHex(hex);
  if (vi !== -1) {
    etherVortexCrystalPopover.hide();
    const v = etherVortexes[vi];
    etherVortexMenu.show(clientX, clientY, {
      onPickDomain: (domain) => {
        v.domain = domain;
        scheduleRender();
      },
      onClearDomain: () => {
        v.domain = null;
        scheduleRender();
      },
    });
    return true;
  }
  return false;
}

canvas.addEventListener('contextmenu', (e) => {
  if (showBoardContextMenuAt(e.clientX, e.clientY)) {
    e.preventDefault();
  }
});

// ── Multiplayer: full board snapshot (units, terrain, god cards, …) ──

const VALID_EFFECT_IDS = new Set<string>(EFFECT_MARKERS.map((m) => m.id));

function effectMarkersFromStrings(arr: unknown): Set<EffectMarkerId> {
  const s = new Set<EffectMarkerId>();
  if (!Array.isArray(arr)) return s;
  for (const x of arr) {
    if (typeof x === 'string' && VALID_EFFECT_IDS.has(x)) s.add(x as EffectMarkerId);
  }
  return s;
}

function parseEtherDomain(d: unknown): EtherVortexDomainId | null {
  if (d === null) return null;
  if (d === 'life' || d === 'creation' || d === 'death' || d === 'destruction')
    return d;
  return null;
}

function captureBoardSnapshot(): SerializedBoardStateV1 {
  return {
    v: 1,
    units: units.map((u) => ({
      position: { q: u.position.q, r: u.position.r },
      offBoardWorld: u.offBoardWorld,
      walk: u.walk,
      run: u.run,
      rotationDeg: u.rotationDeg,
      health: u.health,
      activated: u.activated,
      effectMarkers: [...u.effectMarkers],
      spawnedFromArmyPanel: u.spawnedFromArmyPanel,
      catalogUnitId: u.catalogUnitId,
      rosterLeaderId: u.rosterLeaderId,
      armyOwnerPlayerSlot: u.armyOwnerPlayerSlot,
      ...(u.broomgarHungerPhase !== undefined
        ? { broomgarHungerPhase: u.broomgarHungerPhase }
        : {}),
    })),
    unitCardData: structuredClone(unitCardData),
    bigMiniatures: bigMiniatures.map((m) => ({
      center: { q: m.center.q, r: m.center.r },
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: [...m.effectMarkers],
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(m.broomgarHungerPhase !== undefined
        ? { broomgarHungerPhase: m.broomgarHungerPhase }
        : {}),
    })),
    bigMiniCardData: structuredClone(bigMiniCardData),
    largeMiniatures: largeMiniatures.map((m) => ({
      anchor: { q: m.anchor.q, r: m.anchor.r },
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: [...m.effectMarkers],
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(m.broomgarHungerPhase !== undefined
        ? { broomgarHungerPhase: m.broomgarHungerPhase }
        : {}),
    })),
    largeMiniCardData: structuredClone(largeMiniCardData),
    hugeMiniatures: hugeMiniatures.map((m) => ({
      anchor: { q: m.anchor.q, r: m.anchor.r },
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: [...m.effectMarkers],
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(m.broomgarHungerPhase !== undefined
        ? { broomgarHungerPhase: m.broomgarHungerPhase }
        : {}),
      spriteOffsetLocal: m.spriteOffsetLocal,
      spriteRotationDeg: m.spriteRotationDeg,
    })),
    hugeMiniCardData: structuredClone(hugeMiniCardData),
    terrains: terrains.map((h) => ({ q: h.q, r: h.r })),
    terrainOffBoardWorlds: terrainOffBoardWorlds.map((p) =>
      p ? { x: p.x, y: p.y } : undefined,
    ),
    terrainRotationDegs: [...terrainRotationDegs],
    etherVortexes: etherVortexes.map((v) => ({
      center: { q: v.center.q, r: v.center.r },
      etherCrystals: v.etherCrystals,
      domain: v.domain,
      rotationDeg: v.rotationDeg,
      offBoardWorld: v.offBoardWorld,
    })),
    godTablePieces: structuredClone(godTablePieces),
    inventoryTablePieces: inventoryTablePieces.map((p) => ({
      rosterLeaderId: p.rosterLeaderId,
      itemId: p.itemId,
      world: { ...p.world },
      spawnedFromArmyPanel: p.spawnedFromArmyPanel,
      armyOwnerPlayerSlot: p.armyOwnerPlayerSlot,
    })),
    ephiriumOpenSpriteIndices: [...ephiriumOpenSpriteIndices],
    godDeckSlots: {
      '0': serializeGodSlotForCapture(0),
      '1': serializeGodSlotForCapture(1),
    },
    sharedDice: diceRoller.exportSharedState(),
    crystalWallets: {
      '0': crystalWalletRecordForSlot(0),
      '1': crystalWalletRecordForSlot(1),
    },
  };
}

function resetTransientMultiplayerInteractionState(): void {
  draggingUnitIndex = null;
  dragOverHex = null;
  dragPreviewPosition = null;
  unitDragPendingIndex = null;
  bigMiniDragPendingIndex = null;
  largeMiniDragPendingIndex = null;
  hugeMiniDragPendingIndex = null;
  terrainDragPending = false;
  terrainDragPendingIndex = null;
  etherVortexDragPending = false;
  etherVortexDragPendingIndex = null;
  isDraggingTerrain = false;
  draggingTerrainIndex = null;
  terrainPreviewWorld = null;
  terrainDragOverCenter = null;
  draggingBigMiniIndex = null;
  bigMiniPreviewPosition = null;
  bigMiniDragOverCenter = null;
  draggingLargeMiniIndex = null;
  largeMiniPreviewPosition = null;
  largeMiniDragOverAnchor = null;
  draggingHugeMiniIndex = null;
  hugeMiniPreviewPosition = null;
  hugeMiniDragOverAnchor = null;
  isDraggingEtherVortex = false;
  draggingEtherVortexIndex = null;
  etherVortexPreviewWorld = null;
  etherVortexDragOverCenter = null;
  isDraggingGodLoose = false;
  godDraggingLooseIndex = null;
  godLooseDragPreviewWorld = null;
  godLooseDragPending = false;
  godLooseDragPendingIndex = null;
  godPieceFlipAnim = null;
  godDragWholeGodDeck = false;
  godLooseCapturePointerId = null;
  hoveredHexUnderPointer = null;
  renderer.setHoveredHex(null);
  clearSelection();
  openHealthControlsUnitIndex = null;
  openHealthControlsBigMiniIndex = null;
  openHealthControlsLargeMiniIndex = null;
  openHealthControlsHugeMiniIndex = null;
}

/** Drop hunger phase for mercenary units (`mercenary` from merged catalog / editor overrides). */
function broomgarHungerPhaseAfterMercenaryStrip(
  catalogUnitId: string | undefined,
  raw: unknown,
): BroomgarHungerPhase | undefined {
  const ph = parseBroomgarHungerPhase(raw);
  if (ph === undefined) return undefined;
  if (catalogUnitId && getCatalogUnit(catalogUnitId)?.mercenary === true) return undefined;
  return ph;
}

function applyBoardSnapshot(raw: unknown): void {
  if (!isSerializedBoardStateV1(raw)) {
    if (import.meta.env.DEV) {
      console.warn('[mp] boardState ignored: snapshot failed validation', raw);
    }
    return;
  }
  const s = raw;
  resetTransientMultiplayerInteractionState();

  units.length = 0;
  for (const u of s.units) {
    const bh = broomgarHungerPhaseAfterMercenaryStrip(u.catalogUnitId, u.broomgarHungerPhase);
    units.push({
      position: new Hex(u.position.q, u.position.r),
      offBoardWorld: u.offBoardWorld,
      walk: u.walk,
      run: u.run,
      rotationDeg: u.rotationDeg,
      health: u.health,
      activated: u.activated,
      effectMarkers: effectMarkersFromStrings(u.effectMarkers),
      spawnedFromArmyPanel: u.spawnedFromArmyPanel,
      catalogUnitId: u.catalogUnitId,
      rosterLeaderId: u.rosterLeaderId,
      armyOwnerPlayerSlot: u.armyOwnerPlayerSlot,
      ...(bh !== undefined ? { broomgarHungerPhase: bh } : {}),
    });
  }

  unitCardData.length = 0;
  unitCardData.push(...structuredClone(s.unitCardData));

  bigMiniatures.length = 0;
  for (const m of s.bigMiniatures) {
    const bh = broomgarHungerPhaseAfterMercenaryStrip(m.catalogUnitId, m.broomgarHungerPhase);
    bigMiniatures.push({
      center: new Hex(m.center.q, m.center.r),
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: effectMarkersFromStrings(m.effectMarkers),
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(bh !== undefined ? { broomgarHungerPhase: bh } : {}),
    });
  }
  bigMiniCardData.length = 0;
  bigMiniCardData.push(...structuredClone(s.bigMiniCardData));

  largeMiniatures.length = 0;
  for (const m of s.largeMiniatures) {
    const bh = broomgarHungerPhaseAfterMercenaryStrip(m.catalogUnitId, m.broomgarHungerPhase);
    largeMiniatures.push({
      anchor: new Hex(m.anchor.q, m.anchor.r),
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: effectMarkersFromStrings(m.effectMarkers),
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(bh !== undefined ? { broomgarHungerPhase: bh } : {}),
    });
  }
  largeMiniCardData.length = 0;
  largeMiniCardData.push(...structuredClone(s.largeMiniCardData));

  hugeMiniatures.length = 0;
  for (const m of s.hugeMiniatures) {
    const bh = broomgarHungerPhaseAfterMercenaryStrip(m.catalogUnitId, m.broomgarHungerPhase);
    hugeMiniatures.push({
      anchor: new Hex(m.anchor.q, m.anchor.r),
      offBoardWorld: m.offBoardWorld,
      walk: m.walk,
      run: m.run,
      rotationDeg: m.rotationDeg,
      health: m.health,
      activated: m.activated,
      effectMarkers: effectMarkersFromStrings(m.effectMarkers),
      spawnedFromArmyPanel: m.spawnedFromArmyPanel,
      catalogUnitId: m.catalogUnitId,
      rosterLeaderId: m.rosterLeaderId,
      armyOwnerPlayerSlot: m.armyOwnerPlayerSlot,
      ...(bh !== undefined ? { broomgarHungerPhase: bh } : {}),
      spriteOffsetLocal: m.spriteOffsetLocal,
      spriteRotationDeg: m.spriteRotationDeg,
    });
  }
  hugeMiniCardData.length = 0;
  hugeMiniCardData.push(...structuredClone(s.hugeMiniCardData));

  terrains.length = 0;
  for (const h of s.terrains) {
    terrains.push(new Hex(h.q, h.r));
  }
  terrainOffBoardWorlds.length = 0;
  for (const p of s.terrainOffBoardWorlds) {
    terrainOffBoardWorlds.push(p ? { x: p.x, y: p.y } : undefined);
  }
  terrainRotationDegs.length = 0;
  if (
    Array.isArray(s.terrainRotationDegs) &&
    s.terrainRotationDegs.length === s.terrains.length
  ) {
    terrainRotationDegs.push(...s.terrainRotationDegs);
  } else {
    const legacy =
      typeof s.terrainRotationDeg === 'number' ? s.terrainRotationDeg : 0;
    for (let i = 0; i < s.terrains.length; i++) terrainRotationDegs.push(legacy);
  }

  etherVortexes.length = 0;
  for (const v of s.etherVortexes) {
    etherVortexes.push({
      center: new Hex(v.center.q, v.center.r),
      etherCrystals: v.etherCrystals,
      domain: parseEtherDomain(v.domain),
      rotationDeg: v.rotationDeg ?? 0,
      offBoardWorld: v.offBoardWorld,
    });
  }

  godTablePieces.length = 0;
  godTablePieces.push(...structuredClone(s.godTablePieces));

  inventoryTablePieces.length = 0;
  for (const p of s.inventoryTablePieces ?? []) {
    inventoryTablePieces.push({
      rosterLeaderId: p.rosterLeaderId,
      itemId: p.itemId,
      world: { ...p.world },
      spawnedFromArmyPanel: p.spawnedFromArmyPanel,
      armyOwnerPlayerSlot: p.armyOwnerPlayerSlot,
    });
  }

  if (s.godDeckSlots) {
    applyGodDeckSlotsFromSnapshot(s.godDeckSlots);
  }

  ephiriumOpenSpriteIndices = [...(s.ephiriumOpenSpriteIndices ?? [])].slice(0, 2);
  ephiriumVortexUi.applyOpenIndices(ephiriumOpenSpriteIndices);

  diceRoller.applySharedStateFromBoard(parseSharedDiceState(s.sharedDice));

  loadCrystalWalletsFromSnapshot(s.crystalWallets);

  refreshGodDock();
  armyBuilderPanel.refresh();
  updateMovementHighlights();
  updateBigMiniMovementHighlights();
  updateLargeMiniMovementHighlights();
  updateHugeMiniMovementHighlights();
  updateAttackRangeHighlights();
  updateUnitCard();
}

registerBoardSyncApi({
  capture: captureBoardSnapshot,
  apply: applyBoardSnapshot,
});

function mountTouchBoardActionsBar(): void {
  const bar = document.createElement('div');
  bar.className = 'touch-board-actions';
  bar.setAttribute('aria-label', 'Быстрые действия');
  const add = (label: string, title: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'touch-board-action-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      fn();
    });
    bar.appendChild(b);
  };
  add('Копия', 'Копировать выделение (Ctrl+C)', () => {
    copySelected();
    scheduleRender();
  });
  add('Вставить', 'Вставить (Ctrl+V)', () => {
    pasteClipboard();
    scheduleRender();
  });
  add('Дубль', 'Дублировать (Ctrl+D)', () => {
    duplicateSelected();
    scheduleRender();
  });
  add('↺', 'Поворот против часовой (как Q). В настройках — закрепить Shift для крупного шага.', () => {
    const step = shiftModActive() ? ELEMENT_ROT_STEP_FAST : ELEMENT_ROT_STEP;
    if (rotateSelectedBoardPiece(-step)) scheduleRender();
  });
  add('↻', 'Поворот по часовой (как E). В настройках — закрепить Shift для крупного шага.', () => {
    const step = shiftModActive() ? ELEMENT_ROT_STEP_FAST : ELEMENT_ROT_STEP;
    if (rotateSelectedBoardPiece(step)) scheduleRender();
  });
  document.body.appendChild(bar);
}

const toolbarMountEl = armyBuilderPanel.getToolbarMount();
initMultiplayerSession({
  renderer,
  scheduleRender,
  screenToBoard: screenToBoardWorld,
  onViewPlayerSlot: applyMultiplayerViewSeat,
  onPeerCrystalWalletDelta: onPeerCrystalWalletDeltaFromNetwork,
  toolbarMount: toolbarMountEl,
});
const pwaInstallHandle = createPwaInstallMenuFlow();
const appSettingsHandle = mountAppSettingsToolbar(null, {
  getAlt: () => touchAltSticky,
  getShift: () => touchShiftSticky,
  setAlt: setTouchAltSticky,
  setShift: setTouchShiftSticky,
});
mountAppMoreMenu(toolbarMountEl, {
  onCatalogEditor: () => catalogEditorPanel.setOpen(true),
  onInstallApp: pwaInstallHandle ? () => pwaInstallHandle.open() : undefined,
  onSettings: () => appSettingsHandle.open(),
});
mountTouchBoardActionsBar();

/**
 * Console helper: выровняйте арт (Alt+стрелки / Alt+Q,E), выберите huge-модель, затем в консоли:
 * `hexBoardDumpHugeArtAlign()` — скопируйте вывод и отправьте агенту для записи в `src/catalog/units/<id>.json`.
 */
function hexBoardDumpHugeArtAlign(): string {
  if (selectedHugeMiniIndex === null) {
    const msg = '[hexBoard] Выберите огромную миниатюру на столе.';
    console.warn(msg);
    return msg;
  }
  const i = selectedHugeMiniIndex;
  const m = hugeMiniatures[i]!;
  const card = hugeMiniCardData[i]!;
  const snippetForCard = {
    hugeSpriteOffsetLocal: m.spriteOffsetLocal ?? { x: 0, y: 0 },
    hugeSpriteRotationDeg: m.spriteRotationDeg ?? 0,
  };
  const block = {
    catalogUnitId: card.catalogUnitId ?? null,
    cardName: card.name,
    hint: 'Вставьте поля из snippetForCard в объект card в src/catalog/units/<catalogUnitId>.json',
    snippetForCard,
  };
  const json = JSON.stringify(block, null, 2);
  console.log('[hexBoard] Данные для каталога (отправьте агенту или вставьте в JSON вручную):\n');
  console.log(json);
  return json;
}

if (typeof window !== 'undefined') {
  (window as unknown as { hexBoardDumpHugeArtAlign: () => string }).hexBoardDumpHugeArtAlign =
    hexBoardDumpHugeArtAlign;
}
