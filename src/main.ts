/**
 * Entry point — wires everything together.
 */

import { Hex, Layout, type Point } from './hex';
import { HexGrid } from './grid';
import { Camera, Renderer, defaultRenderConfig } from './renderer';
import { DiceRoller } from './dice';
import { UnitCard, type AttackAbility, type DiceRequest, type UnitCardData } from './unitCard';
import {
  BIG_UNIT_HEALTH_UI_SCALE,
  SMALL_UNIT_HEALTH_BADGE_OFFSET_Y_FRAC,
  SMALL_UNIT_HEALTH_BADGE_SCALE,
} from './healthUi';
import { CrystalWallet } from './crystalWallet';
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
let terrains: Hex[] = [new Hex(8, -2)];
let selectedTerrainIndex: number | null = null;
let terrainRotationDeg = 0;
/** Show selected piece card + move ranges only after Alt+click selection. */
let showSelectedDetails = false;
type SelectedEntity =
  | { kind: 'small'; index: number }
  | { kind: 'big'; index: number }
  | { kind: 'terrain'; index: number }
  | null;

type ClipboardEntity =
  | { kind: 'small'; unit: Unit; card: UnitCardData }
  | { kind: 'big'; unit: BigMini; card: UnitCardData }
  | { kind: 'terrain'; center: Hex }
  | null;

let clipboardEntity: ClipboardEntity = null;
let lastPasteOffsetStep = 0;

// ── Big miniatures (hexon-sized units) ─────────────────────────

type BigMini = {
  center: Hex;
  walk: number;
  run: number;
  rotationDeg: number;
  health: number;
};

