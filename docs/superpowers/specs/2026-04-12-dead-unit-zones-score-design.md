# Dead Unit Zones With Score Tracking

**Date:** 2026-04-12  
**Status:** approved by user in brainstorming session

## Context

The board already has a DOM overlay pattern for two mirrored side zones (`GodHandBlindDock`) that stays visually stable while the field rotates and zooms.  
The user wants a second mirrored overlay for dead miniatures:

- dragging miniatures into a dead zone adds score;
- dragging out reverts score;
- score is shown for both players in the top turn panel, near crystal wallets;
- zones should mirror by local perspective and must remain visually static (not rotating with the field), like blind zones.

## Confirmed Requirements

1. Add two dead-unit zones on the board (mine/opponent), mirrored by client perspective.
2. Dead zones visually follow blind-zone style (framed side dock, not a simple hidden counter).
3. Zone orientation remains static/readable and must not rotate with field rotation.
4. Score basis is fixed army purchase cost ("price taken to table"), not dynamic modifiers.
5. Score can be reverted by moving miniature out of dead zone.
6. Both players can edit both zones in multiplayer.
7. Score attribution is by zone side where miniature is dropped (not by miniature owner).
8. Top panel shows only total scores (no per-leader breakdown):
  - right side near local wallet: score of local-side dead zone;
  - left side near opponent wallet: score of opponent-side dead zone.

## Approaches Considered

### A) Dedicated `DeadUnitDock` reusing blind-zone architecture (chosen)

Create a new dead-zone overlay module parallel to `GodHandBlindDock` with its own view model/layout contract and drag/drop integration.

### B) Generalize `GodHandBlindDock` into universal side-dock

Refactor blind and dead zones into one configurable dock implementation.

### C) Canvas-rendered dead zones + DOM-only counters

Render zone boxes on canvas and keep only top score counters in DOM.

### Why A is chosen

- lowest regression risk for existing blind-zone behavior;
- direct compatibility with current zoom/rotation-safe overlay model;
- simpler incremental rollout and easier testing boundaries.

## Architecture

### New Overlay Module

Introduce `DeadUnitDock` as a separate DOM overlay component, with two wraps:

- local-side dead zone;
- opponent-side dead zone.

The module should mirror the proven responsibilities of blind dock:

- apply externally computed screen layouts;
- maintain pointer hit-testing for zone chrome/cards;
- expose zone membership checks needed by drag/drop flow.

### Layout Contract

Dead-zone screen rectangles are computed in `main.ts` from board/world geometry using the same coordinate model as blind zones:

- world anchor -> screen via `boardWorldToScreenBase`;
- per-element screen spacing and frame metrics scale from `camera.zoom`;
- no CSS-only fixed borders/gaps for board-tied overlay geometry.

Zone orientation must remain screen-stable:

- zone position tracks board edge anchors;
- zone/cards are not rotated as DOM transforms with board rotation.

## Data Model

### Runtime State

Add dead-zone state split by table seat slot (`0` / `1`) as canonical storage, e.g.:

- `deadByZone[slot]: DeadEntry[]`.

Slot mapping contract:

- `slot 0` and `slot 1` are absolute table seats in board state/protocol (not viewer-relative).
- local/opponent UI mapping is derived at render-time from current local seat (`localViewPlayerSlot` in runtime):
  - if local slot is `0`, local score uses `deadByZone[0]`, opponent score uses `deadByZone[1]`;
  - if local slot is `1`, local score uses `deadByZone[1]`, opponent score uses `deadByZone[0]`.

`DeadEntry` exact required shape:

- `boardInstanceId` (unique miniature identity);
- `scoredPoints` (fixed integer used in totals);
- `order` (stable integer used for deterministic visual ordering inside zone).

`DeadEntry` intentionally does not duplicate full unit card data. Source of truth for miniature identity/art stays in existing unit collections keyed by `boardInstanceId`.

