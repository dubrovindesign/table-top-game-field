import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';

import {
  OFFICIAL_SCENARIO_PUT_MAX_BODY_BYTES,
  startRoomServer,
} from '../../server/roomServer.ts';
import { createOfficialScenarioCatalog } from '../../server/officialScenarioCatalog.ts';
import type { ServerToClientMessage } from '../../src/multiplayer/protocol.ts';
import { loadOfficialScenarioSeedDocuments } from '../../src/scenarios/official.ts';
import { parseScenarioDocument } from '../../src/scenarios/schema.ts';
import type { ScenarioDocument } from '../../src/scenarios/types.ts';

const minimalValidSnapshot = {
  v: 1,
  units: [],
  unitCardData: [],
  bigMiniatures: [],
  bigMiniCardData: [],
  largeMiniatures: [],
  largeMiniCardData: [],
  hugeMiniatures: [],
  hugeMiniCardData: [],
  terrains: [],
  terrainOffBoardWorlds: [],
  terrainRotationDegs: [],
  etherVortexes: [],
  godTablePieces: [],
} as const;

function baseOfficialDoc(overrides: Partial<ScenarioDocument> = {}): ScenarioDocument {
  const doc: ScenarioDocument = {
    id: 'test-official-1',
    version: 1,
    kind: 'official',
    meta: {
      name: 'N',
      description: 'D',
      tags: [],
      difficulty: 'easy',
      author: 'original-author',
    },
    boardOrientation: 'horizontal',
    snapshot: structuredClone(minimalValidSnapshot),
    ...overrides,
  };
  return doc;
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', (err) => reject(err));
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    ws.once('error', (err) => reject(err));
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.once('close', () => resolve());
  });
}

type OfficialScenariosUpdatedMessage = Extract<
  ServerToClientMessage,
  { type: 'officialScenariosUpdated' }
>;

function isOfficialScenariosUpdatedMessage(raw: unknown): raw is OfficialScenariosUpdatedMessage {
  if (!raw || typeof raw !== 'object') return false;
  const msg = raw as Record<string, unknown>;
  return (
    msg.type === 'officialScenariosUpdated' &&
    typeof msg.catalogUpdatedAt === 'string' &&
    Array.isArray(msg.changedIds) &&
    msg.changedIds.every((id) => typeof id === 'string')
  );
}

