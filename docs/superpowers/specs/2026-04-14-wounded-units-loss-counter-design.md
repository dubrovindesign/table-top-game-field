# Wounded Units in Loss Counter

## Problem

The loss counter currently only tracks dead units (full cost). Game rules require that living miniatures with less than half their max HP also contribute to losses — at half their point cost, rounded down. This affects end-of-game scoring.

## Requirements

- Real-time updates: the loss pill refreshes whenever any unit's HP changes.
- Wounded points are a single aggregated number per player slot, not per-unit entries.
- The pill displays a breakdown when wounded units exist.
- Kellanthra (transform unit) has hardcoded scoring rules.
- Catalog prices remain unchanged.

## Data Model

### New state

```ts
// Alongside existing DeadByZone
let woundedPoints: [number, number] = [0, 0];
```

One number per player slot. No per-unit records.

### Recalculation function: `recalcWoundedPoints(slot)`

Iterates all living units for the given slot (units, bigMiniatures, largeMiniatures, hugeMiniatures, huge2Miniatures). For each unit:

1. Skip if dead (`offBoardWorld` equals `DEAD_ZONE_OFFBOARD_HIDE`).
2. Look up `catalogUnitId` → `CatalogUnitDef` → get `points` and `card.maxHealth`.
3. Skip if no `catalogUnitId` or `points === 0`.
4. Check hardcoded overrides first (see Kellanthra section below).
5. General formula:
   ```ts
   const threshold = Math.ceil(maxHealth / 2);
   const isWounded = health > 0 && health < threshold;
   const woundedCost = isWounded ? Math.floor(points / 2) : 0;
   ```
6. Sum all wounded costs → write to `woundedPoints[slot]`.

### When recalculation triggers

- HP change (health +/- buttons on any unit).
- `applyBoardSnapshot()` (multiplayer sync).
- Unit moved to/from dead zone.

## Kellanthra Hardcode

### Identification

- Big Kellanthra: `catalogUnitId === 'keld-kellantra_lindwurm'`.
- Small Kellanthra: `catalogUnitId === 'keld-kellantra'`.

### Big Kellanthra's maxHealth

Big Kellanthra has `maxHealth = 12`. The general formula would give `Math.ceil(12/2) = 6` as threshold, but the hardcoded value is 4 (derived from the transform rules: combined HP 12+4=16, half=8, threshold for big form = small form's HP = 4). The hardcode is intentional.

### Scoring rules

| State | Wounded cost | Death cost |
|-------|-------------|------------|
| Big Kellanthra alive, HP >= 4 | 0 | — |
| Big Kellanthra alive, HP < 4 | 35 | — |
| Big Kellanthra in dead zone | — | 35 (overrides catalog 70) |
| Small Kellanthra alive | 0 (the 35 wounded comes from big form being dead) | — |
| Small Kellanthra dead | — | 35 (overrides catalog 28) |

**Key:** When big Kellanthra dies, her dead entry scores 35 (not 70). The wounded contribution from her drops to 0 (she's dead, skipped in living-unit scan). No dead-zone wounded scan is needed.

**Total if both forms die: 35 + 35 = 70** (matches full cost of big Kellanthra).

### Implementation

**Living units:** A dedicated function `getKellanthraOverride(catalogUnitId, health)` returns `{ woundedCost: number } | null`. Returns `null` for non-Kellanthra units → fall through to general formula. This function is only called for living units (dead units are skipped at step 1 of recalc).

Death cost override for big Kellanthra: in `tryCommitBoardDragToDeadZone()`, `kellanthraDeathPointsOverride()` returns 35 instead of catalog 70.

Death cost override for small Kellanthra: in `resolveDeadZoneScoredPoints()`, check if the dying unit's `catalogUnitId` matches small Kellanthra and override `scoredPoints` to 35 instead of catalog 28.

Future transform units are added by extending these hardcoded checks.

## UI: Pill Display

### DOM structure

```html
<span class="pill" data-variant="local">
  <span class="pill-total">87</span>
  <span class="pill-breakdown">72 + 15</span>
</span>
```

### Display logic

| Dead | Wounded | pill-total | pill-breakdown |
|------|---------|-----------|----------------|
| 72 | 0 | `72` | hidden |
| 0 | 15 | `15` | `0 + 15` (visible) |
| 72 | 15 | `87` | `72 + 15` (visible) |
| 0 | 0 | `0` | hidden |

Rule: `pill-breakdown` is visible when `wounded > 0`, hidden otherwise.

### Styling

- `pill-total`: current style (large, bright text).
- `pill-breakdown`: smaller font size, muted appearance (`opacity: 0.55` or a dedicated subdued color).
- All dimensional properties use `calc(Xpx * var(--dead-unit-zoom))` per canvas scaling rules.

### Refresh

`refreshDeadScorePills()` reads both `deadScoreTotal(entries)` and `woundedPoints[slot]`, updates both elements, and toggles `pill-breakdown` visibility.

## General Wounded Formula

### Threshold

```ts
const threshold = Math.ceil(maxHealth / 2);
```

A unit is wounded when `health > 0 && health < threshold`.

Examples:
- maxHealth=6, threshold=3: HP 2 → wounded. HP 3 → not wounded.
- maxHealth=5, threshold=3: HP 2 → wounded. HP 3 → not wounded.
- maxHealth=1, threshold=1: HP 0 → dead (handled by dead zone, not wounded).

### Cost

```ts
const woundedCost = Math.floor(points / 2);
```

Examples: points=30 → 15. points=31 → 15. points=70 → 35.

### Edge cases

- Dead units are skipped (already counted in dead zone). Kellanthra forms score 35 each in dead zone (not full catalog cost).
- Units without `catalogUnitId` or with `points === 0` are skipped.
- Kellanthra forms use hardcoded overrides instead of this formula.

## Files to modify

- `src/deadUnitState.ts` — add `woundedPoints` state, `recalcWoundedPoints()`, Kellanthra override function, death cost override for small Kellanthra in `resolveDeadZoneScoredPoints()`.
- `src/main.ts` — update `mountDeadScorePill()` DOM structure, update `refreshDeadScorePills()` to show breakdown, call `recalcWoundedPoints()` on HP change events.
- CSS (wherever pill styles live) — add `pill-breakdown` styles with zoom scaling.
