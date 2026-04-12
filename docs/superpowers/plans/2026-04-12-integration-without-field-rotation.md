# Integration Without Field Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge all recent feature work (scenarios, ping/cursor, and related changes) into one integration branch while removing only runtime field-rotation behavior.

**Architecture:** Build a clean integration branch in three layers (baseline features, scenario pack, remove-field-rotation). Resolve overlapping files in a fixed order and validate each layer with build + multiplayer preview smoke checks before continuing.

**Tech Stack:** Git worktrees/branches, TypeScript, Vite build/preview, existing multiplayer preview (`preview:mp`).

---

## File Structure

- Modify (integration targets, as needed by layers): `src/main.ts`, `src/renderer.ts`, `src/style.css`, `src/appMoreMenu.ts`, `src/multiplayer/boardState.ts`, `src/scenarios/**`, `src/renderConfig.ts`, `src/boardDragSfx.ts`.
- Create/Update docs: `docs/superpowers/plans/2026-04-12-integration-without-field-rotation.md` (execution checklist updates), optional integration notes file if needed.
- No unrelated refactors; only merge/conflict resolution and field-rotation removal edits.

---

### Task 1: Source Inventory and Safety Snapshots

**Files:**
- Modify: git history/state only (no code edits expected)

- [x] **Step 1: Collect source-of-truth inventory**

Run:
```bash
git worktree list
git status --short
git -C ".worktrees/scenarios-system" status --short
git log --oneline -n 30
git -C ".worktrees/scenarios-system" log --oneline -n 30
```

Expected:
- Clear list of where baseline/ping/scenario changes currently live.

- [x] **Step 2: Create backup branch pointers before integration**

Run:
```bash
git switch -c backup/main-before-integration
git switch main
git -C ".worktrees/scenarios-system" switch -c backup/scenarios-before-integration
git -C ".worktrees/scenarios-system" switch feat/scenarios-system
```

Expected:
- Recoverable branch refs for both source states.

- [x] **Step 3: Commit safety checkpoints for dirty trees (if needed)**

Run:
```bash
git add -A
git commit -m "wip: snapshot main state before layered integration"
git -C ".worktrees/scenarios-system" add -A
git -C ".worktrees/scenarios-system" commit -m "wip: snapshot scenarios state before layered integration"
```

