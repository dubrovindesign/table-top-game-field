# Board Rotation Attachment Design

## Context

Current board rotation behavior mixes field-space logic and table-space UI/object rendering. This causes:

- grid/image mismatch during rotation,
- cursor highlight mismatch after rotation,
- blind zones rotating with the field,
- detached objects rotating when they should remain fixed.

## Goal

Make board rotation deterministic with two coordinate spaces:

- rotate only field logic and field visuals together,
- keep pointer hover/highlight/hit-test in the same transform basis as grid logic after rotation,
- keep blind zones and detached objects fixed in table space,
- keep attached objects moving/rotating with the field,
- normalize detached -> attached re-entry rotation to board basis.

## Confirmed Behavior

### Spaces

- `tableWorld`: free table layer (blind zones, detached god cards, detached minis, detached items).
- `boardLocal`: field logical layer (hex grid, snap/range, board overlay).

### Attachment Rule

- Object is **attached** if it is inside board footprint.
- Object is **detached** if it is outside board footprint.
- **Footprint definition (v1):** attachment is evaluated by the piece anchor used for placement logic:
  - small: `position`,
  - big: `center`,
  - large/huge: `anchor`.
- Boundary rule: anchor on valid board cell = attached.
- Anchor outside valid board cell set = detached.

### Rotation Effects

- Rotating board rotates:
  - board image,
  - board grid overlay,
  - attached objects.
- Rotating board does not rotate:
  - blind zones,
  - detached objects.

### Re-entry Rule

When a detached miniature is returned to board:

- position snaps to board hexes,
- rotation is snapped to board basis (not preserving detached world angle).
- Board basis is discrete and measurable:
  - small/large/huge facings snap to nearest 60-degree step relative to board basis,
  - big follows the same discrete facing rule used by board-aligned placement.

## Architecture

### Data Model

Each rotatable/droppable table piece uses explicit binding state:

- `attached(boardId)`
- `detached`

For miniatures, maintain normalized orientation through a single adapter that resolves:

- world-facing angle for detached rendering,
- board-basis angle for attached rendering.

### Transform Pipeline

- Board rotation and camera transforms are separate:
  - `T_board(boardId)`: board orientation transform applied to board image, grid, and attached objects.
  - `T_camera`: viewport pan/zoom transform applied globally for rendering and input projection.
  - Field logic uses board space through `T_board`, never camera-only compensation.

- Input/hit pipeline:
  1. `screen -> tableWorld`
  2. if pointer intersects board footprint:
     - `tableWorld -> boardLocal`
     - board-local hit/snap/range
  3. else detached table-world hit handling

- Render pipeline:
  - board + grid from `boardLocal` via board transform,
  - attached pieces via board transform,
  - detached pieces and blind zones directly in `tableWorld`.

### API Boundaries

Keep these conversion functions explicit and non-overlapping:

- `screenToTableWorld()`
- `tableWorldToScreen()`
- `tableWorldToBoardLocal(boardId)`
- `boardLocalToTableWorld(boardId)`

Blind zone layout must always use table-space functions only.

### Scope

- v1 keeps single active gameplay board behavior with board-aware model hooks (`boardId`) for forward compatibility.
- If multiple boards are present, detached -> attached drop binds to the board whose footprint contains the resolved snapped anchor.

## Error Handling and Invariants

- On `detached -> attached`:
  - normalize rotation to board basis.
- On `attached -> detached`:
  - freeze current world angle.
- Forbid applying board transform in blind-zone layer.
- Forbid mixed transform helpers in same call chain.
- Enforce helper boundaries by module separation:
  - `tableSpace.ts`: table-only helpers,
  - `boardSpace.ts`: board-only helpers,
  - interaction entrypoint converts `screen -> tableWorld` first, then optional board projection.

## Test Plan

Required regressions:

1. Rotate board by 90deg: grid + highlight + hit-test remain aligned.
2. Detached unit does not move/rotate when board rotates.
3. Attached unit follows board rotation.
4. Detached -> attached drop snaps both hex position and board-basis rotation.
5. Blind zones stay fixed under repeated board rotations.

## Complexity Assessment

Medium complexity. Main risk is mixed coordinate usage. Strict transform boundaries remove most recurring regressions.

