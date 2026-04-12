# Official Scenarios Edit Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit official scenarios (meta + board layout) from the client and publish changes globally with immediate server persistence and catalog sync.

**Architecture:** Keep `ScenarioDocument` as the canonical payload and add a server-side official catalog store with HTTP read/write APIs plus websocket invalidation events. Client scenario UI keeps one editor flow for official cards, captures current board snapshot on save, pushes full document via API, and refreshes catalog on realtime event or polling fallback.

**Tech Stack:** TypeScript, Node HTTP + `ws`, existing `roomServer.ts`, Vite client, existing scenarios subsystem, `tsx --test`.

---

## File Structure

- Create: `server/officialScenarioCatalog.ts`  
  Responsibility: seed/load/save/update official scenarios, feature flag gate, payload size guard, in-memory rate limiter.
- Modify: `server/roomServer.ts`  
  Responsibility: host HTTP `/api/scenarios/official` endpoints and broadcast catalog update events to connected sockets.
- Modify: `src/multiplayer/protocol.ts`  
  Responsibility: extend server->client message union with `officialScenariosUpdated`.
- Create: `src/scenarios/officialApi.ts`  
  Responsibility: client HTTP helpers (`GET list`, `GET by id`, `PUT update`) and API error normalization.
- Modify: `src/scenarios/official.ts`  
  Responsibility: split static seed loader from runtime loader and keep strict validator helpers reusable.
- Modify: `src/scenarios/panel.ts`  
  Responsibility: add official edit actions, dirty state, save flow, external-update warning confirm.
- Modify: `src/main.ts`  
  Responsibility: wire official catalog refresh into multiplayer socket events and polling fallback.
- Create: `tests/server/officialScenarioCatalog.test.ts`  
  Responsibility: storage + update validation tests (LWW, size, flag disabled).
- Modify: `tests/multiplayer/protocol.test.ts`  
  Responsibility: protocol parsing/typing assertions for new event shape.
- Modify: `package.json`  
  Responsibility: add test scripts for new server tests and combined protocol+catalog checks.

---

### Task 1: Server Catalog Core (seed + update rules)

**Files:**
- Create: `server/officialScenarioCatalog.ts`
- Test: `tests/server/officialScenarioCatalog.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createOfficialScenarioCatalog } from '../../server/officialScenarioCatalog.ts';

test('catalog seeds from static official docs when storage empty', () => {
  const catalog = createOfficialScenarioCatalog({ initialDocs: [], nowIso: () => '2026-04-12T10:00:00.000Z' });
  const seeded = catalog.list();
  assert.ok(seeded.length >= 20);
});

test('catalog update applies last write wins and refreshes updatedAt', () => {
  const catalog = createOfficialScenarioCatalog({ initialDocs: [], nowIso: () => '2026-04-12T10:00:00.000Z' });
  const base = catalog.list()[0]!;
  const next = { ...base, meta: { ...base.meta, name: 'Updated Name' } };
  const out = catalog.update(next, { actor: 'local-user' });
  assert.equal(out.meta.name, 'Updated Name');
  assert.equal(out.meta.updatedAt, '2026-04-12T10:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test tests/server/officialScenarioCatalog.test.ts`  
Expected: FAIL because `createOfficialScenarioCatalog` does not exist.

- [ ] **Step 3: Implement catalog module**

```ts
import { loadOfficialScenarioDocuments, validateScenarioDocumentStrict } from '../src/scenarios/official.ts';
import type { ScenarioDocument } from '../src/scenarios/types.ts';

export function createOfficialScenarioCatalog(deps?: {
  initialDocs?: ScenarioDocument[];
  nowIso?: () => string;
}): {
  list: () => ScenarioDocument[];
  getById: (id: string) => ScenarioDocument | null;
  update: (doc: ScenarioDocument, ctx: { actor?: string }) => ScenarioDocument;
  catalogUpdatedAt: () => string;
} {
  // seed from deps.initialDocs or loadOfficialScenarioDocuments()
  // keep map by id
  // on update: validate strict, require kind=official, replace by id (LWW), set meta.updatedAt=nowIso()
  // preserve/update meta.author from ctx.actor when provided
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test tests/server/officialScenarioCatalog.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/officialScenarioCatalog.ts tests/server/officialScenarioCatalog.test.ts
git commit -m "feat(scenarios): add server official catalog core with LWW updates"
```

---

### Task 2: HTTP API for Official Catalog

**Files:**
- Modify: `server/roomServer.ts`
- Test: `tests/server/officialScenarioCatalog.test.ts`

- [ ] **Step 1: Add failing API handler tests**