Expected:
- No uncommitted source changes before transfer work begins.

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-12-integration-without-field-rotation.md
git commit -m "docs: start layered integration execution checklist"
```

---

### Task 2: Create Integration Branch and Apply Layer 1 (Baseline Feature Pack)

**Files:**
- Modify: integration branch workspace files affected by baseline pack

- [ ] **Step 1: Create clean integration branch from main**

Run:
```bash
git switch main
git switch -c integration/stable-all
```

Expected:
- Integration branch starts from known base.

- [ ] **Step 2: Apply baseline non-scenario changes**

Preferred operation:
```bash
# Example: cherry-pick known baseline commits if separated
git cherry-pick <sha-baseline-1> <sha-baseline-2>
```

Fallback (if baseline exists only as WIP commit):
```bash
git cherry-pick <wip-baseline-sha>
```

Expected:
- Ping/cursor/general baseline features present; scenario pack not fully applied yet.

- [ ] **Step 3: Gate L1 verification**

Run:
```bash
npm run build
npm run preview:mp
```

Manual smoke:
- Ping works.
- Cursor/input interactions unchanged.

Expected:
- Build passes, preview:mp starts, baseline smoke passes.

- [ ] **Step 4: Commit Layer 1**

```bash
git add -A
git commit -m "feat(integration): apply layer 1 baseline feature pack"
```

---

### Task 3: Apply Layer 2 (Scenario Pack Maximal)

**Files:**
- Modify: `src/scenarios/**`, `src/main.ts`, `src/appMoreMenu.ts`, `src/style.css`, `src/multiplayer/boardState.ts`, other scenario integration touchpoints

- [ ] **Step 1: Transfer scenario pack from scenarios source**

Preferred operation:
```bash
# If scenario changes are committed as one or more commits:
git cherry-pick <sha-scenarios-1> <sha-scenarios-2> ...
```

Fallback operation (file-scoped checkout):
```bash
git checkout feat/scenarios-system -- src/scenarios src/appMoreMenu.ts src/main.ts src/style.css src/multiplayer/boardState.ts src/renderConfig.ts
```

Expected:
- Scenario system appears in integration branch.

- [ ] **Step 2: Resolve overlap files with fixed precedence**

Rule:
1. Keep Layer 1 baseline behavior.
2. Apply scenario functionality on top.
3. Do not do cleanup/refactor during conflict resolution.

Run:
```bash
git status
git diff --name-only --diff-filter=U
```

Resolve only conflicting hunks; stage resolved files.

- [ ] **Step 3: Gate L2 verification**

Run:
```bash
npx tsx --test src/scenarios/*.test.ts
npm run build
npm run preview:mp
```

Manual smoke:
- Scenario panel opens.
- Scenario apply/import/export works.
- Ping/cursor still works.

Expected:
- Scenario suite green; build and preview:mp green.

- [ ] **Step 4: Commit Layer 2**

```bash
git add -A
git commit -m "feat(integration): apply layer 2 maximal scenario pack"
```

---

### Task 4: Apply Layer 3 (Remove Field Rotation Behavior Only)

**Files:**
- Modify: `src/main.ts`, `src/renderer.ts`, `src/renderConfig.ts`, `src/scenarios/rotationModel.ts`, related orientation tests as needed

- [ ] **Step 1: Write/adjust failing tests for no-field-rotation expectation**

Run/update tests in:
- `src/scenarios/orientation.test.ts`
- `src/scenarios/apply.test.ts`

Target expectation:
- Scenario orientation does not apply runtime field rotation behavior.
- Content and baseline features remain intact.

- [ ] **Step 2: Remove only field-rotation runtime behavior**

Use focused patching:
```bash
git restore -p --source=HEAD~1 -- src/main.ts src/renderer.ts src/renderConfig.ts src/scenarios/rotationModel.ts
```

Or edit directly with strict scope:
- keep scenario system
- keep ping/cursor
- remove only runtime field rotation path

- [ ] **Step 3: Gate L3 verification**

Run:
```bash
npx tsx --test src/scenarios/*.test.ts
npm run build
npm run preview:mp
```

Manual smoke:
- Scenarios still usable.
- Ping/cursor still usable.
- No undesired field rotation behavior remains.
- MP scenario apply still syncs.

- [ ] **Step 4: Commit Layer 3**

```bash
git add -A
git commit -m "fix(integration): remove field rotation behavior while preserving scenarios and baseline features"
```

---

### Task 5: Final Integrity Pass and Merge Readiness

**Files:**
- Modify: docs only if behavior deltas discovered

- [ ] **Step 1: Final verification bundle**

Run:
```bash
npx tsx --test src/scenarios/*.test.ts
npm run build
```

Expected:
- Tests and build are clean.

- [ ] **Step 2: Final manual MP smoke**

Checklist:
1. Open two clients via preview:mp.
2. Validate ping works cross-client.
3. Validate scenario apply sync works cross-client.
4. Validate no runtime field rotation behavior.

Expected:
- All acceptance checks pass.

- [ ] **Step 3: Final integration commit**

```bash
git add -A
git commit -m "chore(integration): finalize unified build with scenarios and pings, without field rotation"
```

---

## Self-Review

### 1) Spec coverage

- Preserve maximum changes: Tasks 2 and 3.
- Remove only field rotation: Task 4.
- Layered process + gates: Tasks 2-5.
- Risk reduction via backups/inventory: Task 1.

No uncovered requirement found.

### 2) Placeholder scan

- No TODO/TBD placeholders; each task includes commands and expected checks.

### 3) Type/process consistency

- Layer sequence L1 -> L2 -> L3 is consistent.
- Verification commands are repeated consistently at each gate.

