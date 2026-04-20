# Hit-Test Z-Order Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pointer hit-test order match render z-order so that the visually top object (including selection-lifted) owns clicks in its whole footprint, including its sub-elements (health / activation / hunger / crystal counter).

**Architecture:** Introduce a single resolver `resolveTopInteractiveAtScreen(x, y)` that returns the top-most interactive object at the point, mirroring the renderer's layer order plus a selection boost (matching `drawSelectedLiftPass`). Pointer-down handlers consume this result once per click and dispatch to the sub-element tests of only that object, instead of four parallel loops that each iterate all objects independently.

**Tech Stack:** TypeScript, canvas hit-testing, Vitest, Vite dev preview, SSH deploy via `deploy/deploy.sh`.

---

## File Structure

**Modified:**
- `src/main.ts` — add resolver types, `pickTopCandidate` (pure), `resolveTopInteractiveAtScreen` (closes over module state), refactor four sub-element handlers, rewire `pointerdown` + `mousedown`.

**Created:**
- `src/hitTestPick.ts` — pure helper `pickTopCandidate(candidates, selected)` with no DOM / layout / state dependencies. Exported solely so it can be unit-tested.
- `src/hitTestPick.test.ts` — Vitest unit tests for `pickTopCandidate`.

No other files need changes. The renderer already has the correct z-order via `drawSelectedLiftPass` (`src/renderer.ts:3823`); we only mirror its ordering rule on the input side.

---

## Reference: Current Render Z-Order

From `src/renderer.ts:948–1065`, on-board interactive layers in ascending z (last rendered wins):

```
terrain (hexon)
boardObjects kind=hexon
etherVortexes
boardObjects kind=hex
hugeMini     (3-hexon)
huge2Mini    (2-hexon domino)
bigMini      (1-hexon)
largeMini    (3-hex triangle)
unit         (small, 1-hex)
```

Plus `drawSelectedLiftPass` raises exactly one selected object above everything. Only one selection-kind can be active at a time (terrain OR vortex OR unit OR mini, etc.), which the resolver mirrors.

---

### Task 1: Extract pure `pickTopCandidate`

**Files:**
- Create: `src/hitTestPick.ts`

- [ ] **Step 1: Write the module**

```ts
// src/hitTestPick.ts
//
// Pure helper: given a list of on-board hit candidates and the current
// per-kind selection indices, return the one that should receive the click.
//
// Ordering rule mirrors renderer.ts render passes plus drawSelectedLiftPass:
//   z(selected kind+index) > z(non-selected by base layer)
// Ties within a base layer are impossible — only one of each kind can occupy
// the same point per footprint (the scan upstream deduplicates).

export type TopInteractiveKind =
  | 'terrain'
  | 'boardObject'
  | 'etherVortex'
  | 'hugeMini'
  | 'huge2Mini'
  | 'bigMini'
  | 'largeMini'
  | 'unit';

export type TopInteractive = { kind: TopInteractiveKind; index: number };

export type SelectedIndices = Readonly<
  Partial<Record<TopInteractiveKind, number | null>>
>;

/** Higher wins. Values are arbitrary but strictly ordered to match render passes. */
const BASE_Z: Record<TopInteractiveKind, number> = {
  terrain: 0,
  boardObject: 1,
  etherVortex: 2,
  hugeMini: 3,
  huge2Mini: 4,
  bigMini: 5,
  largeMini: 6,
  unit: 7,
};

const SELECTED_BOOST = 1000;

function zOf(c: TopInteractive, selected: SelectedIndices): number {
  const sel = selected[c.kind];
  const isSel = sel !== undefined && sel !== null && sel === c.index;
  return BASE_Z[c.kind] + (isSel ? SELECTED_BOOST : 0);
}

export function pickTopCandidate(
  candidates: readonly TopInteractive[],
  selected: SelectedIndices,
): TopInteractive | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestZ = zOf(best, selected);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const z = zOf(c, selected);
    if (z > bestZ) {
      best = c;
      bestZ = z;
    }
  }
  return best;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hitTestPick.ts
git commit -m "refactor(hit-test): add pure pickTopCandidate helper"
```

---

### Task 2: Unit tests for `pickTopCandidate`

