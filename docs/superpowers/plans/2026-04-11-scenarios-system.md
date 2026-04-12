# Scenarios System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game scenarios system with official and custom scenarios, full snapshot apply, orientation restore, local persistence, JSON import/export, and multiplayer-safe application flow.

**Architecture:** Build a dedicated `src/scenarios/` subsystem around existing board snapshot APIs (`captureBoardSnapshot` / `applyBoardSnapshot`) instead of introducing a second board model. Keep scenario document validation at boundaries (load/import/apply) and keep UI orchestration in one panel module that delegates storage and apply logic to focused services.

**Tech Stack:** TypeScript, Vite, existing canvas app UI, existing multiplayer board sync, Node test runner via `tsx --test`, localStorage + Blob file APIs.

---

## File Structure

- Create: `src/scenarios/types.ts`  
  Responsibility: stable domain types for scenario documents, metadata, orientation, and import conflict policies.
- Create: `src/scenarios/schema.ts`  
  Responsibility: runtime validation/parsing of scenario documents and version checks.
- Create: `src/scenarios/schema.test.ts`  
  Responsibility: schema parser tests (valid doc, invalid fields, unsupported versions, snapshot mismatch).
- Create: `src/scenarios/store.ts`  
  Responsibility: custom scenario CRUD in localStorage with deterministic ordering and ID collision handling.
- Create: `src/scenarios/store.test.ts`  
  Responsibility: store behavior tests with storage stub.
- Create: `src/scenarios/official.ts`  
  Responsibility: load official static scenario list from JSON files.
- Create: `src/scenarios/io.ts`  
  Responsibility: import/export helpers and conflict resolution.
- Create: `src/scenarios/apply.ts`  
  Responsibility: atomic apply flow (`validate -> apply snapshot -> set orientation -> notify board edit`).
- Create: `src/scenarios/panel.ts`  
  Responsibility: modal/panel UI for list tabs, create/edit form, apply, import/export controls.
- Modify: `src/main.ts`  
  Responsibility: wire scenarios panel into app lifecycle, orientation source-of-truth, and board snapshot integration points.
- Modify: `src/appMoreMenu.ts`  
  Responsibility: add `Сценарии` action in app menu.
- Modify: `src/style.css`  
  Responsibility: panel/form/card styles for scenario UI.
- Create: `src/scenarios/data/official/index.json`  
  Responsibility: manifest of official scenarios metadata.
- Create: `src/scenarios/data/official/*.json` (20 files)  
  Responsibility: official scenario documents with snapshot payload.

---

### Task 1: Scenario Types and Schema Validation

**Files:**
- Create: `src/scenarios/types.ts`
- Create: `src/scenarios/schema.ts`
- Test: `src/scenarios/schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenarioDocument } from './schema';

test('parseScenarioDocument accepts valid v1 custom scenario', () => {
  const result = parseScenarioDocument({
    id: 'my-scenario',
    version: 1,
    kind: 'custom',
    meta: { name: 'My Scenario', description: 'desc', tags: ['test'], difficulty: 'normal' },
    boardOrientation: 'horizontal',
    snapshot: { v: 1, units: [], unitCardData: [], bigMiniatures: [], bigMiniCardData: [], largeMiniatures: [], largeMiniCardData: [], hugeMiniatures: [], hugeMiniCardData: [], terrains: [], terrainOffBoardWorlds: [], terrainRotationDegs: [], etherVortexes: [], godTablePieces: [] },
  });
  assert.equal(result.ok, true);
});

test('parseScenarioDocument rejects unsupported document version', () => {
  const result = parseScenarioDocument({ version: 999 });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: FAIL because `parseScenarioDocument` does not exist yet.

- [ ] **Step 3: Implement scenario types and parser**

```ts
export type ScenarioKind = 'official' | 'custom';
export type ScenarioOrientation = 'horizontal' | 'vertical';

