/**
 * Entry point — wires everything together.
 */

import { Hex, Layout, type Point } from './hex';
import { HexGrid } from './grid';
import { Camera, Renderer, defaultRenderConfig } from './renderer';
import { DiceRoller } from './dice';
import { UnitCard, type UnitCardData } from './unitCard';
import {
  BIG_UNIT_HEALTH_UI_SCALE,
  SMALL_UNIT_HEALTH_BADGE_OFFSET_Y_FRAC,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
} from './healthUi';
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
  walk: number;
  run: number;
  /** Facing in degrees (0 = east, CCW positive). */
  rotationDeg: number;
  health: number;
};

const units: Unit[] = [
  {
    position: new Hex(2, 0),
    walk: UNIT_WALK_RANGE,
    run: UNIT_RUN_RANGE,
    rotationDeg: 0,
    health: 10,
  },
  {
    position: new Hex(5, -1),
    walk: UNIT_WALK_RANGE,
    run: UNIT_RUN_RANGE,
    rotationDeg: 0,
    health: 10,
  },
];
let selectedUnitIndex: number | null = null;
let openHealthControlsUnitIndex: number | null = null;
let terrainCenter = new Hex(8, -2);
let terrainRotationDeg = 0;

// ── Big miniatures (hexon-sized units) ─────────────────────────

const bigMiniatures: {
  center: Hex;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
}[] = [
  {
    center: new Hex(5, -1),
    walk: BIG_MINI_WALK_RANGE,
    run: BIG_MINI_RUN_RANGE,
    rotationDeg: 0,
    health: 20,
  },
];
let selectedBigMiniIndex: number | null = null;
let openHealthControlsBigMiniIndex: number | null = null;

/** Alt + hover: same card & range as click-select, but card follows cursor. */
let altKeyHeld = false;
type AltHoverTarget = { kind: 'small'; index: number } | { kind: 'big'; index: number };
let altHoverTarget: AltHoverTarget | null = null;
let pointerScreenX = 0;
let pointerScreenY = 0;
let lastAltCardSig: string | null = null;

// ── Unit card data ─────────────────────────────────────────────

const unitCardData: UnitCardData[] = [
  {
    name: 'Tern Vanguard',
    size: 'small',
    health: 10, maxHealth: 10,
    walk: UNIT_WALK_RANGE, run: UNIT_RUN_RANGE,
    sprite: SMALL_UNIT_SPRITES[0],
    stats: { attack: 4, defense: 3, initiative: 5 },
    abilities: [
      { name: 'Shield Wall', description: '+2 Defense when adjacent to an ally.', cost: 'Passive' },
      { name: 'Charge', description: 'Move up to run range and attack with +1 Attack.', cost: '1 AP' },
    ],
    keywords: ['Human', 'Melee'],
  },
  {
    name: 'Tern Ranger',
    size: 'small',
    health: 10, maxHealth: 10,
    walk: UNIT_WALK_RANGE, run: UNIT_RUN_RANGE,
    sprite: SMALL_UNIT_SPRITES[1],
    stats: { attack: 3, defense: 2, initiative: 7 },
    abilities: [
      { name: 'Aimed Shot', description: 'Ranged attack within 6 hexes. +1 Attack if stationary.', cost: '1 AP' },
      { name: 'Evasion', description: 'After being attacked, may move 1 hex.', cost: 'Reaction' },
    ],
    keywords: ['Human', 'Ranged'],
  },
];

const bigMiniCardData: UnitCardData[] = [
  {
    name: 'Iron Golem',
    size: 'big',
    health: 20, maxHealth: 20,
    walk: BIG_MINI_WALK_RANGE, run: BIG_MINI_RUN_RANGE,
    sprite: BIG_UNIT_SPRITE,
    stats: { attack: 6, defense: 8, initiative: 2 },
    abilities: [
      { name: 'Stomp', description: 'All enemies in the occupied hexon take 3 damage.', cost: '2 AP' },
      { name: 'Fortify', description: 'Cannot move this turn. +4 Defense until next activation.', cost: '1 AP' },
      { name: 'Regenerate', description: 'Heal 2 HP at the start of each turn.', cost: 'Passive' },
    ],
    keywords: ['Construct', 'Heavy'],
  },
];

const unitCard = new UnitCard(document.body);