**Files:**
- Create: `src/hitTestPick.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/hitTestPick.test.ts
import { describe, expect, it } from 'vitest';
import { pickTopCandidate, type SelectedIndices } from './hitTestPick';

describe('pickTopCandidate', () => {
  it('returns null when no candidates', () => {
    expect(pickTopCandidate([], {})).toBeNull();
  });

  it('returns the only candidate', () => {
    expect(pickTopCandidate([{ kind: 'unit', index: 0 }], {})).toEqual({
      kind: 'unit',
      index: 0,
    });
  });

  it('picks the higher base layer (unit over etherVortex)', () => {
    const top = pickTopCandidate(
      [
        { kind: 'etherVortex', index: 3 },
        { kind: 'unit', index: 7 },
      ],
      {},
    );
    expect(top).toEqual({ kind: 'unit', index: 7 });
  });

  it('picks the higher base layer (largeMini over bigMini over hugeMini)', () => {
    const top = pickTopCandidate(
      [
        { kind: 'hugeMini', index: 0 },
        { kind: 'bigMini', index: 1 },
        { kind: 'largeMini', index: 2 },
      ],
      {},
    );
    expect(top).toEqual({ kind: 'largeMini', index: 2 });
  });

  it('boosts a selected candidate above base-layer winners', () => {
    const selected: SelectedIndices = { etherVortex: 3 };
    const top = pickTopCandidate(
      [
        { kind: 'etherVortex', index: 3 },
        { kind: 'unit', index: 7 },
      ],
      selected,
    );
    expect(top).toEqual({ kind: 'etherVortex', index: 3 });
  });

  it('does not boost a non-matching index (selection is index-specific)', () => {
    const selected: SelectedIndices = { etherVortex: 99 };
    const top = pickTopCandidate(
      [
        { kind: 'etherVortex', index: 3 },
        { kind: 'unit', index: 7 },
      ],
      selected,
    );
    expect(top).toEqual({ kind: 'unit', index: 7 });
  });

  it('treats null selection as unselected', () => {
    const selected: SelectedIndices = { etherVortex: null };
    const top = pickTopCandidate(
      [
        { kind: 'etherVortex', index: 3 },
        { kind: 'unit', index: 7 },
      ],
      selected,
    );
    expect(top).toEqual({ kind: 'unit', index: 7 });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/hitTestPick.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hitTestPick.test.ts
git commit -m "test(hit-test): cover pickTopCandidate layer + selection boost"
```

---

### Task 3: Add `resolveTopInteractiveAtScreen` in `main.ts`

**Files:**
- Modify: `src/main.ts` — add import + new function near existing `resolveMiniatureTapKeyForDoubleTap` (around line 7450).

- [ ] **Step 1: Add the import near the top of `src/main.ts`**

Find the existing import group for local modules. Add:

```ts
import {
  pickTopCandidate,
  type TopInteractive,
  type SelectedIndices,
} from './hitTestPick';
```

- [ ] **Step 2: Add the resolver function**

Insert immediately after `resolveMiniatureTapKeyForDoubleTap` (which ends at `src/main.ts:7501`):

