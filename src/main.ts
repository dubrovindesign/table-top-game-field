/**
 * Entry point — wires everything together.
 */

import { Hex, Layout, type Point } from './hex';
import { HexGrid } from './grid';
import {
  Camera,
  GOD_TABLE_CARD_FLIP_MS,
  GOD_TABLE_CARD_HW,
  GOD_TABLE_CARD_HH,
  GOD_TABLE_CARD_ROT_CW_DEG,
  Renderer,
  defaultRenderConfig,
} from './renderer';
import { DiceRoller } from './dice';
import { UnitCard, type AttackAbility, type DiceRequest, type UnitCardData } from './unitCard';
import {
  BIG_MINI_VISUAL_SCALE,
  BIG_UNIT_HEALTH_UI_SCALE,
  bigMiniHealthBadgeCenterWorld,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
  smallUnitHealthBadgeCenterWorldRad,
} from './healthUi';
import { CrystalWallet } from './crystalWallet';
import { getCatalogUnit, getLeader, LEADER_MINI_MAX_COPIES, maxCopiesForSlot } from './armyCatalog';
import { ArmyBuilderPanel, DND_MIME, type ArmyDragPayload } from './armyBuilderPanel';
import { EphiriumVortexUi } from './ephiriumVortexUi';
import {
  etherVortexCrystalBadgeHitRadiusWorld,
  etherVortexFootprint,
  type EtherVortexState,
} from './etherVortex';
import { EtherVortexContextMenu } from './etherVortexContextMenu';
import { EtherVortexCrystalPopover } from './etherVortexCrystalPopover';
import { EffectMarkerMenu, type EffectMarkerId } from './effectMarkerMenu';
import { getGodCardById, type GodTablePiece } from './godCards';
import './style.css';

// ── Config ─────────────────────────────────────────────────────

const HEX_SIZE = 28;
const BOARD_ROTATION_DEG = -10;
const UNIT_WALK_RANGE = 4;
const UNIT_RUN_RANGE = 7;
const BIG_MINI_WALK_RANGE = 2;
const BIG_MINI_RUN_RANGE = 4;
const BG_CALIBRATION_STEP = 1;
const BG_CALIBRATION_STEP_FAST = 4;
const BG_CALIBRATION_SCALE_STEP = 0.001;
const BG_CALIBRATION_ROT_STEP = 0.1;
const ELEMENT_ROT_STEP = 5;
const ELEMENT_ROT_STEP_FAST = 15;
/** Pixels before a mousedown on the selected unit counts as drag (otherwise = click to deselect). */
const UNIT_DRAG_THRESHOLD_PX = 5;
const UNIT_HEALTH_MIN = 0;

/** Saved calibration for field background art — align with hex grid (adjust via bg hotkeys) */
const FIELD_BG_PRESET = {
  backgroundImageOffsetX: 0,
  backgroundImageOffsetY: 48,
  backgroundImageScale: 0.945,
  backgroundImageRotationDeg: 105.7,
};

const SMALL_UNIT_SPRITES = ['/tern-unit-1.jpg', '/Frame 144.png'] as const;
const BIG_UNIT_SPRITE = '/Frame 118.png';

// ── Bootstrap ──────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('#game-canvas not found');

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
resizeCanvas();

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
/** Selected loose god piece index (same pattern as terrain / big mini). */
let selectedGodTablePieceIndex: number | null = null;
const GOD_DECK_LONG_PRESS_MS = 1000;
let godPiecePointerDownAt = 0;
/** After ≥1 s press on a deck, next drag moves the whole stack (otherwise peel top card). */
let godDeckDragWholeStackAfterHold = false;
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

// ── Renderer ───────────────────────────────────────────────────

const renderConfig = {
  ...defaultRenderConfig,
  showCoordinates: false,
  showGrid: false,
  defaultHexFillColor: 'rgba(0, 0, 0, 0)',
  backgroundImageSrc: '/fieldwithtrees.png',
  backgroundImageOpacity: 1,
  backgroundImageFit: 'cover' as const,
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
  /** Active effect markers shown on the miniature. */
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

const units: Unit[] = [
  {
    position: new Hex(2, 0),
    walk: UNIT_WALK_RANGE,
    run: UNIT_RUN_RANGE,
    rotationDeg: 0,
    health: 10,
    effectMarkers: new Set(),
  },
  {
    position: new Hex(5, -1),
    walk: UNIT_WALK_RANGE,
    run: UNIT_RUN_RANGE,
    rotationDeg: 0,
    health: 10,
    effectMarkers: new Set(),
  },
];
let selectedUnitIndex: number | null = null;
let openHealthControlsUnitIndex: number | null = null;
let terrains: Hex[] = [new Hex(8, -2)];
/** Ether vortexes — same hexon footprint as terrain; domain tint + crystal count on canvas. */
let etherVortexes: EtherVortexState[] = [
  { center: new Hex(11, 4), etherCrystals: 0, domain: null },
];
const etherVortexMenu = new EtherVortexContextMenu();
const effectMarkerMenu = new EffectMarkerMenu();
const etherVortexCrystalPopover = new EtherVortexCrystalPopover();
let selectedTerrainIndex: number | null = null;
let selectedEtherVortexIndex: number | null = null;
/** Parallel array: off-board world positions for terrain hexons. */
let terrainOffBoardWorlds: (Point | undefined)[] = terrains.map(() => undefined);
let terrainRotationDeg = 0;
/** Show selected piece card + move ranges only after Alt+click selection. */
let showSelectedDetails = false;
type SelectedEntity =
  | { kind: 'small'; index: number }
  | { kind: 'big'; index: number }
  | { kind: 'terrain'; index: number }
  | { kind: 'etherVortex'; index: number }
  | { kind: 'godTable'; index: number }
  | null;

type ClipboardEntity =
  | { kind: 'small'; unit: Unit; card: UnitCardData }
  | { kind: 'big'; unit: BigMini; card: UnitCardData }
  | { kind: 'terrain'; center: Hex }
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
  /** Active effect markers shown on the miniature. */
  effectMarkers: Set<EffectMarkerId>;
  spawnedFromArmyPanel?: boolean;
  catalogUnitId?: string;
  rosterLeaderId?: string;
};