function waitForOfficialScenariosUpdated(
  ws: WebSocket,
  timeoutMs = 1_000,
): Promise<OfficialScenariosUpdatedMessage> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onMessage = (data: WebSocket.RawData) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        const parsed = JSON.parse(raw) as unknown;
        if (!isOfficialScenariosUpdatedMessage(parsed)) return;
        cleanup();
        resolve(parsed);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for officialScenariosUpdated after ${timeoutMs}ms`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.once('error', onError);
  });
}

function expectNoOfficialScenariosUpdated(
  ws: WebSocket,
  observeMs = 250,
): Promise<{ observed: number }> {
  return new Promise((resolve, reject) => {
    let observed = 0;
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onMessage = (data: WebSocket.RawData) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        const parsed = JSON.parse(raw) as unknown;
        if (isOfficialScenariosUpdatedMessage(parsed)) {
          observed += 1;
        }
      } catch {
        // Ignore non-JSON payloads in this observation window.
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve({ observed });
    }, observeMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.once('error', onError);
  });
}

test('default seed loads static official scenarios (no initialDocs)', () => {
  const cat = createOfficialScenarioCatalog({
    nowIso: () => '2026-01-01T00:00:00.000Z',
  });
  const staticDocs = loadOfficialScenarioSeedDocuments();
  assert.ok(cat.list().length >= 16);
  assert.equal(cat.list().length, staticDocs.length);
  const ids = new Set(cat.list().map((d) => d.id));
  assert.equal(ids.size, cat.list().length);
  for (const d of cat.list()) {
    assert.equal(d.kind, 'official');
    assert.equal(parseScenarioDocument(d).ok, true);
  }
});

test('explicit initialDocs: [] does not seed from static', () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [],
    nowIso: () => 't0',
  });
  assert.deepEqual(cat.list(), []);
});

test('list / getById / catalogUpdatedAt', () => {
  let tick = 0;
  const stamps = ['seed', 'u1', 'u2'];
  const nowIso = () => stamps[tick] ?? `extra-${tick}`;

  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id: 'a' }), baseOfficialDoc({ id: 'b' })],
    nowIso,
  });

  assert.equal(cat.catalogUpdatedAt(), 'seed');
  assert.equal(cat.getById('missing'), undefined);
  assert.equal(cat.getById('a')?.id, 'a');

  tick = 1;
  const u1 = cat.update(
    {
      ...baseOfficialDoc({ id: 'a', meta: { ...baseOfficialDoc().meta, name: 'A2' } }),
    },
    {},
  );
  assert.equal(u1.meta.name, 'A2');
  assert.equal(u1.meta.author, 'original-author');
  assert.equal(u1.meta.updatedAt, 'u1');
  assert.equal(cat.catalogUpdatedAt(), 'u1');

  tick = 2;
  cat.update(
    {
      ...baseOfficialDoc({
        id: 'b',
        meta: { ...baseOfficialDoc().meta, name: 'B2' },
      }),
    },
    { actor: 'editor' },
  );
  assert.equal(cat.catalogUpdatedAt(), 'u2');
  assert.equal(cat.getById('b')?.meta.author, 'editor');
});

test('update validates strictly (invalid document throws)', () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc()],
    nowIso: () => 't',
  });
  assert.throws(
    () =>
      cat.update({
        ...baseOfficialDoc(),
        version: 999,
      }),
    /Official scenario catalog update:/i,
  );
});

test('update rejects non-official kind after schema validation', () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc()],
    nowIso: () => 't',
  });
  const custom = parseScenarioDocument({
    ...baseOfficialDoc(),
    id: 'custom-1',
    kind: 'custom',
  });
  assert.equal(custom.ok, true);
  if (!custom.ok) assert.fail();
  assert.throws(
    () => cat.update(custom.value),
    /document kind must be "official"/i,
  );
});

test('update sets meta.updatedAt from nowIso and LWW replaces by id', () => {
  const stamps = ['t0', 't1'];
  let i = 0;
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id: 'same' })],
    nowIso: () => stamps[i++] ?? 'tx',
  });

  const next = cat.update({
    ...baseOfficialDoc({
      id: 'same',
      meta: {
        name: 'X',
        description: 'Y',
        tags: ['z'],
        difficulty: 'hard',
      },
    }),
  });
  assert.equal(next.meta.updatedAt, 't1');
  assert.equal(cat.getById('same')?.meta.difficulty, 'hard');
});

test('meta.author: ctx.actor wins; otherwise previous catalog author is preserved over payload', () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [
      baseOfficialDoc({
        id: 'p',
        meta: {
          name: 'n',
          description: 'd',
          tags: [],
          difficulty: 'normal',
          author: 'stored',
        },
      }),
    ],
    nowIso: () => 't',
  });

  const patched = cat.update({
    ...baseOfficialDoc({
      id: 'p',
      meta: {
        name: 'n2',
        description: 'd',
        tags: [],
        difficulty: 'normal',
        author: 'payload-should-not-win',
      },
    }),
  });
  assert.equal(patched.meta.author, 'stored');

  const withActor = cat.update(
    {
      ...baseOfficialDoc({
        id: 'p',
        meta: {
          name: 'n3',
          description: 'd',
          tags: [],
          difficulty: 'normal',
          author: 'ignored',
        },
      }),
    },
    { actor: 'actor-wins' },
  );
  assert.equal(withActor.meta.author, 'actor-wins');
});

test('meta.author: new id uses payload author when ctx.actor omitted', () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [],
    nowIso: () => 't',
  });
  const doc = cat.update(
    baseOfficialDoc({
      id: 'new-id',
      meta: {
        name: 'n',
        description: 'd',
        tags: [],
        difficulty: 'easy',
        author: 'from-payload',
      },
    }),
  );
  assert.equal(doc.meta.author, 'from-payload');
});

test('initialDocs are validated strictly and enforce official kind with index context', () => {
  assert.throws(
    () =>
      createOfficialScenarioCatalog({
        initialDocs: [{ ...baseOfficialDoc(), version: 2 }],
        nowIso: () => 't0',
      }),
    /initialDocs\[0\].*version/i,
  );

  assert.throws(
    () =>
      createOfficialScenarioCatalog({
        initialDocs: [{ ...baseOfficialDoc(), kind: 'custom' }],
        nowIso: () => 't0',
      }),
    /initialDocs\[0\].*kind must be "official"/i,
  );
});

test('catalog isolates internal state from external mutation', () => {
  const seed = baseOfficialDoc({
    id: 'isolation-1',
    meta: {
      name: 'seed-name',
      description: 'seed-desc',
      tags: ['seed'],
      difficulty: 'easy',
      author: 'seed-author',
    },
  });
  const cat = createOfficialScenarioCatalog({
    initialDocs: [seed],
    nowIso: () => 't0',
  });

  // Mutating the original seed object after construction must not leak in.
  seed.meta.name = 'mutated-seed-name';
  assert.equal(cat.getById('isolation-1')?.meta.name, 'seed-name');

  const fromGet = cat.getById('isolation-1');
  assert.ok(fromGet);
  if (!fromGet) assert.fail();
  fromGet.meta.name = 'mutated-via-get';
  fromGet.meta.tags.push('get-tag');
  assert.equal(cat.getById('isolation-1')?.meta.name, 'seed-name');
  assert.deepEqual(cat.getById('isolation-1')?.meta.tags, ['seed']);

  const fromList = cat.list();
  fromList[0].meta.name = 'mutated-via-list';
  fromList[0].meta.tags.push('list-tag');
  assert.equal(cat.getById('isolation-1')?.meta.name, 'seed-name');
  assert.deepEqual(cat.getById('isolation-1')?.meta.tags, ['seed']);
});

test('failed update leaves catalogUpdatedAt and stored doc unchanged', () => {
  const stamps = ['seed', 'u1'];
  let i = 0;
  const cat = createOfficialScenarioCatalog({
    initialDocs: [
      baseOfficialDoc({
        id: 'stable',
        meta: {
          name: 'stable-name',
          description: 'stable-desc',
          tags: ['stable'],
          difficulty: 'normal',
          author: 'stable-author',
        },
      }),
    ],
    nowIso: () => stamps[i++] ?? 'extra',
  });

  const beforeUpdatedAt = cat.catalogUpdatedAt();
  const beforeDoc = cat.getById('stable');
  assert.ok(beforeDoc);
  if (!beforeDoc) assert.fail();

  assert.throws(
    () =>
      cat.update({
        ...baseOfficialDoc({
          id: 'stable',
          meta: {
            name: 'should-not-apply',
            description: 'x',
            tags: [],
            difficulty: 'easy',
          },
        }),
        version: 999,
      }),
    /Official scenario catalog update:/i,
  );

  assert.equal(cat.catalogUpdatedAt(), beforeUpdatedAt);
  assert.deepEqual(cat.getById('stable'), beforeDoc);
});

test('HTTP PUT /api/scenarios/official/:id returns 409 when official edit feature is disabled', async () => {
  const prev = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = 'false';

  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id: 'http-409' })],
    nowIso: () => 't',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  try {
    const res = await fetch(
      `http://127.0.0.1:${srv.port}/api/scenarios/official/http-409`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(baseOfficialDoc({ id: 'http-409' })),
      },
    );
    assert.equal(res.status, 409);
    const j = (await res.json()) as { code?: string; error?: string };
    assert.equal(j.code, 'EDIT_DISABLED');
    assert.ok(typeof j.error === 'string' && j.error.length > 0);
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  } finally {
    if (prev === undefined) delete process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
    else process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = prev;
    await srv.close();
  }
});