```ts
/**
 * Top on-board interactive object at a screen point, obeying render z-order
 * and the selection lift (see drawSelectedLiftPass). Returns null for
 * off-board regions / empty hexes.
 *
 * Callers must dispatch sub-element hit-tests only against the returned kind
 * — walking past it into lower layers re-creates the bug this resolver fixes.
 */
function resolveTopInteractiveAtScreen(
  screenX: number,
  screenY: number,
): TopInteractive | null {
  const hex = hexAtScreen(screenX, screenY);
  if (!hex) return null;
  const world = screenToBoardWorld(screenX, screenY);

  const candidates: TopInteractive[] = [];

  // Small unit (top miniature layer).
  const unitIdx = findTopSmallUnitAtHex(hex);
  if (unitIdx !== -1) candidates.push({ kind: 'unit', index: unitIdx });

  // Large mini — silhouette-gated.
  const largeIdx = findLargeMiniAtHex(hex);
  if (
    largeIdx !== -1 &&
    isWorldPointInLargeMiniSilhouette(
      world,
      largeMiniPivotWorldForHit(largeIdx),
      largeMiniatures[largeIdx]!.rotationDeg,
      layout,
    )
  ) {
    candidates.push({ kind: 'largeMini', index: largeIdx });
  }

  // Big mini — silhouette-gated.
  const bigIdx = findBigMiniAtHex(hex);
  if (
    bigIdx !== -1 &&
    isWorldPointInBigMiniSilhouette(
      world,
      bigMiniPivotWorldForHit(bigIdx),
      bigMiniatures[bigIdx]!.rotationDeg,
      layout,
    )
  ) {
    candidates.push({ kind: 'bigMini', index: bigIdx });
  }

  // Huge2 (2-hexon domino).
  const huge2Idx = resolveHuge2MiniIndexAtPointer(hex, world);
  if (huge2Idx !== -1) candidates.push({ kind: 'huge2Mini', index: huge2Idx });

  // Huge (3-hexon triangle).
  const hugeIdx = resolveHugeMiniIndexAtPointer(hex, world);
  if (hugeIdx !== -1) candidates.push({ kind: 'hugeMini', index: hugeIdx });

  // Ether vortex (hexon footprint).
  for (let i = 0; i < etherVortexes.length; i++) {
    const v = etherVortexes[i]!;
    if (v.offBoardWorld) continue; // Off-board vortexes are resolved elsewhere.
    const footprint = etherVortexFootprint(v.center);
    if (footprint.some((h) => h.eq(hex))) {
      candidates.push({ kind: 'etherVortex', index: i });
      break; // At most one vortex per hex.
    }
  }

  const selected: SelectedIndices = {
    unit: selectedUnitIndex,
    largeMini: selectedLargeMiniIndex,
    bigMini: selectedBigMiniIndex,
    hugeMini: selectedHugeMiniIndex,
    huge2Mini: selectedHuge2MiniIndex,
    etherVortex: selectedEtherVortexIndex,
    terrain: selectedTerrainIndex,
    boardObject: selectedBoardObjectIndex,
  };

  return pickTopCandidate(candidates, selected);
}
```

- [ ] **Step 3: Verify the app still builds**

