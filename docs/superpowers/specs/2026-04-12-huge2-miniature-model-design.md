# Huge2 Miniature Model For Siege Golem

**Date:** 2026-04-12  
**Status:** approved by user in brainstorming session

## Context

Current miniature sizes in the client model:

- `small` (single hex);
- `large` (3-hex triangle);
- `big` (single hexon);
- `huge` (3-hexon triangle).

The unit `engeln-siege_golem` is currently modeled as `huge` (3 hexons), but gameplay requires a distinct colossal class that occupies **2 adjacent hexons**.  
The requirement is to introduce this as a first-class model size (`huge2`) and avoid regressions in existing sizes and saved boards.

## Confirmed Requirements

1. Add a new miniature size `huge2` as a standalone model type.
2. `huge2` footprint is exactly 2 adjacent hexon centers with 60-degree rotations.
3. `engeln-siege_golem` must use `huge2` instead of `huge`.
4. Old saves must auto-migrate siege golem placements from `huge` to `huge2` on load.
5. Existing sizes (`small`, `large`, `big`, `huge`) must keep behavior unchanged.

## Approaches Considered

### A) Full first-class `huge2` model (chosen)

Introduce `huge2` across type system, geometry, main board state, rendering, and serialization as an independent path.

### B) Keep `huge`, add per-unit special-case for siege golem

Map only siege golem to a 2-hexon footprint at runtime while preserving `size = "huge"`.

### C) Hybrid temporary proxy

Expose `huge2` in data but route most behavior through existing `huge` code with runtime conditionals.

### Why A is chosen

- clear and scalable model boundary for future `huge2` units;
- no hidden unit-id magic in core placement/renderer logic;
- lower long-term regression risk than condition-heavy special cases.

## Type System

- Extend `UnitSize` in `unitCard` to include `huge2`.
- Update all `UnitCardData['size']` validation/selectors/sorts to include `huge2`.
- Default distance unit rules treat `huge2` as hexon-based (same default bucket as `big` and `huge`) for:
  - movement (`walk`/`run`) labels;
  - attack-range icon default when attack does not override its unit;
  - grab-range icon default when card does not override `grabRangeUnit`.

## Geometry Layer

- Add dedicated `hex.ts` helpers for `huge2`:
  - hexon centers for 2-cell footprint at arbitrary 60-degree orientation;
  - all covered small hex cells derived from those centers (for overlap/hit tests where needed).
- Keep current `huge` geometry untouched.

### Canonical `huge2` anchor and rotation contract

`huge2` uses the same canonical rotation lattice as other miniatures: `rotationDeg` normalized to `{0,60,120,180,240,300}`.

Footprint derivation is deterministic:

1. First hexon center is `anchor`.
2. Second hexon center is the axial neighbor of `anchor` in direction `steps = rotationDeg / 60` (clockwise, using `Hex.directions[steps]`).

This contract is used identically in runtime placement checks, renderer shape derivation, and snapshot load/save so a saved `anchor + rotationDeg` always recreates the same 2-hexon footprint.

## Main Runtime State

- Add separate runtime collections and selection/drag indices for `huge2` miniatures and their card data.
- Add `huge2` branches in:
  - spawn from army panel/catalog;
  - placement legality checks;
  - movement/attack preview source resolution;
  - rotation/drag/drop flow;
  - clipboard copy/paste and delete paths;
  - selection + floating card resolution.
- Keep `huge` path unchanged.

## Renderer

- Add renderer state/setters for `huge2` anchors, rotations, health, sprites, effects, and preview.
- Add `huge2` draw path and footprint contour based on 2 hexons.
- Ensure selection ring, health badge, activation dot, and effect marker placement are computed from `huge2` bounds, not reused blindly from `huge`.

## Multiplayer + Serialization

- Extend board snapshot model with `huge2Miniatures` + `huge2MiniCardData`.
- Keep backward compatibility: old snapshots without `huge2` remain valid.
- Extend drag kind protocol and parsing for `huge2` where drag sync is used.

### Snapshot shape for `huge2`

`huge2Miniatures` entry schema mirrors `SerializedHugeMini` unless a field is proven unnecessary. Required/optional fields:

- `anchor`, `boardInstanceId`, `offBoardWorld`,
- `walk`, `run`, `rotationDeg`, `health`, `activated`,
- `effectMarkers`,
- `spawnedFromArmyPanel`, `catalogUnitId`, `rosterLeaderId`, `armyOwnerPlayerSlot`, `broomgarHungerPhase`,
- `spriteOffsetLocal`, `spriteRotationDeg` (same semantics as existing huge sprite alignment fields).