```ts
test('PUT /api/scenarios/official/:id returns 409 when feature flag disabled', async () => {
  // spin up test server with SCENARIOS_OFFICIAL_EDIT_ENABLED=false
  // expect HTTP 409
});

test('PUT /api/scenarios/official/:id rejects oversized payload with 413', async () => {
  // send > MAX_SCENARIO_PAYLOAD_BYTES JSON
  // expect HTTP 413
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test tests/server/officialScenarioCatalog.test.ts`  
Expected: FAIL for missing HTTP handlers / status codes.

- [ ] **Step 3: Implement GET/PUT endpoints in server**

```ts
// roomServer.ts
// add Node http server wrapper; keep ws server attached to same http server
// GET /api/scenarios/official -> { scenarios, catalogUpdatedAt }
// GET /api/scenarios/official/:id -> { scenario }
// PUT /api/scenarios/official/:id -> validates id match + kind/version + max payload
// env gate: SCENARIOS_OFFICIAL_EDIT_ENABLED === "true"
// status codes: 400, 404, 409, 413, 500
```

```ts
const MAX_SCENARIO_PAYLOAD_BYTES = 1_000_000;
const editsEnabled = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED === 'true';
```

- [ ] **Step 4: Run tests/build**

Run: `npx tsx --test tests/server/officialScenarioCatalog.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS (client build unaffected by server additions).

- [ ] **Step 5: Commit**

```bash
git add server/roomServer.ts tests/server/officialScenarioCatalog.test.ts
git commit -m "feat(server): expose official scenarios read and update API"
```

---

### Task 3: Realtime Invalidation Event

**Files:**
- Modify: `src/multiplayer/protocol.ts`
- Modify: `server/roomServer.ts`
- Test: `tests/multiplayer/protocol.test.ts`

- [ ] **Step 1: Add failing protocol test**

```ts
import type { ServerToClientMessage } from '../../src/multiplayer/protocol.ts';

test('ServerToClientMessage supports officialScenariosUpdated payload', () => {
  const msg: ServerToClientMessage = {
    type: 'officialScenariosUpdated',
    catalogUpdatedAt: '2026-04-12T10:00:00.000Z',
    changedIds: ['official-01'],
  };
  assert.equal(msg.type, 'officialScenariosUpdated');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test tests/multiplayer/protocol.test.ts`  
Expected: FAIL because union does not include new message type.

- [ ] **Step 3: Implement protocol + broadcast**

```ts
// protocol.ts
export type ServerToClientMessage =
  | /* existing */
  | { type: 'officialScenariosUpdated'; catalogUpdatedAt: string; changedIds: string[] };
```

```ts
// roomServer.ts after successful PUT
broadcastAllSockets({
  type: 'officialScenariosUpdated',
  catalogUpdatedAt: catalog.catalogUpdatedAt(),
  changedIds: [updated.id],
});
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test tests/multiplayer/protocol.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/protocol.ts server/roomServer.ts tests/multiplayer/protocol.test.ts
git commit -m "feat(mp): broadcast official scenario catalog updates"
```

---

### Task 4: Client Official API Adapter

**Files:**
- Create: `src/scenarios/officialApi.ts`
- Modify: `src/scenarios/official.ts`
- Test: `src/scenarios/official.test.ts`

- [ ] **Step 1: Add failing API adapter tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficialScenariosListResponse } from './officialApi.ts';

test('parseOfficialScenariosListResponse validates scenario docs', () => {
  const r = parseOfficialScenariosListResponse({ scenarios: [] });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test src/scenarios/official.test.ts`  
Expected: FAIL because `officialApi.ts` parser/helpers are missing.

- [ ] **Step 3: Implement API module and keep static loader as seed utility**

```ts
// officialApi.ts
export async function fetchOfficialScenarios(): Promise<ScenarioDocument[]> {
  const res = await fetch('/api/scenarios/official');
  // map status to typed errors
  // validate each scenario via validateScenarioDocumentStrict
}

export async function updateOfficialScenario(doc: ScenarioDocument): Promise<ScenarioDocument> {
  const res = await fetch(`/api/scenarios/official/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(doc),
  });
  // handle 400/404/409/413 + parse response
}
```

```ts
// official.ts
export function loadOfficialScenarioSeedDocuments(): ScenarioDocument[] {
  // current static import-based loader renamed for explicit seed purpose
}
```

- [ ] **Step 4: Run tests/build**

Run: `npx tsx --test src/scenarios/official.test.ts`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/officialApi.ts src/scenarios/official.ts src/scenarios/official.test.ts
git commit -m "feat(scenarios): add client official scenarios API adapter"
```

---

### Task 5: Official Edit Mode in Scenarios Panel