The preview server is running (`hex-game`). Check `mcp__Claude_Preview__preview_logs` (level=error) — expect no new errors after save. HMR will reload.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "refactor(hit-test): add resolveTopInteractiveAtScreen"
```

---

### Task 4: Route `pointerdown` handler through the resolver

**Files:**
- Modify: `src/main.ts:8418–8490` (the `canvas.addEventListener('pointerdown', ...)` block)
- Modify: `src/main.ts:7159–7190` (`tryEtherVortexCrystalBadgeOpen`)
- Modify: `src/main.ts:7107–7156` (`handleMiniatureActivationClick`)
- Modify: `src/main.ts:7076–7105` (`handleBroomgarHungerClick`)
- Modify: `src/main.ts:7192–<end>` (`handleMiniatureHealthClick`) — only narrow its miniature scan, keep the "already-open controls" priority block.

- [ ] **Step 1: Change each sub-element handler to accept an optional `top: TopInteractive | null`**

For `tryEtherVortexCrystalBadgeOpen`, replace the signature and body:

```ts
function tryEtherVortexCrystalBadgeOpen(
  screenX: number,
  screenY: number,
  top: TopInteractive | null,
): boolean {
  if (top === null || top.kind !== 'etherVortex') return false;
  const i = top.index;
  const v = etherVortexes[i];
  if (!v) return false;
  const w = screenToBoardWorld(screenX, screenY);
  const hitR = etherVortexCrystalBadgeHitRadiusWorld(layout);
  const hitR2 = (hitR * 1.08) ** 2;
  const pivot =
    draggingEtherVortexIndex === i && isDraggingEtherVortex && etherVortexPreviewWorld
      ? etherVortexPreviewWorld
      : (v.offBoardWorld ?? layout.hexToPixel(v.center));
  const badge = renderer.getEtherVortexCrystalBadgeBoardAtPivot(pivot, v.rotationDeg);
  const dx = w.x - badge.x;
  const dy = w.y - badge.y;
  if (dx * dx + dy * dy > hitR2) return false;
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
```

For `handleMiniatureActivationClick`, replace body to test only the matching kind:

```ts
function handleMiniatureActivationClick(
  screenX: number,
  screenY: number,
  top: TopInteractive | null,
): boolean {
  if (top === null) return false;
  if (top.kind === 'unit') {
    const g = getUnitActivationToggleGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      units[top.index]!.activated = units[top.index]!.activated === false;
      return true;
    }
    return false;
  }
  if (top.kind === 'largeMini') {
    const g = getLargeMiniActivationToggleGeometry(
      largeMiniHealthAnchorWorld(top.index),
      largeMiniatures[top.index]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      largeMiniatures[top.index]!.activated = largeMiniatures[top.index]!.activated === false;
      return true;
    }
    return false;
  }
  if (top.kind === 'huge2Mini') {
    const g = getHuge2MiniActivationToggleGeometry(
      huge2MiniHealthAnchorWorld(top.index),
      huge2Miniatures[top.index]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      huge2Miniatures[top.index]!.activated = huge2Miniatures[top.index]!.activated === false;
      return true;
    }
    return false;
  }
  if (top.kind === 'hugeMini') {
    const g = getHugeMiniActivationToggleGeometry(
      hugeMiniHealthAnchorWorld(top.index),
      hugeMiniatures[top.index]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      hugeMiniatures[top.index]!.activated = hugeMiniatures[top.index]!.activated === false;
      return true;
    }
    return false;
  }
  if (top.kind === 'bigMini') {
    const g = getBigMiniActivationToggleGeometry(
      bigMiniHealthCenterWorld(top.index),
      bigMiniatures[top.index]!.rotationDeg,
    );
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      bigMiniatures[top.index]!.activated = bigMiniatures[top.index]!.activated === false;
      return true;
    }
    return false;
  }
  return false;
}
```

For `handleBroomgarHungerClick`, replace the whole body (`src/main.ts:7058–7105`):

```ts
function handleBroomgarHungerClick(
  screenX: number,
  screenY: number,
  top: TopInteractive | null,
): boolean {
  if (top === null) return false;
  if (top.kind === 'unit') {
    const ph = units[top.index]!.broomgarHungerPhase;
    if (ph === undefined) return false;
    const g = getUnitBroomgarHungerGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      units[top.index]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
    return false;
  }
  if (top.kind === 'bigMini') {
    const ph = bigMiniatures[top.index]!.broomgarHungerPhase;
    if (ph === undefined) return false;
    const g = getBigMiniBroomgarHungerGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      bigMiniatures[top.index]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
    return false;
  }
  if (top.kind === 'largeMini') {
    const ph = largeMiniatures[top.index]!.broomgarHungerPhase;
    if (ph === undefined) return false;
    const g = getLargeMiniBroomgarHungerGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      largeMiniatures[top.index]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
    return false;
  }
  if (top.kind === 'hugeMini') {
    const ph = hugeMiniatures[top.index]!.broomgarHungerPhase;
    if (ph === undefined) return false;
    const g = getHugeMiniBroomgarHungerGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      hugeMiniatures[top.index]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
    return false;
  }
  if (top.kind === 'huge2Mini') {
    const ph = huge2Miniatures[top.index]!.broomgarHungerPhase;
    if (ph === undefined) return false;
    const g = getHuge2MiniBroomgarHungerGeometry(top.index);
    if (isPointInCircle(screenX, screenY, g.center, g.radiusScreen)) {
      huge2Miniatures[top.index]!.broomgarHungerPhase = nextBroomgarHungerPhase(ph);
      return true;
    }
    return false;
  }
  return false;
}
```

For `handleMiniatureHealthClick`: **keep the leading "already-open controls" block intact** (`src/main.ts:7192–7305` covering `openHealthControlsBoardObjectIndex`, `openHealthControlsUnitIndex`, `openHealthControlsBigMiniIndex`, `openHealthControlsLargeMiniIndex`, `openHealthControlsHugeMiniIndex`, `openHealthControlsHuge2MiniIndex`). Those popovers are already-open UI and must stay click-priority #1.

After that block, **replace the six sequential `for (let i = 0; i < X.length; i++)` miniature-badge scans** (units → bigMini → largeMini → huge2Mini → hugeMini → boardObjects, `src/main.ts:7307–7412`) with a single `top`-driven dispatch:

```ts
  // Miniature-badge scan, narrowed to the topmost-interactive object only.
  if (top !== null) {
    if (top.kind === 'unit') {
      const geom = getUnitHealthUiGeometry(top.index);
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsUnitIndex = top.index;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        openHealthControlsHuge2MiniIndex = null;
        openHealthControlsBoardObjectIndex = null;
        return true;
      }
    } else if (top.kind === 'bigMini') {
      const bi = top.index;
      const anchor =
        draggingBigMiniIndex === bi && bigMiniPreviewPosition !== null
          ? bigMiniPreviewPosition
          : layout.hexToPixel(bigMiniatures[bi].center);
      const geom = getBigMiniHealthUiGeometry(anchor, bigMiniatures[bi].rotationDeg);
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsBigMiniIndex = bi;
        openHealthControlsUnitIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        openHealthControlsHuge2MiniIndex = null;
        openHealthControlsBoardObjectIndex = null;
        return true;
      }
    } else if (top.kind === 'largeMini') {
      const geom = getLargeMiniHealthUiGeometry(
        largeMiniHealthAnchorWorld(top.index),
        largeMiniatures[top.index].rotationDeg,
      );
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsLargeMiniIndex = top.index;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        openHealthControlsHuge2MiniIndex = null;
        openHealthControlsBoardObjectIndex = null;
        return true;
      }
    } else if (top.kind === 'huge2Mini') {
      const geom = getHuge2MiniHealthUiGeometry(
        huge2MiniHealthAnchorWorld(top.index),
        huge2Miniatures[top.index].rotationDeg,
      );
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsHuge2MiniIndex = top.index;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        openHealthControlsBoardObjectIndex = null;
        return true;
      }
    } else if (top.kind === 'hugeMini') {
      const geom = getHugeMiniHealthUiGeometry(
        hugeMiniHealthAnchorWorld(top.index),
        hugeMiniatures[top.index].rotationDeg,
      );
      if (isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsHugeMiniIndex = top.index;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHuge2MiniIndex = null;
        openHealthControlsBoardObjectIndex = null;
        return true;
      }
    } else if (top.kind === 'boardObject') {
      const geom = getBoardObjectHealthUiGeometry(top.index);
      if (geom && isPointInCircle(screenX, screenY, geom.badgeCenter, geom.badgeRadius)) {
        openHealthControlsBoardObjectIndex = top.index;
        openHealthControlsUnitIndex = null;
        openHealthControlsBigMiniIndex = null;
        openHealthControlsLargeMiniIndex = null;
        openHealthControlsHugeMiniIndex = null;
        openHealthControlsHuge2MiniIndex = null;
        return true;
      }
    }
  }

  // Outside-click: if any health popover was open and we missed all badges,
  // close it. This preserves the prior "click anywhere else to dismiss" UX.
  if (
    openHealthControlsUnitIndex !== null ||
    openHealthControlsBigMiniIndex !== null ||
    openHealthControlsLargeMiniIndex !== null ||
    openHealthControlsHugeMiniIndex !== null ||
    openHealthControlsHuge2MiniIndex !== null ||
    openHealthControlsBoardObjectIndex !== null
  ) {
    openHealthControlsUnitIndex = null;
    openHealthControlsBigMiniIndex = null;
    openHealthControlsLargeMiniIndex = null;
    openHealthControlsHugeMiniIndex = null;
    openHealthControlsHuge2MiniIndex = null;
    openHealthControlsBoardObjectIndex = null;
    return true;
  }
  return false;
}
```

Note: `boardObject` is now a valid `top.kind`, so Task 3's `resolveTopInteractiveAtScreen` must also collect board-object candidates. Extend the resolver body to scan `boardObjects[]` and push `{ kind: 'boardObject', index: i }` when a piece's footprint contains `hex`. Use the same footprint helpers already present in `src/main.ts` (search for `boardObjectFootprint` or the existing `boardObjectHitIndexFromWorld` pattern around `src/main.ts:4696`).

- [ ] **Step 2: Update the `pointerdown` call-sites**

At `src/main.ts:8442` (inside the `canvas.addEventListener('pointerdown', …)` block), replace:

```ts
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
    refreshDeadScorePills();
    scheduleRender();
    return;
  }