const bigMiniatures: BigMini[] = [
  {
    center: new Hex(5, -1),
    walk: BIG_MINI_WALK_RANGE,
    run: BIG_MINI_RUN_RANGE,
    rotationDeg: 0,
    health: 20,
    effectMarkers: new Set(),
  },
];
let selectedBigMiniIndex: number | null = null;
let openHealthControlsBigMiniIndex: number | null = null;

/** Army Builder panel (assigned after `DiceRoller` wiring). */
let armyBuilderPanel!: ArmyBuilderPanel;

/** Alt + hover: preview ranges. Shift + hover: show floating card. */
let altKeyHeld = false;
let shiftKeyHeld = false;
type AltHoverTarget = { kind: 'small'; index: number } | { kind: 'big'; index: number };
let altHoverTarget: AltHoverTarget | null = null;
let shiftHoverTarget: AltHoverTarget | null = null;
/** Attack row hovered on unit card → board highlights attack range. */
let hoveredAttack: AttackAbility | null = null;
let pointerScreenX = 0;
let pointerScreenY = 0;
let lastHoverCardSig: string | null = null;

// ── Unit card data (from army catalog; initial board minis are not roster-tagged) ──

function cloneCatalogCard(unitId: string): UnitCardData {
  const u = getCatalogUnit(unitId);
  if (!u) throw new Error(`Unknown catalog unit: ${unitId}`);
  return structuredClone(u.card);
}

const unitCardData: UnitCardData[] = [
  cloneCatalogCard('tern_vanguard'),
  cloneCatalogCard('tern_ranger'),
];

const bigMiniCardData: UnitCardData[] = [cloneCatalogCard('iron_golem')];

const unitCard = new UnitCard(document.body);

unitCard.onAttackHover = (attack: AttackAbility | null) => {
  hoveredAttack = attack;
  updateAttackRangeHighlights();
  renderer.render();
};