const bigMiniatures: BigMini[] = [
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

// ── Unit card data ─────────────────────────────────────────────

const unitCardData: UnitCardData[] = [
  {
    name: 'Tern Vanguard',
    size: 'small',
    health: 10, maxHealth: 10,
    defense: { white: 2, green: 1 },
    walk: UNIT_WALK_RANGE, run: UNIT_RUN_RANGE,
    sprite: SMALL_UNIT_SPRITES[0],
    domains: ['order'],
    concentration: { red: 1 },
    defenseReaction: { white: 1 },
    attacks: [
      {
        name: 'Sword Strike',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 3,
        dice: { red: 2 },
        modifiers: [
          { kind: 'icon', label: 'Bleeding', description: 'Target loses 1 HP at the start of each turn.' },
        ],
      },
      {
        name: 'Shield Bash',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: { red: 1, green: 1 },
        modifiers: [
          { kind: 'text', label: 'Pushback 1 hex' },
        ],
      },
    ],
    traits: [
      { name: 'Shield Wall', description: '+1 white defense die when adjacent to an ally.' },
    ],
    keywords: ['Human', 'Warrior', 'Sword', 'Order'],
  },
  {
    name: 'Tern Ranger',
    size: 'small',
    health: 8, maxHealth: 8,
    defense: { white: 1, green: 1 },
    walk: UNIT_WALK_RANGE, run: UNIT_RUN_RANGE,
    sprite: SMALL_UNIT_SPRITES[1],
    domains: ['nature', 'order'],
    concentration: { green: 1 },
    defenseReaction: { green: 1 },
    attacks: [
      {
        name: 'Aimed Shot',
        range: 6,
        attackRange: 'ranged',
        damageType: 'physical',
        damage: 3,
        dice: { green: 2, red: 1 },
        modifiers: [
          { kind: 'icon', label: 'Piercing', description: 'Ignores 1 defense die.' },
        ],
      },
      {
        name: 'Poison Arrow',
        range: 5,
        attackRange: 'ranged',
        damageType: 'poison',
        damage: 2,
        dice: { green: 2 },
        modifiers: [
          { kind: 'text', label: 'Poison: 1 dmg/turn for 2 turns' },
        ],
      },
    ],
    traits: [
      { name: 'Evasion', description: 'After being attacked, may move 1 hex.' },
      { name: 'Poison Resistance', description: 'Halves poison damage (round down).' },
    ],
    keywords: ['Human', 'Ranger', 'Bow', 'Nature'],
  },
];

const bigMiniCardData: UnitCardData[] = [
  {
    name: 'Iron Golem',
    size: 'big',
    health: 20, maxHealth: 20,
    defense: { white: 3, green: 2 },
    walk: BIG_MINI_WALK_RANGE, run: BIG_MINI_RUN_RANGE,
    sprite: BIG_UNIT_SPRITE,
    domains: ['order', 'chaos'],
    concentration: { red: 2 },
    defenseReaction: { white: 2 },
    attacks: [
      {
        name: 'Stomp',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 5,
        dice: { red: 3, black: 1 },
        modifiers: [
          { kind: 'text', label: 'AoE: all enemies in hexon' },
          { kind: 'icon', label: 'Stun', description: 'Target skips next activation.' },
        ],
      },
      {
        name: 'Flame Breath',
        range: 3,
        attackRange: 'ranged',
        damageType: 'fire',
        damage: 4,
        dice: { red: 2, black: 1 },
        modifiers: [
          { kind: 'text', label: 'Region AoE: cone 3 hexes' },
        ],
      },
    ],
    traits: [
      { name: 'Regenerate', description: 'Heal 2 HP at the start of each turn.' },
      { name: 'Fortify', description: 'If stationary, +2 white defense dice until next activation.' },
      { name: 'Last Stand', description: 'When would die, roll 1 white die. On success: survive with 1 HP.' },
    ],
    keywords: ['Construct', 'Heavy', 'Golem', 'Fire'],
  },
];

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

  if (shiftKeyHeld && shiftHoverTarget !== null) {
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
  return null;
}

function clearSelection(): void {
  selectedUnitIndex = null;
  selectedBigMiniIndex = null;
  selectedTerrainIndex = null;
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
);
renderer.setTerrain(terrains, null, false, null, null, selectedTerrainIndex);
renderer.setBigMiniatures(
  bigMiniatures.map((m) => m.center),
  null,
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

// ── Crystal wallet UI ──────────────────────────────────────────

new CrystalWallet(document.body);

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
      bigMiniDragOverCenter,
    );
    renderer.setTerrain(
      terrains,
      terrainPreviewWorld,
      isDraggingTerrain,
      draggingTerrainIndex,
      terrainDragOverCenter,
      selectedTerrainIndex,
    );
    updateMovementHighlights();
    updateBigMiniMovementHighlights();
    updateAttackRangeHighlights();
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
  );
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
    units.push({ ...clipboardEntity.unit, position: nextPos });
    unitCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedUnitIndex = units.length - 1;
    return;
  }
  if (clipboardEntity.kind === 'big') {
    const cursorWorld = cursorWorldOnCanvas();
    const nextCenter = cursorWorld
      ? nearestHexonCenterFromWorld(cursorWorld)
      : offsetHexonCenterForPaste(clipboardEntity.unit.center);
    bigMiniatures.push({ ...clipboardEntity.unit, center: nextCenter });
    bigMiniCardData.push(structuredClone(clipboardEntity.card));
    clearSelection();
    selectedBigMiniIndex = bigMiniatures.length - 1;
    return;
  }
  const base = clipboardEntity.center;
  const cursorWorld = cursorWorldOnCanvas();
  const nextCenter = cursorWorld
    ? nearestHexonCenterFromWorld(cursorWorld)
    : offsetHexonCenterForPaste(base);
  terrains.push(nextCenter);
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
  if (sel.kind === 'small') {
    units.splice(sel.index, 1);
    unitCardData.splice(sel.index, 1);
    clearSelection();
    return;
  }
  if (sel.kind === 'big') {
    bigMiniatures.splice(sel.index, 1);
    bigMiniCardData.splice(sel.index, 1);
    clearSelection();
    return;
  }
  terrains.splice(sel.index, 1);
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
    refreshShiftHoverTarget(null);
    if (draggingUnitIndex !== null) {
      dragOverHex = null;
      dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
      renderer.setDragState(draggingUnitIndex, null, dragPreviewPosition);
    }
    if (isDraggingTerrain) {
      terrainPreviewWorld = null;
      terrainDragOverCenter = null;
      renderer.setTerrain(terrains, null, true, draggingTerrainIndex, null, selectedTerrainIndex);
    }
    if (draggingBigMiniIndex !== null) {
      bigMiniPreviewPosition = null;
      bigMiniDragOverCenter = null;
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, draggingBigMiniIndex, null);
    }
    scheduleRender();
    return;
  }

  hoveredHexUnderPointer = hex;
  renderer.setHoveredHex(hex);
  refreshAltHoverTarget(hex);
  refreshShiftHoverTarget(hex);

  if (draggingUnitIndex !== null) {
    dragOverHex = isHexOccupiedByOtherUnit(hex, draggingUnitIndex) ? null : hex;
    dragPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    renderer.setDragState(draggingUnitIndex, dragOverHex, dragPreviewPosition);
  }
  if (isDraggingTerrain) {
    terrainPreviewWorld = screenToBoardWorld(e.clientX, e.clientY);
    terrainDragOverCenter = nearestHexonCenterFromWorld(terrainPreviewWorld);
    renderer.setTerrain(
      terrains,
      terrainPreviewWorld,
      true,
      draggingTerrainIndex,
      terrainDragOverCenter,
      selectedTerrainIndex,
    );
  }
  if (draggingBigMiniIndex !== null) {
    bigMiniPreviewPosition = screenToBoardWorld(e.clientX, e.clientY);
    bigMiniDragOverCenter = nearestHexonCenterFromWorld(bigMiniPreviewPosition);
    renderer.setBigMiniatures(
      bigMiniatures.map((m) => m.center),
      bigMiniPreviewPosition,
      draggingBigMiniIndex,
      bigMiniDragOverCenter,
    );
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
  refreshShiftHoverTarget(null);
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
      if (selectedUnitIndex !== null || selectedBigMiniIndex !== null || selectedTerrainIndex !== null) {
        unitDragPendingIndex = null;
        bigMiniDragPendingIndex = null;
        terrainDragPendingIndex = null;
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
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
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
      openHealthControlsUnitIndex = null;
      openHealthControlsBigMiniIndex = null;
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
        updateBigMiniMovementHighlights();
      }
      scheduleRender();
      return;
    }

    const terrainIdx = findTerrainAtHex(hex);
    if (terrainIdx !== -1) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
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

    if (selectedUnitIndex !== null || selectedBigMiniIndex !== null || selectedTerrainIndex !== null) {
      unitDragPendingIndex = null;
      bigMiniDragPendingIndex = null;
      terrainDragPendingIndex = null;
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
      renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null);
      scheduleRender();
    }
  } else if (e.button === 0 && terrainDragPending && !isDraggingTerrain) {
    terrainDragPending = false;
    terrainDragPendingIndex = null;
    scheduleRender();
  } else if (e.button === 0 && draggingUnitIndex !== null) {
    if (dragOverHex && !isHexOccupiedByOtherUnit(dragOverHex, draggingUnitIndex)) {
      units[draggingUnitIndex].position = dragOverHex;
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
    bigMiniatures[draggingBigMiniIndex].center = nearestHexonCenterFromWorld(dropWorld);
    draggingBigMiniIndex = null;
    bigMiniPreviewPosition = null;
    bigMiniDragOverCenter = null;
    unitCard.setPassthrough(false);
    renderer.setBigMiniatures(bigMiniatures.map((m) => m.center), null, null, null);
    updateBigMiniMovementHighlights();
    scheduleRender();
  }
  if (e.button === 0 && isDraggingTerrain) {
    const dropWorld = screenToBoardWorld(e.clientX, e.clientY);
    if (draggingTerrainIndex !== null) {
      terrains[draggingTerrainIndex] = nearestHexonCenterFromWorld(dropWorld);
    }
    isDraggingTerrain = false;
    draggingTerrainIndex = null;
    terrainDragPendingIndex = null;
    terrainPreviewWorld = null;
    terrainDragOverCenter = null;
    renderer.setTerrain(terrains, null, false, null, null, selectedTerrainIndex);
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
  if (!altKeyHeld && !shiftKeyHeld) return;
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

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