```

with:

```ts
  const top = resolveTopInteractiveAtScreen(e.clientX, e.clientY);
  if (tryEtherVortexCrystalBadgeOpen(e.clientX, e.clientY, top)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleBroomgarHungerClick(e.clientX, e.clientY, top)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleMiniatureActivationClick(e.clientX, e.clientY, top)) {
    e.preventDefault();
    scheduleRender();
    return;
  }
  if (handleMiniatureHealthClick(e.clientX, e.clientY, top)) {
    e.preventDefault();
    refreshDeadScorePills();
    scheduleRender();
    return;
  }
```

Apply the same replacement at `src/main.ts:8585` inside the `canvas.addEventListener('mousedown', …)` block.

Also update `tryTouchDoubleTapOnMiniatureForCard` at `src/main.ts:7792` which calls the same four handlers — compute `top` once at the top of the function and pass it through.

- [ ] **Step 3: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all existing tests still pass, plus the 7 new `pickTopCandidate` tests.

- [ ] **Step 5: Preview verify**

With the dev server running:
1. `mcp__Claude_Preview__preview_logs` level=error — expect no new build errors.
2. `mcp__Claude_Preview__preview_console_logs` level=error — expect no runtime errors.
3. Scenario check (manual in browser, list for the executor):
   - Place a small mini on a vortex hex. Click the mini — it should select / open its card, NOT the crystal counter.
   - Select the vortex (click a non-mini hex of it). Now the vortex is "lifted". Click through the mini on the vortex — the crystal counter should open.
   - Stack a bigMini with a small unit on top. Click the small unit's health badge — only the unit's health UI opens, the bigMini below does not react.
   - Click the bigMini's health badge on a hex where no unit stands — bigMini health UI opens as before.
   - No regression on Broomgar hunger toggle.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "refactor(hit-test): route pointerdown through topmost-interactive resolver"
```