test('HTTP PUT /api/scenarios/official/:id returns 413 when payload exceeds max body size', async () => {
  const prev = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = 'true';

  const cat = createOfficialScenarioCatalog({
    initialDocs: [],
    nowIso: () => 't',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  try {
    const body = 'x'.repeat(OFFICIAL_SCENARIO_PUT_MAX_BODY_BYTES + 1);
    const res = await fetch(
      `http://127.0.0.1:${srv.port}/api/scenarios/official/any-id`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      },
    );
    assert.equal(res.status, 413);
    const j = (await res.json()) as { code?: string };
    assert.equal(j.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  } finally {
    if (prev === undefined) delete process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
    else process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = prev;
    await srv.close();
  }
});

test('HTTP official scenario endpoint returns 400 INVALID_PATH for malformed encoded id', async () => {
  const cat = createOfficialScenarioCatalog({
    initialDocs: [],
    nowIso: () => 't',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  try {
    const res = await fetch(
      `http://127.0.0.1:${srv.port}/api/scenarios/official/%ED%A0%80`,
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { code?: string; error?: string };
    assert.equal(j.code, 'INVALID_PATH');
    assert.ok(typeof j.error === 'string' && j.error.length > 0);
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  } finally {
    await srv.close();
  }
});

test('successful HTTP PUT emits exactly one officialScenariosUpdated event', async () => {
  const prev = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = 'true';

  const id = 'ws-success-1';
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id })],
    nowIso: () => '2026-04-12T12:34:56.000Z',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
  try {
    await waitForOpen(ws);

    const res = await fetch(`http://127.0.0.1:${srv.port}/api/scenarios/official/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(
        baseOfficialDoc({
          id,
          meta: { ...baseOfficialDoc().meta, name: 'updated-name' },
        }),
      ),
    });
    assert.equal(res.status, 200);

    const event = await waitForOfficialScenariosUpdated(ws, 1_000);
    assert.deepEqual(event.changedIds, [id]);
    assert.equal(typeof event.catalogUpdatedAt, 'string');
    assert.ok(event.catalogUpdatedAt.length > 0);

    const additional = await expectNoOfficialScenariosUpdated(ws, 250);
    assert.equal(additional.observed, 0);
  } finally {
    if (prev === undefined) delete process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
    else process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = prev;
    ws.close();
    await waitForClose(ws);
    await srv.close();
  }
});

test('failed HTTP PUT emits no officialScenariosUpdated event', async () => {
  const prev = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = 'true';

  const id = 'ws-fail-1';
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id })],
    nowIso: () => 't',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
  try {
    await waitForOpen(ws);

    const res = await fetch(`http://127.0.0.1:${srv.port}/api/scenarios/official/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);

    const none = await expectNoOfficialScenariosUpdated(ws, 300);
    assert.equal(none.observed, 0);
  } finally {
    if (prev === undefined) delete process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
    else process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = prev;
    ws.close();
    await waitForClose(ws);
    await srv.close();
  }
});

test('startRoomServer close clears room state so restart has no stale rooms', async () => {
  const srv1 = await startRoomServer({ port: 0 });
  let createdRoomId = '';
  try {
    const ws1 = new WebSocket(`ws://127.0.0.1:${srv1.port}`);
    await waitForOpen(ws1);
    ws1.send(JSON.stringify({ type: 'createRoom' }));
    const created = (await waitForMessage(ws1)) as { type?: string; roomId?: string };
    assert.equal(created.type, 'roomCreated');
    assert.equal(typeof created.roomId, 'string');
    createdRoomId = created.roomId ?? '';
    assert.ok(createdRoomId.length > 0);
    ws1.close();
    await waitForClose(ws1);
  } finally {
    await srv1.close();
  }

  const srv2 = await startRoomServer({ port: 0 });
  try {
    const ws2 = new WebSocket(`ws://127.0.0.1:${srv2.port}`);
    await waitForOpen(ws2);
    ws2.send(JSON.stringify({ type: 'joinRoom', roomId: createdRoomId, role: 'player' }));
    const joined = (await waitForMessage(ws2)) as { type?: string; message?: string };
    assert.equal(joined.type, 'joinError');
    assert.equal(joined.message, 'Room not found');
    ws2.close();
    await waitForClose(ws2);
  } finally {
    await srv2.close();
  }
});

test('official catalog persists updates to storage file and restores after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'official-scenarios-catalog-'));
  const storageFilePath = join(dir, 'official-scenarios.json');
  try {
    const catA = createOfficialScenarioCatalog({
      initialDocs: [baseOfficialDoc({ id: 'persist-1' })],
      nowIso: () => '2026-04-12T10:00:00.000Z',
      storageFilePath,
    });
    catA.update({
      ...baseOfficialDoc({
        id: 'persist-1',
        meta: {
          name: 'Persisted Name',
          description: 'Persisted Desc',
          tags: ['persisted'],
          difficulty: 'hard',
          author: 'persist-author',
        },
      }),
    });

    const catB = createOfficialScenarioCatalog({
      initialDocs: [],
      nowIso: () => '2026-04-12T11:00:00.000Z',
      storageFilePath,
    });
    const restored = catB.getById('persist-1');
    assert.ok(restored);
    if (!restored) assert.fail();
    assert.equal(restored.meta.name, 'Persisted Name');
    assert.deepEqual(restored.meta.tags, ['persisted']);
    assert.equal(restored.meta.difficulty, 'hard');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP PUT /api/scenarios/official/:id enforces per-IP rate limit', async () => {
  const prevEnabled = process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
  const prevRate = process.env.SCENARIOS_OFFICIAL_RATE_LIMIT_PER_MIN;
  process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = 'true';
  process.env.SCENARIOS_OFFICIAL_RATE_LIMIT_PER_MIN = '1';
  const cat = createOfficialScenarioCatalog({
    initialDocs: [baseOfficialDoc({ id: 'http-rate-limit' })],
    nowIso: () => 't',
  });
  const srv = await startRoomServer({ port: 0, officialCatalog: cat });
  try {
    const putOnce = async (name: string): Promise<Response> =>
      fetch(`http://127.0.0.1:${srv.port}/api/scenarios/official/http-rate-limit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(
          baseOfficialDoc({
            id: 'http-rate-limit',
            meta: {
              name,
              description: 'd',
              tags: [],
              difficulty: 'easy',
              author: 'a',
            },
          }),
        ),
      });

    const first = await putOnce('first');
    assert.equal(first.status, 200);
    const second = await putOnce('second');
    assert.equal(second.status, 429);
    const payload = (await second.json()) as { code?: string };
    assert.equal(payload.code, 'RATE_LIMITED');
  } finally {
    if (prevEnabled === undefined) delete process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED;
    else process.env.SCENARIOS_OFFICIAL_EDIT_ENABLED = prevEnabled;
    if (prevRate === undefined) delete process.env.SCENARIOS_OFFICIAL_RATE_LIMIT_PER_MIN;
    else process.env.SCENARIOS_OFFICIAL_RATE_LIMIT_PER_MIN = prevRate;
    await srv.close();
  }
});
