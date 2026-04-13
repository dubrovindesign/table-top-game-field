# Design: Dead Score Pill Near Dead Zone

**Date:** 2026-04-14  
**Status:** Approved

## Problem

The player loss counters (`dead-score-pill`) are currently mounted inside `mountTopTurnPanel` — a `position: fixed` panel pinned to the top of the screen. The user wants each counter to sit near its respective dead zone, not fixed at the top.

## Goal

Move each `dead-score-pill` element so it floats just above the top-left corner of the player's dead zone, following the zone as the camera pans/zooms.

## Chosen Approach

Mount the pill elements directly inside `myWrap` / `oppWrap` in `DeadUnitDock`. Since `applyBounds` repositions the wrapper element (which is `position: fixed`) every frame on camera movement, the pill moves with the zone automatically — no extra synchronization needed.

### Pill position (visual)

Variant A: pill sits outside the zone border, slightly above the top-left corner, left-aligned.

```
[☠ 12]         ← pill, above the border
┌──────────────────────┐
│  dead zone           │
└──────────────────────┘
```

CSS anchor: `position: absolute; top: 0; left: 0; transform: translateY(calc(-100% - 4px))`

The `.dead-unit-table-wrap` has `position: fixed` and no `overflow` restriction, so the absolutely-positioned pill overflows above without clipping.

## Changes

### `src/deadUnitDock.ts` — `DeadUnitDock`

- **Constructor**: after appending `myZone` to `myWrap` and `oppZone` to `oppWrap`, call the existing `mountDeadScorePill(mount, 'local')` / `mountDeadScorePill(mount, 'opponent')` to create pill mounts, then append each to `myWrap` / `oppWrap` respectively.
- **Public fields**: expose `myScoreValueEl: HTMLElement` and `oppScoreValueEl: HTMLElement` — references to the `.dead-score-pill__value` spans — so `refreshDeadScorePills` can update text without DOM queries.
- **`dispose`**: no extra work; pill is removed from the DOM automatically when `myWrap`/`oppWrap` are removed from `document.body`.

### `src/main.ts`

- **`mountTopTurnPanel`**: remove both `mountDeadScorePill` calls, the `opponentDeadScoreMount` / `localDeadScoreMount` variables, and their references in the wing stacks. Remove these two fields from the returned object.
- **`refreshDeadScorePills`**: replace `topTurnPanel.localDeadScoreMount.querySelector(…)` / `topTurnPanel.opponentDeadScoreMount.querySelector(…)` with direct references to `deadUnitDock.myScoreValueEl` / `deadUnitDock.oppScoreValueEl`.

### `src/style.css`

Add one new rule to position the pill mount when it lives inside the wrap:

```css
.dead-unit-table-wrap .dead-score-mount {
  position: absolute;
  top: 0;
  left: 0;
  transform: translateY(calc(-100% - 4px));
  pointer-events: none;
  z-index: 1;
}
```

Existing `.dead-score-pill` and `.dead-score-pill__value` styles are unchanged.

## What Does Not Change

- `mountDeadScorePill()` function — reused as-is.
- All score computation: `deadZoneStatsForSlot`, `resolveDeadZoneScoredPoints`, `deadScoreTotal`.
- All call sites of `refreshDeadScorePills` — only internal implementation changes.
- `applyDualLayouts` / `applyOneLayout` — not modified.

## Edge Cases

- **Empty dead zone (0 cards):** `computeDeadZoneLayoutForSlot` still produces a valid container rect (single placeholder card position), so the pill is positioned correctly even with no units.
- **Dead zone hidden (`isDeadZoneHideWorld`):** the wrap is still in the DOM but opacity/visibility is managed by the existing logic; the pill inherits the same visibility.
- **Zoom/pan:** `applyBounds` is called every render frame — pill position is always up to date.