/** Which unit the visible card refers to (matches updateUnitCard priority). */
function cardUnitForAttackHighlight(): AltHoverTarget | null {
  if (shiftKeyHeld && shiftHoverTarget !== null) return shiftHoverTarget;
  if (selectedUnitIndex !== null && showSelectedDetails) {
    return { kind: 'small', index: selectedUnitIndex };
  }
  if (selectedBigMiniIndex !== null && showSelectedDetails) {
    return { kind: 'big', index: selectedBigMiniIndex };
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

function computeBigMiniAttackHexonCenters(bigIndex: number, attackRange: number): Hex[] {
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
  const selected = bigMiniatures[bigIndex];
  const visited = new Map<string, number>([[selected.center.key, 0]]);
  const queue: Hex[] = [selected.center];
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

function updateAttackRangeHighlights(): void {
  const atk = hoveredAttack;
  const who = cardUnitForAttackHighlight();
  if (!atk || !who) {
    renderer.setAttackRangeOverlay([], []);
    return;
  }
  if (who.kind === 'small') {
    const from = units[who.index].position;
    renderer.setAttackRangeOverlay(computeSmallAttackHexes(from, atk.range), []);
  } else {
    renderer.setAttackRangeOverlay([], computeBigMiniAttackHexonCenters(who.index, atk.range));
  }
}

function updateUnitCard(): void {
  if (!shiftKeyHeld) {
    lastHoverCardSig = null;
  }

  if (
    shiftKeyHeld &&
    shiftHoverTarget !== null &&
    !armyBuilderPanel.isScreenPointOverPanel(pointerScreenX, pointerScreenY)
  ) {
    const sig = `${shiftHoverTarget.kind}-${shiftHoverTarget.index}`;
    if (shiftHoverTarget.kind === 'small') {
      const u = units[shiftHoverTarget.index];
      const data = unitCardData[shiftHoverTarget.index];
      if (data) {
        data.health = u.health;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY });
        return;
      }
    } else {
      const m = bigMiniatures[shiftHoverTarget.index];
      const data = bigMiniCardData[shiftHoverTarget.index];
      if (data) {
        data.health = m.health;
        if (lastHoverCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastHoverCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY });
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
      unitCard.show(data);
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
      unitCard.show(data);
      return;
    }
  }
  unitCard.hide();
}

function getSelectedEntity(): SelectedEntity {
  if (selectedUnitIndex !== null) return { kind: 'small', index: selectedUnitIndex };
  if (selectedBigMiniIndex !== null) return { kind: 'big', index: selectedBigMiniIndex };
  if (selectedTerrainIndex !== null) return { kind: 'terrain', index: selectedTerrainIndex };
  if (selectedEtherVortexIndex !== null) return { kind: 'etherVortex', index: selectedEtherVortexIndex };
  if (selectedGodTablePieceIndex !== null) return { kind: 'godTable', index: selectedGodTablePieceIndex };
  return null;
}

function clearSelection(): void {
  selectedUnitIndex = null;
  selectedBigMiniIndex = null;
  selectedTerrainIndex = null;
  selectedEtherVortexIndex = null;
  selectedGodTablePieceIndex = null;
  showSelectedDetails = false;
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

/** Helper: get off-board world positions for big miniatures. */
function bigMiniOffBoards(): (Point | undefined)[] {
  return bigMiniatures.map((m) => m.offBoardWorld);
}

/** Push current effect markers from data model into renderer. */
function syncEffectMarkersToRenderer(): void {
  renderer.setUnitEffectMarkers(units.map((u) => [...u.effectMarkers]));
  renderer.setBigMiniEffectMarkers(bigMiniatures.map((m) => [...m.effectMarkers]));
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

  if (altKeyHeld && altHoverTarget?.kind === 'small') {
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
    unitCardData.map((data, index) => data.sprite ?? SMALL_UNIT_SPRITES[index % SMALL_UNIT_SPRITES.length] ?? null),
  );
  renderer.setBigMiniSpriteSource(BIG_UNIT_SPRITE);
  renderer.setUnitRotations(units.map((u) => u.rotationDeg));
  renderer.setUnitHealth(units.map((u) => u.health), openHealthControlsUnitIndex);
  renderer.setBigMiniHealth(bigMiniatures.map((m) => m.health), openHealthControlsBigMiniIndex);
  renderer.setTerrainRotation(terrainRotationDeg);
  renderer.setBigMiniRotations(bigMiniatures.map((m) => m.rotationDeg));
}

/**
 * Rotate the piece under the given hex (hover). Priority matches draw order: unit on top,
 * then big miniature footprint, then terrain flower.
 */
function rotateElementUnderHex(hex: Hex | null, deltaDeg: number): boolean {
  if (!hex) return false;
  const unitIdx = units.findIndex((u) => u.position.key === hex.key);
  if (unitIdx !== -1) {
    units[unitIdx].rotationDeg += deltaDeg;
    return true;
  }
  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    bigMiniatures[bigIdx].rotationDeg += deltaDeg;
    return true;
  }
  if (findEtherVortexAtHex(hex) !== -1) {
    terrainRotationDeg += deltaDeg;
    return true;
  }
  if (isHexInTerrain(hex)) {
    terrainRotationDeg += deltaDeg;
    return true;
  }
  return false;
}

function updateBigMiniMovementHighlights(): void {
  /** Keep selection ring on selected big mini; walk/run can preview another one (Alt-hover). */
  const ringIndex = selectedBigMiniIndex;

  if (altKeyHeld && altHoverTarget?.kind === 'big') {
    const { walk, run } = computeBigMiniWalkRunCenters(altHoverTarget.index);
    renderer.setBigMiniMovement(ringIndex, walk, run);
    return;
  }
  if (altKeyHeld && altHoverTarget?.kind === 'small') {
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

// ── Dice roller UI ─────────────────────────────────────────────

const diceRoller = new DiceRoller(document.body);

// Wire unit card → dice roller
unitCard.onDiceRequest = (req: DiceRequest) => {
  diceRoller.addDice(req.pool, req.source);
};

new EphiriumVortexUi(document.body);

new CrystalWallet(document.body);

armyBuilderPanel = new ArmyBuilderPanel(document.body, {
  getAltKeyHeld: () => altKeyHeld,
  getUsedCount: (leaderId, unitId) => countRosterCopies(leaderId, unitId),
  getPointsSpent: () => sumRosterPoints(),
  onDiceRequest: (req) => diceRoller.addDice(req.pool, req.source),
});

// ── Render loop ────────────────────────────────────────────────

/** Redraw once Langar is ready so canvas HP digits use the webfont. */
if (document.fonts) {
  void document.fonts.load('16px Langar').then(() => scheduleRender());
}

let needsRender = true;

function scheduleRender(): void {
  needsRender = true;
}

function loop(): void {
  if (godPieceFlipAnim && performance.now() - godPieceFlipAnim.startMs >= godPieceFlipAnim.durationMs) {
    godPieceFlipAnim = null;
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
    renderer.setGodPieceFlipAnim(godPieceFlipAnim);
    updateMovementHighlights();
    updateBigMiniMovementHighlights();
    updateAttackRangeHighlights();
    updateUnitCard();
    renderer.render();
    needsRender = false;
  }
  if (godPieceFlipAnim !== null) needsRender = true;
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

// ── Helper: get hex under cursor ───────────────────────────────

function screenToBoardWorld(sx: number, sy: number): { x: number; y: number } {
  const world = camera.screenToWorld(sx, sy);
  const boardCenter = getBoardCenterWorld();
  const angleRad = (BOARD_ROTATION_DEG * Math.PI) / 180;
  const inverseAngle = -angleRad;
  const dx = world.x - boardCenter.x;
  const dy = world.y - boardCenter.y;
  return {
    x: boardCenter.x + dx * Math.cos(inverseAngle) - dy * Math.sin(inverseAngle),
    y: boardCenter.y + dx * Math.sin(inverseAngle) + dy * Math.cos(inverseAngle),
  };
}

/** Ellipse in card-local space (matches board R then GOD_TABLE_CARD_ROT_CW_DEG on canvas). */
function godEllipseContains(world: Point, center: Point, hw: number, hh: number): boolean {
  const dx = world.x - center.x;
  const dy = world.y - center.y;
  const B = (BOARD_ROTATION_DEG * Math.PI) / 180;
  const dpx = dx * Math.cos(B) + dy * Math.sin(B);
  const dpy = -dx * Math.sin(B) + dy * Math.cos(B);
  const C = (GOD_TABLE_CARD_ROT_CW_DEG * Math.PI) / 180;
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
  const faceUp = incoming.faceUp;
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
    godDeckDragWholeStackAfterHold = false;
    releaseGodLoosePointerCaptureIfAny();
  } else if (isDraggingGodLoose && godDraggingLooseIndex !== null && godDraggingLooseIndex > i) {
    godDraggingLooseIndex -= 1;
  }

  if (godLooseDragPending && godLooseDragPendingIndex === i) {
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDeckDragWholeStackAfterHold = false;
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

function isHexInTerrain(hex: Hex): boolean {
  return findTerrainAtHex(hex) !== -1;
}

function findBigMiniAtHex(hex: Hex): number {
  return bigMiniatures.findIndex((m) =>
    hexonCells(m.center).some((cell) => cell.key === hex.key),
  );
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

function countRosterCopies(leaderId: string, unitId: string): number {
  let n = 0;
  for (const u of units) {
    if (
      u.spawnedFromArmyPanel &&
      u.rosterLeaderId === leaderId &&
      u.catalogUnitId === unitId
    ) {
      n++;
    }
  }
  for (const m of bigMiniatures) {
    if (
      m.spawnedFromArmyPanel &&
      m.rosterLeaderId === leaderId &&
      m.catalogUnitId === unitId
    ) {
      n++;
    }
  }
  return n;
}

function sumRosterPoints(): number {
  let s = 0;
  for (const u of units) {
    if (!u.spawnedFromArmyPanel || !u.catalogUnitId) continue;
    const d = getCatalogUnit(u.catalogUnitId);
    if (d) s += d.points;
  }
  for (const m of bigMiniatures) {
    if (!m.spawnedFromArmyPanel || !m.catalogUnitId) continue;
    const d = getCatalogUnit(m.catalogUnitId);
    if (d) s += d.points;
  }
  return s;
}

function isHexBlockedForSmall(hex: Hex): boolean {
  if (!grid.has(hex)) return true;
  if (units.some((u) => u.position.key === hex.key)) return true;
  for (const m of bigMiniatures) {
    if (hexonCells(m.center).some((c) => c.key === hex.key)) return true;
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
  const rosterMeta = {
    spawnedFromArmyPanel: true as const,
    catalogUnitId: unitId,
    rosterLeaderId: leaderId,
  };

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
        effectMarkers: new Set(),
        ...rosterMeta,
      });
    } else {
      units.push({
        position: layout.pixelToHex(world),
        offBoardWorld: { ...world },
        walk: card.walk,
        run: card.run,
        rotationDeg: 0,
        health: card.health,
        effectMarkers: new Set(),
        ...rosterMeta,
      });
    }
    unitCardData.push(card);
    clearSelection();
    selectedUnitIndex = units.length - 1;
    armyBuilderPanel.refresh();
    scheduleRender();
    return true;
  }

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
      effectMarkers: new Set(),
      ...rosterMeta,
    });
  } else {
    bigMiniatures.push({
      center,
      offBoardWorld: { ...world },
      walk: card.walk,
      run: card.run,
      rotationDeg: 0,
      health: card.health,
      effectMarkers: new Set(),
      ...rosterMeta,
    });
  }
  bigMiniCardData.push(card);
  clearSelection();
  selectedBigMiniIndex = bigMiniatures.length - 1;
  armyBuilderPanel.refresh();
  scheduleRender();
  return true;
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
  if (!def || def.card.size !== 'small') return false;
  if (countRosterCopies(leaderId, unitId) >= LEADER_MINI_MAX_COPIES) return false;

  const card = structuredClone(def.card);
  const rosterMeta = {
    spawnedFromArmyPanel: true as const,
    catalogUnitId: unitId,
    rosterLeaderId: leaderId,
  };

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
      effectMarkers: new Set(),
      ...rosterMeta,
    });
  } else {
    units.push({
      position: layout.pixelToHex(world),
      offBoardWorld: { ...world },
      walk: card.walk,
      run: card.run,
      rotationDeg: 0,
      health: card.health,
      effectMarkers: new Set(),
      ...rosterMeta,
    });
  }
  unitCardData.push(card);
  clearSelection();
  selectedUnitIndex = units.length - 1;
  armyBuilderPanel.refresh();
  scheduleRender();
  return true;
}