`zoneSlot` is not duplicated inside `DeadEntry`; zone is defined by parent array index in `deadByZone[slot]`.

### Board Presence Contract

- A miniature in `deadByZone[*]` is considered off-board for gameplay interactions.
- Runtime applies this by deriving `deadZoneSlot = slot` from `deadByZone` at apply-time and excluding those units from normal board placement/selection/hit tests.
- Dead-zone visual position is derived from zone layout + `order`, not from board hex coordinates.
- Removing from dead zone clears derived dead-zone membership and restores normal board interactions.
- Single source of truth rule: serialized payload stores only `deadByZone`; per-unit `deadZoneSlot` is runtime-derived and not serialized in unit rows.
- Resolve rule: each `DeadEntry.boardInstanceId` must match exactly one existing miniature row in snapshot/runtime collections; unmatched entries are dropped with warning.
- Unit snapshot position fields (`position` / `anchor` / `center` / optional `offBoardWorld`) are preserved unchanged while unit is dead-zoned; dead-zone membership controls interactivity and rendering precedence.
- Restore fallback: if drag-out cancel happens (illegal board target), unit remains dead-zoned and original stored placement fields remain untouched.

### Scoring Contract

- `scoredPoints` is captured on zone entry from army purchase price (roster cost at table setup semantics).
- authoritative source order for score capture:
  1. roster unit snapshot points already used for this placed miniature;
  2. fallback to catalog unit `points` value;
  3. fallback to `0` with warning.
- totals are sums of `scoredPoints` per zone side.
- dynamic in-game buffs/debuffs do not alter already recorded dead score.

### Revert Contract

- moving miniature from dead zone back to board removes its `DeadEntry`;
- zone total decreases by removed entry `scoredPoints`.

### Uniqueness Guard

- same `boardInstanceId` cannot exist in both dead zones simultaneously;
- repeated drop of already-recorded miniature into the same zone is idempotent (no duplicate entry).
- if dropped into the opposite dead zone, runtime performs an atomic move (remove from old zone, add to new zone) with no score double-count.

### Order Contract

- zone array order is deterministic visual order (canonical).
- insertion into a zone appends to the end (`order = last + 1` logical behavior).
- dead->dead move appends in target zone and removes source entry.
- if incoming payload has non-monotonic/duplicate `order`, parser normalizes to contiguous ascending order by existing array sequence.
- if `order` disagrees with array order after parse, renderer and logic use array order; normalized `order` is rewritten to match.

## Interaction and UX

### Drag In

1. User drags miniature from board.
2. If drop hits dead-zone acceptance area, miniature transitions to dead-zone representation/state.
3. Entry is recorded in dropped side zone and total score updates immediately.

### Drag Out

1. User drags miniature from dead zone back to board.
2. Drop target uses existing size-specific placement resolver (same legality checks as normal board drop for that miniature type).
3. If placement is legal: entry is removed from that zone and score reverts immediately.
4. If placement is illegal: no state change (entry remains in dead zone, score unchanged).

### Dead-Zone To Dead-Zone Move

1. User drags miniature from one dead zone directly into the opposite dead zone.
2. Miniature keeps same `boardInstanceId` and `scoredPoints`.
3. Entry is removed from source zone and inserted into target zone in one update.
4. Source total decreases and target total increases by the same amount.
5. Operation is idempotent under replay (same final single entry).

### Origin Constraints

- Only miniatures currently on board or already in a dead zone can be dropped into dead zones.
- Direct drag from army panel/catalog into dead zone is out of scope for v1 and must be rejected by drop handlers.

### Multi-Hex Drag Rule

- For `large` / `huge` / `huge2`, dead-zone drop acceptance uses the dragged piece anchor/pointer point, same interaction model as existing board drag/drop resolution.

### Pointer Behavior

Adopt same pointer-pass-through principles used by blind zones:

- only meaningful zone chrome/content should capture pointer;
- transparent holes should allow interaction with board beneath;
- keyboard hotkeys should not trigger when cursor is over active dead-zone chrome/content.