---

### Task 5: Remove the obsolete vortex-selection guard

**Files:**
- Modify: `src/main.ts` — within `tryEtherVortexCrystalBadgeOpen`, the old `selectedEtherVortexIndex !== i && resolveMiniatureTapKeyForDoubleTap(...)` guard from the stop-gap fix.

- [ ] **Step 1: Confirm the guard was replaced in Task 4**

Task 4's new body of `tryEtherVortexCrystalBadgeOpen` already starts with `if (top === null || top.kind !== 'etherVortex') return false;` — the resolver alone now enforces "selected vortex wins, else miniature wins". If the old defensive guard survived in the diff, delete it now. Grep `src/main.ts` for `resolveMiniatureTapKeyForDoubleTap` inside `tryEtherVortexCrystalBadgeOpen` to verify it is gone.

- [ ] **Step 2: Type check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 3: Commit (skip if Task 4's commit already removed the guard)**

```bash
git add src/main.ts
git commit -m "refactor(hit-test): drop vortex-specific guard, resolver owns the rule"
```

---

### Task 6: Deploy

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy**

```bash
ssh tornscape 'bash /var/www/hex-board-game/deploy/deploy.sh'
```

Expected: fast-forward update, `Deployed <sha>.` on success.

- [ ] **Step 3: Smoke-test the prod URL**

Manual: open `https://tornscape.dubrovindesign.ru/`, reproduce the mini-on-vortex scenario, confirm selected-vortex click reaches the crystal counter and non-selected-vortex click selects the mini.

---

## Out of Scope

Intentionally **not** touched by this plan — they keep their current behavior:

- Off-board interactive elements (no visual stacking, no z-issue).
- God table / inventory table pieces (non-board realm).
- Drag-start resolution (`try*DragFromPending`) — separate flows, no user-reported bug.
- Terrain + boardObject selection: they appear in the resolver candidate list only via their footprint (already handled upstream); this plan does not move their selection UX.
- `drawSelectedLiftPass` rendering: already correct, not modified.

If any of the above surface similar z-order bugs later, a follow-up plan can extend the resolver's candidate collection to cover them.