function updateUnitCard(): void {
  if (!altKeyHeld) {
    lastAltCardSig = null;
  }

  if (altKeyHeld && altHoverTarget !== null) {
    const sig = `${altHoverTarget.kind}-${altHoverTarget.index}`;
    if (altHoverTarget.kind === 'small') {
      const u = units[altHoverTarget.index];
      const data = unitCardData[altHoverTarget.index];
      if (data) {
        data.health = u.health;
        if (lastAltCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastAltCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY });
        return;
      }
    } else {
      const m = bigMiniatures[altHoverTarget.index];
      const data = bigMiniCardData[altHoverTarget.index];
      if (data) {
        data.health = m.health;
        if (lastAltCardSig === sig) {
          unitCard.repositionFloating(pointerScreenX, pointerScreenY);
          return;
        }
        lastAltCardSig = sig;
        unitCard.show(data, { x: pointerScreenX, y: pointerScreenY });
        return;
      }
    }
  }

  if (selectedUnitIndex !== null) {
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

function rebuildHexons(): void {
  renderer.setHighlightedHexonCenter(new Hex(2, 0));
}
rebuildHexons();
renderer.setUnits(
  units.map((unit) => unit.position),
  selectedUnitIndex,
);
renderer.setTerrain(terrainCenter, null, false);
renderer.setBigMiniatures(
  bigMiniatures.map((m) => m.center),
  null,
  null,
);
renderer.setBigMiniMovement(null, [], []);

function updateMovementHighlights(): void {
  // Must keep indices aligned with `units[]` (sprites, drag, selection) — do not filter.
  renderer.setUnits(
    units.map((unit) => unit.position),
    selectedUnitIndex,
  );

  if (altKeyHeld && altHoverTarget?.kind === 'small') {
    const u = units[altHoverTarget.index];
    if (!grid.has(u.position)) {
      renderer.setMovementHighlights(null, [], []);
      return;
    }
    const walkReachable: Hex[] = [];
    const runReachable: Hex[] = [];
    for (const hex of grid.allHexes()) {
      const distance = u.position.distanceTo(hex);
      if (distance === 0) continue;
      if (distance <= u.walk) walkReachable.push(hex);
      if (distance <= u.run) runReachable.push(hex);
    }
    renderer.setMovementHighlights(u.position, walkReachable, runReachable);
    return;
  }

  if (altKeyHeld && altHoverTarget?.kind === 'big') {
    renderer.setMovementHighlights(null, [], []);
    return;
  }

  if (selectedUnitIndex === null) {
    renderer.setMovementHighlights(null, [], []);
    return;
  }
  const selectedUnit = units[selectedUnitIndex];
  if (!grid.has(selectedUnit.position)) {
    renderer.setMovementHighlights(null, [], []);
    return;
  }

  const walkReachable: Hex[] = [];
  const runReachable: Hex[] = [];

  for (const hex of grid.allHexes()) {
    const distance = selectedUnit.position.distanceTo(hex);
    if (distance === 0) continue;
    if (distance <= selectedUnit.walk) {
      walkReachable.push(hex);
    }
    if (distance <= selectedUnit.run) {
      runReachable.push(hex);
    }
  }

  renderer.setMovementHighlights(selectedUnit.position, walkReachable, runReachable);
}
updateMovementHighlights();

function pushPieceRotationsToRenderer(): void {
  renderer.setUnitSpriteSources(
    units.map((_, index) => SMALL_UNIT_SPRITES[index % SMALL_UNIT_SPRITES.length] ?? null),
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
  if (isHexInTerrain(hex)) {
    terrainRotationDeg += deltaDeg;
    return true;
  }
  return false;
}

function updateBigMiniMovementHighlights(): void {
  /** Green ring index stays `selectedBigMiniIndex`; walk/run can preview another big mini (Alt-hover). */
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
  const { walk, run } = computeBigMiniWalkRunCenters(selectedBigMiniIndex);
  renderer.setBigMiniMovement(selectedBigMiniIndex, walk, run);
}

// ── Dice roller UI ─────────────────────────────────────────────

new DiceRoller(document.body);

// ── Render loop ────────────────────────────────────────────────

let needsRender = true;

function scheduleRender(): void {
  needsRender = true;
}

function loop(): void {
  if (needsRender) {
    pushPieceRotationsToRenderer();
    // Re-apply drag / preview every frame so renderer state cannot desync from main.ts.
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
    renderer.setBigMiniatures(
      bigMiniatures.map((m) => m.center),
      bigMiniPreviewPosition,
      draggingBigMiniIndex,
    );
    renderer.setTerrain(terrainCenter, terrainPreviewWorld, isDraggingTerrain);
    updateMovementHighlights();
    updateBigMiniMovementHighlights();
    updateUnitCard();
    renderer.render();
    needsRender = false;
  }
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
let terrainDragPending = false;
let terrainDragPendingStartX = 0;
let terrainDragPendingStartY = 0;
let terrainPreviewWorld: Point | null = null;
let draggingBigMiniIndex: number | null = null;
let bigMiniPreviewPosition: { x: number; y: number } | null = null;
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

function isHexInTerrain(hex: Hex): boolean {
  return hexonCells(terrainCenter).some((cell) => cell.key === hex.key);
}

function findBigMiniAtHex(hex: Hex): number {
  return bigMiniatures.findIndex((m) =>
    hexonCells(m.center).some((cell) => cell.key === hex.key),
  );
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
  if (unitDragPendingIndex === null) return;
  const dx = e.clientX - unitDragPendingStartX;
  const dy = e.clientY - unitDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = unitDragPendingIndex;
  unitDragPendingIndex = null;
  draggingUnitIndex = idx;
  const hex = hexAtScreen(e.clientX, e.clientY);
  dragOverHex = hex && !isHexOccupiedByOtherUnit(hex, idx) ? hex : null;
  dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  scheduleRender();
}

function tryPromoteBigMiniDragFromPending(e: MouseEvent): void {
  if (bigMiniDragPendingIndex === null) return;
  const dx = e.clientX - bigMiniDragPendingStartX;
  const dy = e.clientY - bigMiniDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  const idx = bigMiniDragPendingIndex;
  bigMiniDragPendingIndex = null;
  draggingBigMiniIndex = idx;
  bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
  renderer.setBigMiniatures(
    bigMiniatures.map((m) => m.center),
    bigMiniPreviewPosition,
    draggingBigMiniIndex,
  );
  scheduleRender();
}

function tryPromoteTerrainDragFromPending(e: MouseEvent): void {
  if (!terrainDragPending || isDraggingTerrain) return;
  const dx = e.clientX - terrainDragPendingStartX;
  const dy = e.clientY - terrainDragPendingStartY;
  if (dx * dx + dy * dy <= UNIT_DRAG_THRESHOLD_PX * UNIT_DRAG_THRESHOLD_PX) return;
  terrainDragPending = false;
  isDraggingTerrain = true;
  terrainPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
  renderer.setTerrain(terrainCenter, terrainPreviewWorld, true);
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
  const effectiveR = halfH * SMALL_UNIT_HEALTH_BADGE_SCALE;
  const badgeCenterWorld = {
    x: unitCenterWorld.x,
    y: unitCenterWorld.y + halfH * SMALL_UNIT_HEALTH_BADGE_OFFSET_Y_FRAC,
  };
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

function getBigMiniHealthUiGeometry(centerWorld: { x: number; y: number }): {
  badgeCenter: { x: number; y: number };
  badgeRadius: number;
  minusCenter: { x: number; y: number };
  plusCenter: { x: number; y: number };
  buttonRadius: number;
} {
  const baseRadiusWorld = Math.min(layout.size.x, layout.size.y) * 1.58 * BIG_UNIT_HEALTH_UI_SCALE;
  const badgeCenterWorld = { x: centerWorld.x, y: centerWorld.y - baseRadiusWorld * 1.55 };
  const badgeRadiusWorld = baseRadiusWorld * 0.48;
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
    const openGeom = getBigMiniHealthUiGeometry(
      bigMiniHealthCenterWorld(openHealthControlsBigMiniIndex),
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
      const geom = getBigMiniHealthUiGeometry(bigMiniPreviewPosition);
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsBigMiniIndex = i;
        openHealthControlsUnitIndex = null;
        return true;
      }
      continue;
    }
    const geom = getBigMiniHealthUiGeometry(layout.hexToPixel(bigMiniatures[i].center));
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

window.addEventListener('pointermove', (e) => {
  pointerScreenX = e.clientX;
  pointerScreenY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  pointerScreenX = e.clientX;
  pointerScreenY = e.clientY;
  tryPromoteUnitDragFromPending(e);
  tryPromoteBigMiniDragFromPending(e);
  tryPromoteTerrainDragFromPending(e);

  const hex = hexAtScreen(e.clientX, e.clientY);
  if (!hex) {
    hoveredHexUnderPointer = null;
    renderer.setHoveredHex(null);
    refreshAltHoverTarget(null);
    if (draggingUnitIndex !== null) {
      dragOverHex = null;
      dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
      renderer.setDragState(draggingUnitIndex, null, dragPreviewPosition);
    }
    if (isDraggingTerrain) {
      terrainPreviewWorld = null;
      renderer.setTerrain(terrainCenter, null, true);
    }
    if (draggingBigMiniIndex !== null) {
      bigMiniPreviewPosition = null;
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, draggingBigMiniIndex);
    }
    scheduleRender();
    return;
  }

  hoveredHexUnderPointer = hex;
  renderer.setHoveredHex(hex);
  refreshAltHoverTarget(hex);

  if (draggingUnitIndex !== null) {
    dragOverHex = isHexOccupiedByOtherUnit(hex, draggingUnitIndex) ? null : hex;
    dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  }
  if (isDraggingTerrain) {
    terrainPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    renderer.setTerrain(terrainCenter, terrainPreviewWorld, true);
  }
  if (draggingBigMiniIndex !== null) {
    bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), bigMiniPreviewPosition, draggingBigMiniIndex);
  }

  // Pan
  if (isPanning) {
    camera.offsetX = e.clientX - panStartX;
    camera.offsetY = e.clientY - panStartY;
  }

  scheduleRender();
});

canvas.addEventListener('mouseleave', () => {
  hoveredHexUnderPointer = null;
  renderer.setHoveredHex(null);
  refreshAltHoverTarget(null);
  scheduleRender();
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
    if (handleMiniatureHealthClick(e.clientX, e.clientY)) {
      scheduleRender();
      return;
    }

    const hex = hexAtScreen(e.clientX, e.clientY);
    if (!hex) {
      if (selectedUnitIndex !== null || selectedBigMiniIndex !== null) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        selectedUnitIndex = null;
        selectedBigMiniIndex = null;
        updateMovementHighlights();
        updateBigMiniMovementHighlights();
      }
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      scheduleRender();
      return;
    }

    const clickedUnitIndex = units.findIndex((unit) => unit.position.key === hex.key);
    if (clickedUnitIndex !== -1) {
      bigMiniDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      // Always use pending — drag starts only after threshold
      unitDragPendingIndex = clickedUnitIndex;
      unitDragPendingStartX = e.clientX;
      unitDragPendingStartY = e.clientY;
      unitDragPendingIsNewSelection = selectedUnitIndex !== clickedUnitIndex;
      // Select immediately (visual feedback), but don't drag yet
      if (unitDragPendingIsNewSelection) {
        selectedUnitIndex = clickedUnitIndex;
        selectedBigMiniIndex = null;
        updateBigMiniMovementHighlights();
        updateMovementHighlights();
      }
      scheduleRender();
      return;
    }

    const bigMiniIdx = findBigMiniAtHex(hex);
    if (bigMiniIdx !== -1) {
      unitDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      // Always use pending — drag starts only after threshold
      bigMiniDragPendingIndex = bigMiniIdx;
      bigMiniDragPendingStartX = e.clientX;
      bigMiniDragPendingStartY = e.clientY;
      // Select immediately, but don't drag yet
      if (selectedBigMiniIndex !== bigMiniIdx) {
        selectedUnitIndex = null;
        updateMovementHighlights();
        selectedBigMiniIndex = bigMiniIdx;
        updateBigMiniMovementHighlights();
      }
      scheduleRender();
      return;
    }

    if (isHexInTerrain(hex)) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
      selectedUnitIndex = null;
      selectedBigMiniIndex = null;
      updateMovementHighlights();
      updateBigMiniMovementHighlights();
      terrainDragPending = true;
      terrainDragPendingStartX = e.clientX;
      terrainDragPendingStartY = e.clientY;
      scheduleRender();
      return;
    }

    if (selectedUnitIndex !== null || selectedBigMiniIndex !== null) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      selectedUnitIndex = null;
      selectedBigMiniIndex = null;
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

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && unitDragPendingIndex !== null) {
    unitDragPendingIndex = null;
    if (draggingUnitIndex === null) {
      renderer.setDragState(null, null, null);
      scheduleRender();
    }
  } else if (e.button === 0 && bigMiniDragPendingIndex !== null) {
    bigMiniDragPendingIndex = null;
    if (draggingBigMiniIndex === null) {
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null);
      scheduleRender();
    }
  } else if (e.button === 0 && terrainDragPending && !isDraggingTerrain) {
    terrainDragPending = false;
    scheduleRender();
  } else if (e.button === 0 && draggingUnitIndex !== null) {
    if (dragOverHex && !isHexOccupiedByOtherUnit(dragOverHex, draggingUnitIndex)) {
      units[draggingUnitIndex].position = dragOverHex;
    }
    draggingUnitIndex = null;
    dragOverHex = null;
    dragPreviewPosition = null;
    renderer.setDragState(null, null, null);
    updateMovementHighlights();
    scheduleRender();
  }
  if (e.button === 0 && draggingBigMiniIndex !== null) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    bigMiniatures[draggingBigMiniIndex].center = nearestHexonCenterFromWorld(dropWorld);
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null);
    updateBigMiniMovementHighlights();
    scheduleRender();
  }
  if (e.button === 0 && isDraggingTerrain) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    terrainCenter = nearestHexonCenterFromWorld(dropWorld);
    isDraggingTerrain = false;
    terrainPreviewWorld = null;
    renderer.setTerrain(terrainCenter, null, false);
    scheduleRender();
  }
  isPanning = false;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    altKeyHeld = true;
    refreshAltHoverTarget(hexUnderGlobalPointer() ?? hoveredHexUnderPointer);
    e.preventDefault();
    scheduleRender();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
    altKeyHeld = false;
    altHoverTarget = null;
    scheduleRender();
  }
});

window.addEventListener('blur', () => {
  if (!altKeyHeld) return;
  altKeyHeld = false;
  altHoverTarget = null;
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

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