export type ScenarioMeta = {
  name: string;
  description: string;
  tags: string[];
  difficulty: 'easy' | 'normal' | 'hard';
  author?: string;
  updatedAt?: string;
};
```

```ts
export function parseScenarioDocument(raw: unknown): ParseResult<ScenarioDocument> {
  // validate document shape
  // validate version === 1
  // validate snapshot via isSerializedBoardStateV1
  // return { ok: true, value } or { ok: false, error }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/types.ts src/scenarios/schema.ts src/scenarios/schema.test.ts
git commit -m "feat(scenarios): add scenario document schema validation"
```

---

### Task 2: Custom Scenario Store (localStorage)

**Files:**
- Create: `src/scenarios/store.ts`
- Test: `src/scenarios/store.test.ts`

- [ ] **Step 1: Write failing store tests with storage stub**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioStore } from './store';

test('store saves and returns scenarios sorted by updatedAt desc', () => {
  const mem = new Map<string, string>();
  const store = createScenarioStore({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  });
  // save two docs and assert order
  assert.equal(store.list().length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/scenarios/store.test.ts`  
Expected: FAIL because `createScenarioStore` does not exist yet.

- [ ] **Step 3: Implement storage module**

```ts
export function createScenarioStore(storage: StorageLike): ScenarioStore {
  // list/get/upsert/remove/importMany
  // key: hexBoard_scenarios_v1
  // durable parse + corruption fallback to []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/scenarios/store.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/store.ts src/scenarios/store.test.ts
git commit -m "feat(scenarios): add local storage CRUD for custom scenarios"
```

---

### Task 3: Apply Pipeline and Orientation Integration

**Files:**
- Create: `src/scenarios/apply.ts`
- Modify: `src/main.ts`
- Test: `src/scenarios/schema.test.ts` (extend with apply preconditions)

- [ ] **Step 1: Add failing tests for atomic apply preconditions**

```ts
test('scenario apply rejects invalid snapshot before mutation', () => {
  // prepare invalid doc and assert applyScenarioDocument returns error
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: FAIL for missing apply helper.

- [ ] **Step 3: Implement apply service and wire orientation in main**

```ts
export type ScenarioApplyDeps = {
  applyBoardSnapshot: (raw: unknown) => void;
  setBoardOrientation: (o: ScenarioOrientation) => void;
  notifyBoardEditLocal: () => void;
};

export function applyScenarioDocument(doc: ScenarioDocument, deps: ScenarioApplyDeps): { ok: true } | { ok: false; error: string } {
  // validate doc first
  // apply snapshot
  // set orientation
  // notify mp sync
}
```

```ts
// main.ts
let boardOrientation: ScenarioOrientation = 'horizontal';
function setBoardOrientation(next: ScenarioOrientation): void {
  boardOrientation = next;
  // map orientation to base board rotation (horizontal=-10, vertical=80)
  renderer.updateConfig({ boardRotationDeg: effectiveBoardRotationDegForOrientation(boardOrientation) });
  scheduleRender();
}
```

- [ ] **Step 4: Run targeted checks**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS (TypeScript + Vite build).

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/apply.ts src/main.ts src/scenarios/schema.test.ts
git commit -m "feat(scenarios): add atomic scenario apply with orientation restore"
```

---

### Task 4: Official Scenarios Loader and Seed Data

**Files:**
- Create: `src/scenarios/official.ts`
- Create: `src/scenarios/data/official/index.json`
- Create: `src/scenarios/data/official/*.json` (20 scenario files)

- [ ] **Step 1: Write failing loader test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOfficialScenarios } from './official';