function parseArmyDragPayload(raw: string): ArmyDragPayload | null {
  try {
    const o = JSON.parse(raw) as Partial<ArmyDragPayload> & {
      unitId?: string;
      leaderId?: string;
      cardId?: string;
    };
    if (o.kind === 'god' && typeof o.cardId === 'string') {
      return { kind: 'god', cardId: o.cardId };
    }
    if (typeof o.unitId !== 'string' || typeof o.leaderId !== 'string') return null;
    if (o.kind === 'leader') {
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
    scheduleRender();
    return;
  }
  if (p.kind === 'leader') {
    trySpawnLeaderMiniFromArmyBuilder(p.leaderId, p.unitId, clientX, clientY);
  } else {
    trySpawnTroopFromArmyBuilder(p.unitId, p.leaderId, clientX, clientY);
  }
}

function refreshAltHoverTarget(hex: Hex | null): void {
  if (!altKeyHeld || !hex) {
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
  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    altHoverTarget = { kind: 'big', index: bigIdx };
    return;
  }
  altHoverTarget = null;
}

function refreshShiftHoverTarget(hex: Hex | null): void {
  if (!shiftKeyHeld || !hex) {
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
  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    shiftHoverTarget = { kind: 'big', index: bigIdx };
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

function tryPromoteUnitDragFromPending(e: MouseEvent): void {
  if (godLooseDragPending || isDraggingGodLoose) return;
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
  scheduleRender();
}

function tryPromoteBigMiniDragFromPending(e: MouseEvent): void {
  if (godLooseDragPending || isDraggingGodLoose) return;
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
  scheduleRender();
}

function tryPromoteTerrainDragFromPending(e: MouseEvent): void {
  if (godLooseDragPending || isDraggingGodLoose) return;
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
  scheduleRender();
}

function tryPromoteEtherVortexDragFromPending(e: MouseEvent): void {
  if (godLooseDragPending || isDraggingGodLoose) return;
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
  scheduleRender();
}

function tryPromoteGodLooseDrag(e: MouseEvent): void {
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

  if (piece.kind === 'deck' && !godDeckDragWholeStackAfterHold) {
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

  godDeckDragWholeStackAfterHold = false;
  godLooseDragPreviewWorld = previewW;
  scheduleRender();
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
  if (sel.kind === 'etherVortex') {
    const v = etherVortexes[sel.index];
    clipboardEntity = {
      kind: 'etherVortex',
      state: {
        center: new Hex(v.center.q, v.center.r),
        etherCrystals: v.etherCrystals,
        domain: v.domain,
        offBoardWorld: v.offBoardWorld ? { ...v.offBoardWorld } : undefined,
      },
    };
    return;
  }
  const t = terrains[sel.index];
  clipboardEntity = { kind: 'terrain', center: new Hex(t.q, t.r) };
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
    units.push({ ...clipboardEntity.unit, position: nextPos, effectMarkers: new Set(clipboardEntity.unit.effectMarkers) });
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
    bigMiniatures.push({ ...clipboardEntity.unit, center: nextCenter, effectMarkers: new Set(clipboardEntity.unit.effectMarkers) });
    bigMiniCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedBigMiniIndex = bigMiniatures.length - 1;
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
  if (sel.kind === 'etherVortex') {
    etherVortexes.splice(sel.index, 1);
    clearSelection();
    return;
  }
  terrains.splice(sel.index, 1);
  terrainOffBoardWorlds.splice(sel.index, 1);
  clearSelection();
}

function boardWorldToScreen(world: { x: number; y: number }): { x: number; y: number } {
  const boardCenter = getBoardCenterWorld();
  const angleRad = (BOARD_ROTATION_DEG * Math.PI) / 180;
  const dx = world.x - boardCenter.x;
  const dy = world.y - boardCenter.y;
  const rotatedX = boardCenter.x + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
  const rotatedY = boardCenter.y + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
  return {
    x: rotatedX * camera.zoom + camera.offsetX,
    y: rotatedY * camera.zoom + camera.offsetY,
  };
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
  const rotRad = (units[unitIndex].rotationDeg * Math.PI) / 180;
  const effectiveR = halfH * SMALL_UNIT_HEALTH_BADGE_SCALE;
  const badgeCenterWorld = smallUnitHealthBadgeCenterWorldRad(
    unitCenterWorld,
    rotRad,
    layout,
  );
  const badgeRadiusWorld = effectiveR * 0.48;
  const buttonRadiusWorld = badgeRadiusWorld * 0.55;
  const buttonOffsetWorld = badgeRadiusWorld * 1.55;
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen({
      x: badgeCenterWorld.x - buttonOffsetWorld,
      y: badgeCenterWorld.y,
    }),
    plusCenter: boardWorldToScreen({
      x: badgeCenterWorld.x + buttonOffsetWorld,
      y: badgeCenterWorld.y,
    }),
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
    rotationDeg,
    layout,
  );
  const buttonRadiusWorld = badgeRadiusWorld * 0.55;
  const buttonOffsetWorld = badgeRadiusWorld * 1.55;
  return {
    badgeCenter: boardWorldToScreen(badgeCenterWorld),
    badgeRadius: badgeRadiusWorld * camera.zoom,
    minusCenter: boardWorldToScreen({
      x: badgeCenterWorld.x - buttonOffsetWorld,
      y: badgeCenterWorld.y,
    }),
    plusCenter: boardWorldToScreen({
      x: badgeCenterWorld.x + buttonOffsetWorld,
      y: badgeCenterWorld.y,
    }),
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
    const badge = renderer.getEtherVortexCrystalBadgeBoardAtPivot(pivot, terrainRotationDeg);
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

  for (let i = 0; i < units.length; i++) {
    const geom = getUnitHealthUiGeometry(i);
    if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
      openHealthControlsUnitIndex = i;
      openHealthControlsBigMiniIndex = null;
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
      return true;
    }
  }

  if (openHealthControlsUnitIndex !== null || openHealthControlsBigMiniIndex !== null) {
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    return true;
  }
  return false;
}

// ── Input: mouse hover + eraser drag ───────────────────────────

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  camera.offsetX = e.clientX - panStartX;
  camera.offsetY = e.clientY - panStartY;
  scheduleRender();
});

window.addEventListener('pointermove', (e) => {
  pointerScreenX = e.clientX;
  pointerScreenY = e.clientY;
  if (godLooseDragPending && godLooseDragPendingIndex !== null) {
    const pc = godTablePieces[godLooseDragPendingIndex];
    if (pc?.kind === 'deck' && Date.now() - godPiecePointerDownAt >= GOD_DECK_LONG_PRESS_MS) {
      godDeckDragWholeStackAfterHold = true;
    }
  }
  tryPromoteGodLooseDrag(e);
  if (isDraggingGodLoose) {
    godLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    scheduleRender();
  }
});

canvas.addEventListener('mousemove', (e) => {
  pointerScreenX = e.clientX;
  pointerScreenY = e.clientY;
  tryPromoteGodLooseDrag(e);
  tryPromoteUnitDragFromPending(e);
  tryPromoteBigMiniDragFromPending(e);
  tryPromoteTerrainDragFromPending(e);
  tryPromoteEtherVortexDragFromPending(e);

  const hex = hexAtScreen(e.clientX, e.clientY);
  if (!hex) {
    hoveredHexUnderPointer = null;
    renderer.setHoveredHex(null);
    refreshAltHoverTarget(null);
    refreshShiftHoverTarget(null);
    if (draggingUnitIndex !== null && !isDraggingGodLoose) {
      dragOverHex = null;
      dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
      renderer.setDragState(draggingUnitIndex, null, dragPreviewPosition);
    }
    if (isDraggingTerrain && !isDraggingGodLoose) {
      terrainPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
      terrainDragOverCenter = null;
      renderer.setTerrain(terrains, terrainPreviewWorld, true, draggingTerrainIndex, null, selectedTerrainIndex, terrainOffBoardWorlds);
    }
    if (draggingBigMiniIndex !== null && !isDraggingGodLoose) {
      bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
      bigMiniDragOverCenter = null;
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), bigMiniPreviewPosition, draggingBigMiniIndex, null, bigMiniOffBoards());
    }
    if (isDraggingEtherVortex && !isDraggingGodLoose) {
      etherVortexPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
      etherVortexDragOverCenter = null;
      renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, null);
    }
    if (isDraggingGodLoose) {
      godLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
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
    dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  }
  if (isDraggingTerrain && !isDraggingGodLoose) {
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
  }
  if (draggingBigMiniIndex !== null && !isDraggingGodLoose) {
    bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    bigMiniDragOverCenter = nearestHexonCenterFromWorld(bigMiniPreviewPosition);
    renderer.setBigMiniatures(
      bigMiniatures.map((m) => m.center),
      bigMiniPreviewPosition,
      draggingBigMiniIndex,
      bigMiniDragOverCenter,
      bigMiniOffBoards(),
    );
  }
  if (isDraggingEtherVortex && !isDraggingGodLoose) {
    etherVortexPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    etherVortexDragOverCenter = nearestHexonCenterFromWorld(etherVortexPreviewWorld);
    renderer.setEtherVortexDrag(draggingEtherVortexIndex, etherVortexPreviewWorld, etherVortexDragOverCenter);
  }
  if (isDraggingGodLoose) {
    godLooseDragPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
  }

  scheduleRender();
});