`huge2MiniCardData[i]` is the card paired with `huge2Miniatures[i]` by index, exactly like existing `huge` arrays.

### Multiplayer compatibility policy

- Requirement for this rollout: all peers in a room run the same client build that understands `huge2`.
- Server/client parsing is extended to accept `huge2` drag kind and `huge2` snapshot arrays.
- If an endpoint does not understand `huge2` payload fields, it must fail fast (validation error) instead of silently dropping these fields.

## Data Model Changes

- Update `src/catalog/units/engeln-siege_golem.json`: `card.size = "huge2"`.
- Ensure editor quick-stats and size dropdowns support `huge2`.
- Use explicit roster sort order for rank comparisons: `small < large < big < huge < huge2`.

## Migration Plan (Auto-Migrate Old Saves)

On board load:

1. Detect legacy siege golem entries living in `hugeMiniatures` / `hugeMiniCardData` with `catalogUnitId = "engeln-siege_golem"`.
2. Migration is index-paired: each moved `hugeMiniatures[i]` must move together with `hugeMiniCardData[i]`.
3. Move each matching pair into `huge2` collections preserving:
   - anchor/off-board position,
   - rotation,
   - walk/run/health/activated,
   - effect markers,
   - roster metadata (`spawnedFromArmyPanel`, `rosterLeaderId`, `armyOwnerPlayerSlot`, etc.),
   - sprite offset/rotation where applicable.
4. Remove migrated entries from `huge` arrays using the same indices.
5. Keep migration idempotent (reloading an already-migrated state makes no additional changes).
6. If lengths are mismatched or a pair is malformed, skip migration for that index and emit warning telemetry/log; never drop the entry.

## Data Flow

### New Placement (`huge2`)

1. User drags a `huge2` unit from roster.
2. Placement resolver computes best `huge2` anchor/rotation from pointer.
3. Placement validator checks `huge2` footprint collisions.
4. On success, runtime adds entry into `huge2Miniatures` + `huge2MiniCardData`.
5. Renderer updates via new `huge2` setters.

### Legacy Load With Siege Golem

1. Snapshot is parsed.
2. Migration step scans legacy `huge` entries for siege golem catalog id.
3. Matched entries are moved to `huge2`.
4. Runtime continues with normalized state and renders siege golem as 2-hexon miniature.

## Error Handling and Safety

- If migration finds malformed pair (array length mismatch, missing paired card, invalid anchor payload), keep item in original `huge` collection and log a warning (do not drop data).
- If optional sprite alignment fields are absent, fallback to defaults as currently done for huge.
- Serialization validators must reject structurally invalid `huge2` entries but continue to accept legacy snapshots without `huge2`.
- Validation checklist must include all parse/guard paths that currently validate `huge` arrays (`main` snapshot load, scenario I/O tests, official API payload validation).

## Testing Plan

## Unit

- `hex.ts`: verify `huge2` oriented centers and covered cells across all 6 rotations.
- board-state migration: legacy siege golem in `huge` is migrated to `huge2`.
- migration idempotency: second normalization pass produces no further changes.
- size validation/UI lists accept `huge2`.
- snapshot parser accepts `huge2` arrays and rejects malformed `huge2` entries.
- protocol parser accepts `tableDrag.kind = "huge2"` where drag sync is validated.

## Integration

- Spawn siege golem from army panel -> appears as `huge2` footprint.
- Drag/rotate/drop siege golem keeps legal placement logic consistent.
- Save + load board preserves `huge2` state and metadata.
- snapshot round-trip preserves `huge2Miniatures` and `huge2MiniCardData` index pairing.

## Non-Regression Smoke

- Existing `small`, `large`, `big`, `huge` placement and selection still work.
- Huge (3-hexon) rendering and interactions unchanged.
- Multiplayer drag/state sync still works with mixed sizes (`small + huge + huge2` in one board state).

## Scope

1. First-class `huge2` model and runtime paths.
2. Siege golem catalog migration to `huge2`.
3. Auto-migration from legacy `huge` siege golem saves.
4. Tests for geometry, migration, and validation.

## Out Of Scope

- Rebalancing stats of siege golem.
- Introducing additional `huge2` units beyond siege golem in this task.
- Visual redesign of miniature art assets.