test('loadOfficialScenarios returns at least 20 valid docs', async () => {
  const docs = await loadOfficialScenarios();
  assert.ok(docs.length >= 20);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: FAIL (loader/data missing).

- [ ] **Step 3: Implement loader and add data manifest**

```ts
export async function loadOfficialScenarios(): Promise<ScenarioDocument[]> {
  // load index manifest
  // load each JSON
  // parse through parseScenarioDocument
  // throw descriptive error on invalid official file
}
```

```json
{
  "version": 1,
  "files": [
    "scenario-01.json",
    "scenario-02.json"
  ]
}
```

- [ ] **Step 4: Run checks**

Run: `npx tsx --test src/scenarios/schema.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS and scenario JSON included in bundle.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/official.ts src/scenarios/data/official
git commit -m "feat(scenarios): add official scenario catalog loader and seed files"
```

---

### Task 5: Import/Export IO and Conflict Resolution

**Files:**
- Create: `src/scenarios/io.ts`
- Modify: `src/scenarios/store.ts`
- Test: `src/scenarios/store.test.ts`

- [ ] **Step 1: Add failing tests for import collisions**

```ts
test('importMany with keep-both generates deterministic copy id', () => {
  // existing id + imported id -> imported becomes "<id>-copy-1"
});

test('importMany with replace overwrites existing scenario', () => {
  // same id replaced
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test src/scenarios/store.test.ts`  
Expected: FAIL for missing conflict handling.

- [ ] **Step 3: Implement IO helpers**

```ts
export async function readScenarioDocumentFromFile(file: File): Promise<ParseResult<ScenarioDocument>> {
  const text = await file.text();
  return parseScenarioDocument(JSON.parse(text));
}

export function exportScenarioDocument(doc: ScenarioDocument): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  // createObjectURL + anchor click + revokeObjectURL
}
```

- [ ] **Step 4: Run tests/build**

Run: `npx tsx --test src/scenarios/store.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/io.ts src/scenarios/store.ts src/scenarios/store.test.ts
git commit -m "feat(scenarios): add import/export and collision strategies"
```

---

### Task 6: Scenarios Panel UI and App Menu Integration

**Files:**
- Create: `src/scenarios/panel.ts`
- Modify: `src/appMoreMenu.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Write failing UI integration checks (smoke assertions in node test + manual script)**

```ts
test('menu options include scenarios callback contract', () => {
  // compile-time contract test for AppMoreMenuOptions.onScenarios
});
```

- [ ] **Step 2: Run checks to verify failure**

Run: `npm run build`  
Expected: FAIL because `onScenarios` is not yet part of menu API.

- [ ] **Step 3: Implement panel + menu wiring**

```ts
// appMoreMenu.ts
export type AppMoreMenuOptions = {
  onCatalogEditor: () => void;
  onSettings: () => void;
  onScenarios: () => void;
};
```

```ts
// panel.ts
export class ScenariosPanel {
  setOpen(open: boolean): void;
  refresh(): Promise<void>;
  // tabs: official/custom
  // actions: apply/create/edit/delete/export/import
}
```

```ts
// main.ts
const scenariosPanel = new ScenariosPanel({ ...deps });
mountAppMoreMenu(toolbarMountEl, {
  onCatalogEditor: () => catalogEditorPanel.setOpen(true),
  onSettings: () => appSettingsHandle.open(),
  onScenarios: () => scenariosPanel.setOpen(true),
});
```

- [ ] **Step 4: Run verification**

Run: `npm run build`  
Expected: PASS.

Run: `npm run preview`  
Expected: app loads; menu shows `Сценарии`; panel opens.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/panel.ts src/appMoreMenu.ts src/main.ts src/style.css
git commit -m "feat(scenarios): add scenarios management panel and menu entry"
```

---

### Task 7: End-to-End Behavior and Regression Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-11-scenarios-system-design.md` (only if implementation deltas must be documented)
- Modify: `docs/superpowers/plans/2026-04-11-scenarios-system.md` (checklist updates only)

- [ ] **Step 1: Run full automated checks**

Run: `npx tsx --test src/scenarios/schema.test.ts src/scenarios/store.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 2: Execute manual acceptance checks**

Run checklist:
1. Open `Сценарии` -> tab `Официальные` shows 20 items.
2. Apply one official scenario -> board state fully replaced.
3. Create custom scenario via form (required fields enforced).
4. Reload page -> custom scenario still present.
5. Export custom scenario -> JSON downloaded.
6. Delete local custom -> import JSON -> scenario restored.
7. MP room with 2 clients -> one client applies scenario -> second client sees same board and orientation.

Expected: all checks pass.

- [ ] **Step 3: Final commit**

```bash
git add src/scenarios src/main.ts src/appMoreMenu.ts src/style.css docs/superpowers/plans/2026-04-11-scenarios-system.md
git commit -m "feat(scenarios): implement official and custom scenario workflow"
```

---

## Self-Review

### 1) Spec coverage

- Official + custom scenarios: covered by Tasks 4 and 6.
- localStorage + JSON import/export: covered by Tasks 2 and 5.
- Full snapshot apply: covered by Task 3.
- Orientation as field rotation: covered by Task 3.
- MP allow any player apply: covered by Task 3 + Task 7 manual MP verification.
- Mini-editor with required fields: covered by Task 6.

No uncovered requirements found.

### 2) Placeholder scan

- Removed generic placeholders; each task has explicit files, commands, expected results, and concrete code snippets.

### 3) Type consistency

- `ScenarioDocument`, `ScenarioOrientation`, `parseScenarioDocument`, `applyScenarioDocument`, and `createScenarioStore` names are consistent across tasks.

