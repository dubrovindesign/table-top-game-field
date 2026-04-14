# Compact Dead Zone with Expandable Panel

## Problem

The dead zone currently grows horizontally as units die — each fallen miniature is rendered as a card inside the zone frame. This consumes board space and visual weight proportional to losses, which we don't want during play.

Desired behavior:

- Dropping a miniature into the dead zone makes it visually disappear. Only the loss counter (pill) is shown in the center of a compact slot.
- Clicking the compact slot reveals a floating panel above it, listing the fallen units as cards. Clicking outside (or on the slot again) closes the panel.
- The on-field footprint of the dead zone stays constant regardless of loss count.

## Decisions (from brainstorming)

| # | Question | Choice |
|---|----------|--------|
| 1 | Compact zone shape | Small fixed rectangle slot with pill centered |
| 2 | Expand behavior | Floating popup panel above the slot |
| 3 | Collapse trigger | Click outside panel/slot (including slot itself) |
| 4 | Drop while expanded | Panel updates live, stays open |
| 5 | Counter layout | Pill centered in slot; slot size fixed (fits wounded breakdown) |
| 6 | Multi-side expand | Both sides independent; state is local, not synced |
| 7 | Empty state | Slot always visible; click is a no-op when `entries.length === 0` |

## DOM Structure

Inside each `.dead-unit-table-wrap` (mine / opponent) the structure becomes:

```
.dead-unit-table-wrap
├── .dead-unit-zone              ← compact slot, always visible
│   └── .dead-score-pill         ← centered via flex
└── .dead-unit-zone-panel        ← floating popup, display:none unless expanded
    └── .dead-unit-dock-card*    ← fallen unit cards
```

- `.dead-score-mount` is removed. The pill lives directly inside `.dead-unit-zone`.
- `.dead-unit-zone-inner` is replaced by `.dead-unit-zone-panel` as a sibling (not a child) of `.dead-unit-zone`.
- `.dead-unit-table-wrap.is-expanded` toggles `display: flex` on the panel.
- Cards are rendered into the panel (not the slot) on every `refresh(vm)`.

The wrap's world anchor (position on the canvas) is unchanged — the slot sits where the zone center sits today.

## Layout Model

`computeDeadZoneLayoutForSlot(slot)` returns a new `DeadZoneLayout`:

```ts
type Bounds = { left: number; top: number; width: number; height: number };

type DeadZoneLayout = {
  slot: Bounds;                 // compact slot on canvas (fixed screen-px size, zoom-scaled)
  panel: Bounds | null;         // popup bounds; null when entries.length === 0
  cards: CardBounds[];          // positions relative to panel.left/top
  borderScreenPx: number;
  zoom: number;
};
```

Rules:

- **`slot`**: fixed screen-pixel size (approx `140 × 56` at zoom=1, tuned so pill + wounded breakdown fit with ≥ 8px margin). Anchored at the world point that today serves as the zone center.
- **`panel`**: computed only when `entries.length > 0`. Positioned above the slot with a screen-px gap (`10 * zoom`), centered on X. Width = sum of card widths + gaps + horizontal padding. Height = single card row + vertical padding.
- **`cards`**: coordinates relative to `panel.left/top` (not `container` as before).
- Wrap `applyBounds` covers the bounding box of `slot ∪ panel` so the wrap remains a valid positioned ancestor; `slot` and `panel` are positioned inside via `applyBounds` against their own bounds.

## Expanded State

Owned by `DeadUnitDock` as a private field:

```ts
private expanded: { mine: boolean; opp: boolean } = { mine: false, opp: false };
```

Not persisted, not synced over multiplayer. Behavior:

- **Click on `.dead-unit-zone`** (pointerdown, button 0): toggles `expanded[side]` if `entries.length > 0`; otherwise ignored. Must not interfere with zone-move drag (which begins on the same element) — distinguish by movement threshold / pointer-up on same element.
- **Click outside**: global `pointerdown` listener on `window` closes `expanded[side]` if the point is outside both `slot` bounds and `panel` bounds for that side. Clicks inside one side's panel do not close the other side.
- **Card drag start** (`onDeadCardPointerDown`): does not close the panel — existing behavior stands.
- **`refresh(vm)`**: if `vm.myEntries.length === 0`, reset `expanded.mine = false`; same for opp. Prevents an empty panel from remaining open after the last unit is restored to the board.
- **Apply**: when `expanded` flips, call `applyExpandedClasses()` to toggle `.is-expanded` on wrap, then re-run `applyDualLayouts(...)` with the last known layouts so `panel` bounds are (re)applied.

## Hit Testing

New and changed methods on `DeadUnitDock`:

- **`hitTestDeadZoneDropTarget(clientX, clientY): 'mine' | 'opp' | null`** — unified drop target. Returns a side if the point lies in that side's `slot` bounds, OR in its `panel` bounds when `expanded[side]` is true.
- **`hitTestDeadZoneCards(clientX, clientY)`** — narrowed: searches cards only within the expanded panel of each side. Used for dragging fallen units back to the board.
- **`isPointOverDeadZoneChrome(clientX, clientY)`** — now also returns true for points inside an expanded panel, so field raycasts don't leak through.
- **`hitTestDeadZoneMoveHandle`** — unchanged; continues to drag the slot (not the panel).

## Drop Behavior

In `src/main.ts` → `tryCommitBoardDragToDeadZone`:

- Replace `deadUnitDock?.hitTestDeadZoneCards(clientX, clientY)` with `deadUnitDock?.hitTestDeadZoneDropTarget(clientX, clientY)`.
- All downstream logic (resolving slot, points, `upsertDeadEntry`, `replaceDeadZoneState`) is unchanged.
- After commit, `refresh(vm)` rebuilds panel children; if the panel is already open, it visually updates with the new card without changing `expanded` state (Q4-A).

## Counter Pill

- The pill (`.dead-score-pill`) is mounted once, inside `.dead-unit-zone`, by `DeadUnitDock.constructor`. Public references `myScoreValueEl`, `oppScoreValueEl`, `myScoreBreakdownEl`, `oppScoreBreakdownEl` are retained — `main.ts` keeps using them.
- `mountDeadScorePill()` and `.dead-score-mount` in `src/main.ts` are removed.
- The wounded-units spec (`2026-04-14-wounded-units-loss-counter-design.md`) governs pill content (total + optional breakdown). This spec adds one constraint: the breakdown line must fit inside the fixed slot without wrapping — shrink the breakdown font if needed during implementation.
- Empty state (`dead = 0 && wounded = 0`): pill shows `☠ 0`, breakdown hidden, slot not clickable.

## CSS (in `src/style.css`)

All canvas-scaled dimensions use `calc(Xpx * var(--dead-unit-zoom))` per `CLAUDE.md`.

- `.dead-unit-zone`
  - Size, left, top, border-width — set from JS (already screen-px, zoom-aware).
  - `border-radius: calc(10px * var(--dead-unit-zoom));`
  - `display: flex; align-items: center; justify-content: center;`
  - Cursor: `pointer` when entries exist, otherwise `default`.
- `.dead-unit-zone-panel`
  - Size, left, top — set from JS via `applyBounds`.
  - `position: absolute;`
  - Background matches the current zone fill.
  - `border: calc(1px * var(--dead-unit-zoom)) solid <DEAD_ZONE_BORDER_COLOR>;`
  - `border-radius: calc(8px * var(--dead-unit-zoom));`
  - `padding: calc(8px * var(--dead-unit-zoom));`
  - `box-shadow: 0 calc(4px * var(--dead-unit-zoom)) calc(16px * var(--dead-unit-zoom)) rgba(0,0,0,0.5);`
  - `display: none;` by default.
  - `.dead-unit-table-wrap.is-expanded .dead-unit-zone-panel { display: flex; }`
- `.dead-unit-dock-card` — unchanged.
- `.dead-score-mount` — remove.

## Files to Modify

- `src/deadUnitDock.ts`
  - `DeadZoneLayout` → new shape (`slot`, `panel`, `cards`).
  - Constructor: restructure DOM (slot + panel siblings, pill inside slot).
  - `expanded` state + `applyExpandedClasses()` + global pointerdown listener.
  - `applyOneLayout` → apply `slot` and (if present) `panel` bounds; place cards inside panel.
  - `refresh(vm)` → render cards into panel; reset `expanded[side]` when entries are empty.
  - `onSlotPointerDown(side)` handler; integrate with existing zone-move drag threshold.
  - New `hitTestDeadZoneDropTarget`; narrow `hitTestDeadZoneCards` to expanded panel; update `isPointOverDeadZoneChrome`.

- `src/main.ts`
  - `computeDeadZoneLayoutForSlot` → return new `DeadZoneLayout` shape.
  - `tryCommitBoardDragToDeadZone` → use `hitTestDeadZoneDropTarget`.
  - Remove `mountDeadScorePill` and `.dead-score-mount` DOM; drop pill references through `deadUnitDock.myScoreValueEl` / breakdown fields (pattern already in use).
  - `refreshDeadScorePills` — unchanged.

- `src/style.css`
  - Add `.dead-unit-zone-panel` rules.
  - Add flex centering to `.dead-unit-zone`; add `.is-expanded` descendant rule.
  - Remove `.dead-score-mount` rules.

- `src/deadUnitState.ts` — no changes.

## Non-Goals

- Panel animation (fade/slide on expand) — out of scope; `display: none/flex` toggle only. Can be added later.
- Keyboard shortcuts (Esc to close) — out of scope.
- Persisting expand state across sessions — out of scope (local, volatile).
- Changing the shape of `DeadZoneEntry` or any serialized state — pill wounded-breakdown comes from the other spec.
- Redesigning the card visual inside the panel — cards render exactly as today.
