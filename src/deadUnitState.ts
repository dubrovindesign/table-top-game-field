export type PlayerSlot = 0 | 1;

export type DeadEntry = {
  boardInstanceId: string;
  scoredPoints: number;
  /** Per-zone index, 0..length-1 contiguous after valid transitions. */
  order: number;
};

export type DeadByZone = [DeadEntry[], DeadEntry[]];

export function normalizeScoredPoints(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * Roster override points first, then raw catalog points, then 0 with a console warning.
 * Pass `undefined` when that source is not available (caller decides).
 * Optional `boardInstanceId` is included in the fallback warning for debugging.
 */
export function resolveDeadZoneScoredPoints(
  rosterPoints: number | undefined,
  catalogPoints: number | undefined,
  boardInstanceId?: string,
): { scoredPoints: number; warned: boolean } {
  if (rosterPoints !== undefined && Number.isFinite(rosterPoints)) {
    return { scoredPoints: normalizeScoredPoints(rosterPoints), warned: false };
  }
  if (catalogPoints !== undefined && Number.isFinite(catalogPoints)) {
    return { scoredPoints: normalizeScoredPoints(catalogPoints), warned: false };
  }
  const ctx =
    boardInstanceId !== undefined && boardInstanceId.length > 0
      ? ` boardInstanceId=${boardInstanceId}`
      : '';
  console.warn(`[dead zone] missing roster/catalog points; scored as 0${ctx}`);
  return { scoredPoints: 0, warned: true };
}

/**
 * True if proposed big-mini footprint collides with a small unit or another big mini.
 * Caller must ensure footprint cells are on-grid. `excludeBigIndex` skips one big (restore self).
 */
export function bigMiniRestorePlacementCollides(
  footprintCellKeys: readonly string[],
  unitOccupiedKeys: ReadonlySet<string>,
  otherBigHexonFootprints: ReadonlyArray<ReadonlySet<string>>,
  excludeBigIndex: number,
): boolean {
  for (const k of footprintCellKeys) {
    if (unitOccupiedKeys.has(k)) return true;
  }
  for (let i = 0; i < otherBigHexonFootprints.length; i++) {
    if (i === excludeBigIndex) continue;
    const fp = otherBigHexonFootprints[i]!;
    if (footprintCellKeys.some((k) => fp.has(k))) return true;
  }
  return false;
}

function isValidBoardInstanceId(id: string): boolean {
  return id.length > 0;
}

function renumberZoneContiguous(zone: readonly DeadEntry[]): DeadEntry[] {
  return zone.map((e, i) => ({ ...e, order: i }));
}

export function deadScoreTotal(entries: readonly DeadEntry[]): number {
  let t = 0;
  for (const e of entries) t += normalizeScoredPoints(e.scoredPoints);
  return t;
}

export function normalizeDeadByZone(raw: DeadByZone): DeadByZone {
  const seen = new Set<string>();
  const out0: DeadEntry[] = [];
  const out1: DeadEntry[] = [];

  const take = (slot: PlayerSlot, e: DeadEntry) => {
    const id = e.boardInstanceId;
    if (!isValidBoardInstanceId(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    const row: DeadEntry = {
      boardInstanceId: id,
      scoredPoints: normalizeScoredPoints(e.scoredPoints),
      order: slot === 0 ? out0.length : out1.length,
    };
    if (slot === 0) out0.push(row);
    else out1.push(row);
  };

  for (const e of raw[0]) take(0, e);
  for (const e of raw[1]) take(1, e);

  return [out0, out1];
}

/** Remove any existing id from both zones, then append into `slot` (add-or-move). */
export function upsertDeadEntry(
  state: DeadByZone,
  slot: PlayerSlot,
  entry: { boardInstanceId: string; scoredPoints: number },
): DeadByZone {
  const cleared = removeDeadEntry(state, entry.boardInstanceId);
  return addDeadEntry(cleared, slot, entry);
}

export function addDeadEntry(
  state: DeadByZone,
  slot: PlayerSlot,
  entry: { boardInstanceId: string; scoredPoints: number },
): DeadByZone {
  const id = entry.boardInstanceId;
  if (!isValidBoardInstanceId(id)) return state;
  if (state[slot].some((e) => e.boardInstanceId === id)) return state;
  const other: PlayerSlot = slot === 0 ? 1 : 0;
  if (state[other].some((e) => e.boardInstanceId === id)) return state;
  const row: DeadEntry = {
    boardInstanceId: id,
    scoredPoints: normalizeScoredPoints(entry.scoredPoints),
    order: state[slot].length,
  };
  if (slot === 0) return [[...state[0], row], state[1]];
  return [state[0], [...state[1], row]];
}

export function removeDeadEntry(state: DeadByZone, boardInstanceId: string): DeadByZone {
  const next0 = state[0].filter((e) => e.boardInstanceId !== boardInstanceId);
  const next1 = state[1].filter((e) => e.boardInstanceId !== boardInstanceId);
  if (next0.length === state[0].length && next1.length === state[1].length) return state;
  return [renumberZoneContiguous(next0), renumberZoneContiguous(next1)];
}

/**
 * Dead-to-board restore: only remove the entry when placement is legal.
 * If `isLegal` is false, returns `state` unchanged (same reference).
 */
export function commitDeadRestoreIfLegal(
  state: DeadByZone,
  boardInstanceId: string,
  isLegal: boolean,
): DeadByZone {
  if (!isLegal) return state;
  return removeDeadEntry(state, boardInstanceId);
}

export function moveDeadEntryBetweenZones(
  state: DeadByZone,
  boardInstanceId: string,
  targetSlot: PlayerSlot,
): DeadByZone {
  const i0 = state[0].findIndex((e) => e.boardInstanceId === boardInstanceId);
  const i1 = state[1].findIndex((e) => e.boardInstanceId === boardInstanceId);
  if (i0 < 0 && i1 < 0) return state;

  const fromSlot: PlayerSlot = i0 >= 0 ? 0 : 1;
  if (fromSlot === targetSlot) return state;

  const idx = fromSlot === 0 ? i0 : i1;
  const entry = fromSlot === 0 ? state[0][idx]! : state[1][idx]!;

  const next0 =
    fromSlot === 0 ? state[0].filter((_, i) => i !== idx) : [...state[0]];
  const next1 =
    fromSlot === 1 ? state[1].filter((_, i) => i !== idx) : [...state[1]];

  const pts = normalizeScoredPoints(entry.scoredPoints);
  const id = entry.boardInstanceId;
  const moved: DeadEntry = {
    boardInstanceId: id,
    scoredPoints: pts,
    order: targetSlot === 0 ? next0.length : next1.length,
  };

  if (targetSlot === 0) {
    return [renumberZoneContiguous([...next0, moved]), renumberZoneContiguous(next1)];
  }
  return [renumberZoneContiguous(next0), renumberZoneContiguous([...next1, moved])];
}

// ── 3-way CRDT merge for remote apply ────────────────────────

/**
 * 3-way merge of dead-zone state for the multiplayer last-writer-wins tick.
 *
 * Inputs:
 *   - baseline: keys of the PREVIOUS remote snapshot we applied (per slot).
 *     This is what the remote peer is known to have seen last.
 *   - incoming: the new remote snapshot being applied.
 *   - local: our current local state (may contain edits the remote hasn't seen).
 *
 * Per-entry rule (by boardInstanceId):
 *   - If the entry changed locally vs. baseline (added, removed, or moved slots),
 *     the local change wins — otherwise a stale remote snapshot would revert
 *     the player's just-made action.
 *   - Otherwise follow incoming (remote-only change, or no change).
 *
 * Conflict (both sides edited the same entry differently):
 *   - Local wins, same reason — the user's immediate action should not flicker.
 *
 * Output:
 *   - merged: resulting DeadByZone with contiguous `order`.
 *   - diverged: true when `merged` differs in keys/order from `incoming`
 *     (signals the caller to push the merged state back so peers converge).
 *
 * Entries whose `boardInstanceId` is not in `allowed` are dropped with no warning
 * (the caller filters those separately when it also wants to log).
 */
export function mergeDeadByZoneThreeWay(args: {
  baseline: readonly [ReadonlySet<string>, ReadonlySet<string>];
  incoming: DeadByZone;
  local: DeadByZone;
  allowed: ReadonlySet<string>;
}): { merged: DeadByZone; diverged: boolean } {
  const { baseline, incoming, local, allowed } = args;

  const incomingKeys0 = new Set(incoming[0].map((e) => e.boardInstanceId));
  const incomingKeys1 = new Set(incoming[1].map((e) => e.boardInstanceId));
  const localKeys0 = new Set(local[0].map((e) => e.boardInstanceId));
  const localKeys1 = new Set(local[1].map((e) => e.boardInstanceId));
  const baselineKeys0 = baseline[0];
  const baselineKeys1 = baseline[1];

  type Slot = 0 | 1 | null;
  const slotIn = (id: string, k0: ReadonlySet<string>, k1: ReadonlySet<string>): Slot =>
    k0.has(id) ? 0 : k1.has(id) ? 1 : null;

  const allIds = new Set<string>();
  for (const s of [baselineKeys0, baselineKeys1, incomingKeys0, incomingKeys1, localKeys0, localKeys1]) {
    for (const id of s) allIds.add(id);
  }

  const finalSlot = new Map<string, Slot>();
  for (const id of allIds) {
    const b = slotIn(id, baselineKeys0, baselineKeys1);
    const i = slotIn(id, incomingKeys0, incomingKeys1);
    const l = slotIn(id, localKeys0, localKeys1);
    const localChanged = l !== b;
    finalSlot.set(id, localChanged ? l : i);
  }

  const incomingDataById = new Map<string, DeadEntry>();
  for (const e of incoming[0]) incomingDataById.set(e.boardInstanceId, e);
  for (const e of incoming[1]) incomingDataById.set(e.boardInstanceId, e);
  const localDataById = new Map<string, DeadEntry>();
  for (const e of local[0]) localDataById.set(e.boardInstanceId, e);
  for (const e of local[1]) localDataById.set(e.boardInstanceId, e);

  const out0: DeadEntry[] = [];
  const out1: DeadEntry[] = [];
  const seen = new Set<string>();

  const pushIfBelongs = (id: string, scoredPoints: number): void => {
    if (!allowed.has(id)) return;
    if (seen.has(id)) return;
    const slot = finalSlot.get(id);
    if (slot === null || slot === undefined) return;
    seen.add(id);
    const target = slot === 0 ? out0 : out1;
    target.push({
      boardInstanceId: id,
      scoredPoints: normalizeScoredPoints(scoredPoints),
      order: target.length,
    });
  };

  // Phase 1: walk the incoming order and pull entries whose data should carry
  // over. Prefer local data (points may have been re-scored by a local rule
  // that the remote doesn't yet know about) when local has the same entry.
  for (const e of incoming[0]) {
    const slot = finalSlot.get(e.boardInstanceId);
    if (slot === null || slot === undefined) continue;
    const local = localDataById.get(e.boardInstanceId);
    pushIfBelongs(e.boardInstanceId, local?.scoredPoints ?? e.scoredPoints);
  }
  for (const e of incoming[1]) {
    const slot = finalSlot.get(e.boardInstanceId);
    if (slot === null || slot === undefined) continue;
    const local = localDataById.get(e.boardInstanceId);
    pushIfBelongs(e.boardInstanceId, local?.scoredPoints ?? e.scoredPoints);
  }
  // Phase 2: append local-only entries that didn't appear in incoming at all.
  for (const e of local[0]) pushIfBelongs(e.boardInstanceId, e.scoredPoints);
  for (const e of local[1]) pushIfBelongs(e.boardInstanceId, e.scoredPoints);

  const incomingOrderKeys0 = incoming[0].map((e) => e.boardInstanceId);
  const incomingOrderKeys1 = incoming[1].map((e) => e.boardInstanceId);
  const mergedOrderKeys0 = out0.map((e) => e.boardInstanceId);
  const mergedOrderKeys1 = out1.map((e) => e.boardInstanceId);
  const sameKeysAndOrder = (a: readonly string[], b: readonly string[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const diverged =
    !sameKeysAndOrder(mergedOrderKeys0, incomingOrderKeys0) ||
    !sameKeysAndOrder(mergedOrderKeys1, incomingOrderKeys1);

  return { merged: [out0, out1], diverged };
}

// ── Wounded scoring ──────────────────────────────────────────

export const KELLANTHRA_BIG_ID = 'keld-kellantra_lindwurm';
export const KELLANTHRA_SMALL_ID = 'keld-kellantra';
const KELLANTHRA_HALF_COST = 35;
const KELLANTHRA_BIG_WOUNDED_THRESHOLD = 4;

/** General wounded formula: half cost if HP below half maxHealth. */
export function woundedPointsForUnit(health: number, maxHealth: number, points: number): number {
  if (health <= 0) return 0;
  const threshold = Math.ceil(maxHealth / 2);
  return health < threshold ? Math.floor(points / 2) : 0;
}

/** Kellanthra big form: hardcoded threshold=4, cost=35. Returns null for non-Kellanthra. */
export function getKellanthraWoundedOverride(
  catalogUnitId: string | undefined,
  health: number,
): number | null {
  if (catalogUnitId !== KELLANTHRA_BIG_ID) return null;
  if (health <= 0) return 0;
  return health < KELLANTHRA_BIG_WOUNDED_THRESHOLD ? KELLANTHRA_HALF_COST : 0;
}

/** Override death scored points for Kellanthra forms. Returns undefined for normal units.
 *  For small Kellanthra, override only applies when big form is present (bigFormExists). */
export function kellanthraDeathPointsOverride(
  catalogUnitId: string | undefined,
  bigFormExists: boolean,
): number | undefined {
  if (catalogUnitId === KELLANTHRA_BIG_ID) return KELLANTHRA_HALF_COST;
  if (catalogUnitId === KELLANTHRA_SMALL_ID && bigFormExists) return KELLANTHRA_HALF_COST;
  return undefined;
}