canvas.addEventListener('mouseleave', () => {
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
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDeckDragWholeStackAfterHold = false;
    scheduleRender();
  }
  if (isDraggingGodLoose && godDraggingLooseIndex !== null) {
    const w =
      godLooseDragPreviewWorld ?? screenToBoardWorld(e.clientX, e.clientY);
    const idx = godDraggingLooseIndex;
    const entry = godTablePieces[idx];
    if (entry) {
      const mergeI = godPieceHitIndexFromWorld(w, idx);
      if (mergeI !== null) {
        const target = godTablePieces[mergeI]!;
        const merged = withGodPieceWorld(
          normalizeGodTablePiece(mergeGodTablePieces(entry, target)),
          w,
        );
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
    isDraggingGodLoose = false;
    godDraggingLooseIndex = null;
    godLooseDragPreviewWorld = null;
    godLooseDragPending = false;
    godLooseDragPendingIndex = null;
    godDeckDragWholeStackAfterHold = false;
    scheduleRender();
  }
}

function onWindowGodPointerEnd(e: PointerEvent): void {
  finishGodLooseDragIfActive(e);
}

/** Loose god cards on canvas (primary button). */
function tryHandleGodTablePrimaryDown(clientX: number, clientY: number, altKey: boolean): boolean {
  if (!isPointOverCanvas(clientX, clientY)) return false;
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
      clearSelection();
      selectedGodTablePieceIndex = looseI;
      godPiecePointerDownAt = Date.now();
      godDeckDragWholeStackAfterHold = false;
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
    const raw = e.dataTransfer?.getData(DND_MIME);
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
  if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleMiniatureHealthClick(e.clientX, e.clientY)) {
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

// ── Input: mousedown ───────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  // Pan: middle-click or Ctrl+left-click
  if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
    isPanning = true;
    panStartX = e.clientX - camera.offsetX;
    panStartY = e.clientY - camera.offsetY;
    e.preventDefault();
    return;
  }

  // Left-click: select unit to show walk/run range
  if (e.button === 0) {
    if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }
    if (handleMiniatureHealthClick(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }

    // God table: handled on pointerdown when Pointer Events exist (deck pull uses setPointerCapture).
    if (typeof PointerEvent === 'undefined') {
      if (tryHandleGodTablePrimaryDown(e.clientX, e.clientY, e.altKey)) {
        e.preventDefault();
        scheduleRender();
        return;
      }
    }

    if (godLooseDragPending || isDraggingGodLoose) {
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
        showSelectedDetails = altKeyHeld;
        unitDragPendingIndex = obUnit;
        unitDragPendingStartX = e.clientX;
        unitDragPendingStartY = e.clientY;
        unitDragPendingIsNewSelection = selectedUnitIndex !== obUnit;
        if (unitDragPendingIsNewSelection) {
          selectedUnitIndex = obUnit;
          selectedBigMiniIndex = null;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
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
        showSelectedDetails = altKeyHeld;
        bigMiniDragPendingIndex = obBig;
        bigMiniDragPendingStartX = e.clientX;
        bigMiniDragPendingStartY = e.clientY;
        if (selectedBigMiniIndex !== obBig) {
          selectedUnitIndex = null;
          updateMovementHighlights();
          selectedBigMiniIndex = obBig;
          selectedTerrainIndex = null;
          selectedGodTablePieceIndex = null;
          updateBigMiniMovementHighlights();
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
        selectedTerrainIndex !== null ||
        selectedEtherVortexIndex !== null ||
        selectedGodTablePieceIndex !== null
      ) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
        etherVortexDragPendingIndex = null;
        clearSelection();
        updateMovementHighlights();
        updateBigMiniMovementHighlights();
      }
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      scheduleRender();
      return;
    }

    // Alt+click: pick terrain even when a small or big miniature shares its hexes (normal hit order hides terrain).
    if (altKeyHeld) {
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
      showSelectedDetails = altKeyHeld;
      // Always use pending — drag starts only after threshold
      unitDragPendingIndex = clickedUnitIndex;
      unitDragPendingStartX = e.clientX;
      unitDragPendingStartY = e.clientY;
      unitDragPendingIsNewSelection = selectedUnitIndex !== clickedUnitIndex;
      // Select immediately (visual feedback), but don't drag yet
      if (unitDragPendingIsNewSelection) {
        selectedUnitIndex = clickedUnitIndex;
        selectedBigMiniIndex = null;
        selectedTerrainIndex = null;
        selectedGodTablePieceIndex = null;
        updateBigMiniMovementHighlights();
        updateMovementHighlights();
      }
      scheduleRender();
      return;
    }

    const bigMiniIdx = findBigMiniAtHex(hex);
    if (bigMiniIdx !== -1) {
      unitDragPendingIndex = null;
      terrainDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      selectedEtherVortexIndex = null;
      showSelectedDetails = altKeyHeld;
      // Always use pending — drag starts only after threshold
      bigMiniDragPendingIndex = bigMiniIdx;
      bigMiniDragPendingStartX = e.clientX;
      bigMiniDragPendingStartY = e.clientY;
      // Select immediately, but don't drag yet
      if (selectedBigMiniIndex !== bigMiniIdx) {
        selectedUnitIndex = null;
        updateMovementHighlights();
        selectedBigMiniIndex = bigMiniIdx;
        selectedTerrainIndex = null;
        selectedGodTablePieceIndex = null;
        updateBigMiniMovementHighlights();
      }
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
      selectedTerrainIndex !== null ||
      selectedEtherVortexIndex !== null ||
      selectedGodTablePieceIndex !== null
    ) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
      etherVortexDragPendingIndex = null;
      clearSelection();
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      scheduleRender();
    }
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    console.log(`Clicked hex: q=${hex.q}, r=${hex.r}`);
  }
});