**Files:**
- Modify: `src/scenarios/panel.ts`
- Modify: `src/scenarios/types.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add failing panel behavior tests**

```ts
test('official card shows edit action and save calls updateOfficialScenario', () => {
  // mount panel with mocked deps and assert updateOfficialScenario called once
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test src/scenarios/io.test.ts src/scenarios/apply.test.ts`  
Expected: FAIL after adding new panel test scaffold (missing official edit wiring).

- [ ] **Step 3: Implement official editor workflow**

```ts
// panel.ts options
export type ScenariosPanelOptions = {
  loadOfficialScenarios: () => Promise<ScenarioDocument[]>;
  updateOfficialScenario: (doc: ScenarioDocument) => Promise<ScenarioDocument>;
  buildEditedScenarioDocument: (base: ScenarioDocument, meta: EditableMeta) => ScenarioDocument;
  // existing custom + apply deps remain
};
```

```ts
// panel.ts flow
// Official card action "Редактировать"
// open same meta dialog + mark mode=official
// Save -> buildEditedScenarioDocument(base, meta) -> updateOfficialScenario(doc)
// if external update noticed while editing same id, show confirm before Save (LWW warning)
```

- [ ] **Step 4: Run checks**

Run: `npm run build`  
Expected: PASS.

Run: `npx tsx --test src/scenarios/official.test.ts`  
Expected: PASS with new official edit cases.

- [ ] **Step 5: Commit**

```bash
git add src/scenarios/panel.ts src/main.ts src/scenarios/types.ts src/scenarios/official.test.ts
git commit -m "feat(scenarios): add official scenario edit and immediate publish flow"
```

---

### Task 6: Client Sync (WS event + polling fallback)

**Files:**
- Modify: `src/main.ts`
- Modify: `src/multiplayer/session.ts`
- Modify: `src/scenarios/panel.ts`

- [ ] **Step 1: Add failing sync behavior checks**

```ts
test('officialScenariosUpdated triggers catalog refresh', () => {
  // fake server message in session handler -> expect panel refresh call
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx tsx --test tests/multiplayer/protocol.test.ts`  
Expected: FAIL for missing runtime handling in session/main wiring.

- [ ] **Step 3: Implement runtime refresh triggers**

```ts
// main.ts
// on websocket message type === 'officialScenariosUpdated' => refresh official list
// on ws reconnect also refresh official list once
// if no ws connected, setInterval(30_000) to reload official list
```

```ts
// ensure timer cleanup when session disconnected
```

- [ ] **Step 4: Run checks**

Run: `npm run build`  
Expected: PASS.

Run: `npx tsx --test tests/multiplayer/protocol.test.ts src/scenarios/official.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/multiplayer/session.ts src/scenarios/panel.ts tests/multiplayer/protocol.test.ts
git commit -m "feat(scenarios): refresh official catalog from ws updates and polling fallback"
```

---

### Task 7: Final Verification and Regression Pass

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-04-12-official-scenarios-edit-flow-design.md` (if behavior deviates during implementation)

- [ ] **Step 1: Add unified test scripts**

```json
{
  "scripts": {
    "test:scenarios-official": "tsx --test tests/server/officialScenarioCatalog.test.ts src/scenarios/official.test.ts tests/multiplayer/protocol.test.ts"
  }
}
```

- [ ] **Step 2: Run full checks**

Run: `npm run test:scenarios-official`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 3: Manual acceptance checklist**

Run checklist:
1. Open `Сценарии` -> `Официальные`.
2. Enter official edit mode; change name + tags + move a piece on board.
3. Save -> success toast; card updates locally.
4. Second client connected to same server sees updated official card within websocket event (or <=30s polling fallback).
5. Second client active table does not auto-replace; only changes after `Применить`.
6. With `SCENARIOS_OFFICIAL_EDIT_ENABLED=false`, save returns clear error and no catalog mutation.
7. Oversized payload triggers 413 message in UI.

Expected: all items pass.

- [ ] **Step 4: Final commit**

```bash
git add package.json server src tests docs/superpowers/specs/2026-04-12-official-scenarios-edit-flow-design.md
git commit -m "feat(scenarios): ship official scenario editing with global publish"
```

---

## Self-Review

### 1) Spec coverage

- Global official edit with immediate publish: Tasks 2 + 5.
- LWW conflict model: Task 1 update semantics and Task 5 warning-confirm UX.
- Server source of truth + seed bootstrap: Task 1 + Task 2 + Task 4 split.
- Realtime + fallback sync: Task 3 + Task 6.
- Error handling (`400/404/409/413/500`): Task 2 + Task 4.
- Tests for API, protocol, and UX-critical behavior: Tasks 1, 3, 5, 6, 7.

No uncovered spec requirement found.

### 2) Placeholder scan

- Every task lists exact files, concrete commands, and expected outcomes.
- No `TODO`/`TBD` placeholders left.

### 3) Type consistency

- Uses existing `ScenarioDocument` across client/server.
- New realtime event name is consistent: `officialScenariosUpdated`.
- API routes consistent across tasks: `/api/scenarios/official` and `/api/scenarios/official/:id`.