## Top Panel Integration

Add compact dead-score counters in both turn wings, near wallet mounts:

- left wing: opponent-zone total;
- right wing: local-zone total.

The panel must preserve current center alignment behavior around the turn button block and remain stable as values grow.

## Multiplayer and Protocol

Dead-zone state must be part of synchronized board state/protocol payloads so both clients converge on identical:

- dead-zone membership;
- per-side score totals.

Given both players can edit both zones:

- no owner-based authorization gate for dead-zone edits;
- apply model follows existing board sync behavior: clients send full board snapshot; receivers replace/apply full state (no CRDT merge).
- conflict resolution is last-arriving snapshot wins at transport level; duplicate safety is still enforced during apply validation by `boardInstanceId`.

Totals must be derived from synchronized zone entries, not from unsynced local UI events.

### Serialization Contract

Add field to serialized board snapshot v1:

- `deadByZone`: tuple `[DeadEntry[], DeadEntry[]]`.

Validation rules:

- missing `deadByZone` in legacy snapshots -> treat as `[[], []]`;
- each entry must satisfy required `DeadEntry` schema;
- invalid entries are dropped with warning log; valid entries continue to load.

Ordering:

- each zone array order is authoritative visual order;
- if duplicate `boardInstanceId` appears in payload, keep first entry and drop later duplicates with warning.
- if same `boardInstanceId` appears across both zone arrays, keep the first occurrence in slot-order scan (`0` then `1`), drop subsequent occurrences with warning.

## Error Handling

- if miniature price source is missing/invalid on zone entry, apply explicit fallback policy (default `0` + warning) rather than crashing or writing NaN.
- warning for price fallback and malformed entries is console-level (`console.warn`) with `boardInstanceId` context.
- malformed incoming dead-zone payload items are sanitized at board-state parser layer: bad entry dropped, rest of board state remains usable.
- solo mode uses same behavior with local-only state updates (no protocol transport), preserving identical drag/score semantics.

## Testing Plan

## Unit

- add/remove: with sample values `5` and `3`, totals change to `8` then back to `5` after revert;
- duplicate drop idempotency: second insert of same `boardInstanceId` does not change totals/length;
- cross-zone move keeps exactly one entry and preserves `scoredPoints`;
- score uses fixed purchase cost snapshot even if runtime modifiers change later;
- parser: missing `deadByZone` normalizes to `[[], []]`;
- parser: duplicate `boardInstanceId` in payload keeps first, drops rest with warning.

## Integration

- local drag board -> dead zone updates state and top-panel value in same frame tick;
- drag out dead zone -> board restores interactivity and reverts score;
- dead->dead drag moves score attribution by zone side without changing total sum across both zones;
- top panel shows expected left/right totals near wallets for both `myPlayerSlot = 0` and `myPlayerSlot = 1`.

## Multiplayer

- client A edits dead zones, client B sees same entries/totals;
- after each received snapshot apply, validator guarantees no duplicate `boardInstanceId` across zones;
- rapid concurrent edits converge to last-arriving snapshot semantics of existing full-state sync;
- reconnect/state rehydrate preserves dead-zone entries and totals exactly (deep-equal on `deadByZone` arrays).

## Rotation/Zoom Regression

- at multiple board rotations, dead zones stay readable and non-rotating;
- under camera zoom changes, frame/gaps/metrics scale consistently with board-tied overlay rules;
- hit-tests remain accurate after rotation+zoom combinations.

## Scope

1. New dead-zone dock + layout computation in existing board overlay model.
2. Score tracking and revert behavior by zone side.
3. Top-panel total counters near crystal wallets.
4. Multiplayer serialization/sync and tests for dead-zone state and totals.

## Out Of Scope

- per-leader dead score breakdown UI;
- combat rules automation for "killed" detection (manual drag remains source of truth);
- redesign of existing blind zone or wallet feature behavior.