// ── Input: mouseup ─────────────────────────────────────────────

window.addEventListener('pointerup', onWindowGodPointerEnd);
window.addEventListener('pointercancel', onWindowGodPointerEnd);

window.addEventListener('mouseup', (e) => {
  finishGodLooseDragIfActive(e);
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
    updateMovementHighlights();
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
    updateBigMiniMovementHighlights();
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
    scheduleRender();
  }
  isPanning = false;
});

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
  godDeckDragWholeStackAfterHold = false;

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
  altHoverTarget = null;
  shiftHoverTarget = null;
  hoveredAttack = null;
  scheduleRender();
});

// ── Input: zoom (scroll wheel) ────────────────────────────────

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const oldZoom = camera.zoom;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = oldZoom * Math.pow(zoomFactor, direction);

    camera.zoom = Math.max(0.2, Math.min(5, newZoom));

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    camera.offsetX = mouseX - (mouseX - camera.offsetX) * (camera.zoom / oldZoom);
    camera.offsetY = mouseY - (mouseY - camera.offsetY) * (camera.zoom / oldZoom);

    scheduleRender();
  },
  { passive: false },
);

// ── Resize ─────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  resizeCanvas();
  centerCamera();
  scheduleRender();
});

window.addEventListener('keydown', (e) => {
  const moveStep = e.shiftKey ? BG_CALIBRATION_STEP_FAST : BG_CALIBRATION_STEP;
  const rotStep = e.shiftKey ? BG_CALIBRATION_ROT_STEP * 2 : BG_CALIBRATION_ROT_STEP;
  const scaleStep = e.shiftKey ? BG_CALIBRATION_SCALE_STEP * 2 : BG_CALIBRATION_SCALE_STEP;
  const elementRotStep = e.shiftKey ? ELEMENT_ROT_STEP_FAST : ELEMENT_ROT_STEP;
  let changed = false;

  if (e.key === 'q' || e.key === 'Q') {
    if (
      draggingUnitIndex === null &&
      draggingBigMiniIndex === null &&
      !isDraggingTerrain &&
      rotateElementUnderHex(hoveredHexUnderPointer, -elementRotStep)
    ) {
      scheduleRender();
      e.preventDefault();
    }
    return;
  }
  if (e.key === 'e' || e.key === 'E') {
    if (
      draggingUnitIndex === null &&
      draggingBigMiniIndex === null &&
      !isDraggingTerrain &&
      rotateElementUnderHex(hoveredHexUnderPointer, elementRotStep)
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
    case ',':
      renderConfig.backgroundImageRotationDeg -= rotStep;
      changed = true;
      break;
    case '.':
      renderConfig.backgroundImageRotationDeg += rotStep;
      changed = true;
      break;
    case '0':
      renderConfig.backgroundImageOffsetX = FIELD_BG_PRESET.backgroundImageOffsetX;
      renderConfig.backgroundImageOffsetY = FIELD_BG_PRESET.backgroundImageOffsetY;
      renderConfig.backgroundImageScale = FIELD_BG_PRESET.backgroundImageScale;
      renderConfig.backgroundImageRotationDeg = FIELD_BG_PRESET.backgroundImageRotationDeg;
      changed = true;
      break;
    case 'p':
    case 'P':
      console.log('[BG preset]', {
        backgroundImageOffsetX: Number(renderConfig.backgroundImageOffsetX.toFixed(2)),
        backgroundImageOffsetY: Number(renderConfig.backgroundImageOffsetY.toFixed(2)),
        backgroundImageScale: Number(renderConfig.backgroundImageScale.toFixed(4)),
        backgroundImageRotationDeg: Number(renderConfig.backgroundImageRotationDeg.toFixed(3)),
      });
      break;
    default:
      break;
  }

  if (changed) {
    e.preventDefault();
    renderer.updateConfig({
      backgroundImageOffsetX: renderConfig.backgroundImageOffsetX,
      backgroundImageOffsetY: renderConfig.backgroundImageOffsetY,
      backgroundImageScale: renderConfig.backgroundImageScale,
      backgroundImageRotationDeg: renderConfig.backgroundImageRotationDeg,
    });
    scheduleRender();
  }
});

canvas.addEventListener('contextmenu', (e) => {
  const hex = hexAtScreen(e.clientX, e.clientY);

  // Off-board unit right-click
  if (!hex) {
    const obUnit = findOffBoardUnitAtScreen(e.clientX, e.clientY);
    if (obUnit !== -1) {
      e.preventDefault();
      const unit = units[obUnit];
      effectMarkerMenu.show(e.clientX, e.clientY, unit.effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return;
    }
    const obBig = findOffBoardBigMiniAtScreen(e.clientX, e.clientY);
    if (obBig !== -1) {
      e.preventDefault();
      const bm = bigMiniatures[obBig];
      effectMarkerMenu.show(e.clientX, e.clientY, bm.effectMarkers, {
        onToggle: () => {
          syncEffectMarkersToRenderer();
          scheduleRender();
        },
      });
      return;
    }
    e.preventDefault();
    return;
  }

  // On-board: check units first, then big minis, then ether vortexes
  const clickedUnitIndex = units.findIndex((unit) => unit.position.key === hex.key);
  if (clickedUnitIndex !== -1) {
    e.preventDefault();
    const unit = units[clickedUnitIndex];
    effectMarkerMenu.show(e.clientX, e.clientY, unit.effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return;
  }

  const bigIdx = findBigMiniAtHex(hex);
  if (bigIdx !== -1) {
    e.preventDefault();
    const bm = bigMiniatures[bigIdx];
    effectMarkerMenu.show(e.clientX, e.clientY, bm.effectMarkers, {
      onToggle: () => {
        syncEffectMarkersToRenderer();
        scheduleRender();
      },
    });
    return;
  }

  const vi = findEtherVortexAtHex(hex);
  if (vi !== -1) {
    e.preventDefault();
    etherVortexCrystalPopover.hide();
    const v = etherVortexes[vi];
    etherVortexMenu.show(e.clientX, e.clientY, {
      onPickDomain: (domain) => {
        v.domain = domain;
        scheduleRender();
      },
      onClearDomain: () => {
        v.domain = null;
        scheduleRender();
      },
    });
    return;
  }
  e.preventDefault();
});
