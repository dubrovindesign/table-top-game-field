import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OfficialApiError,
  fetchOfficialScenarioById,
  fetchOfficialScenarios,
  officialApiErrorCodeForStatus,
  parseOfficialScenarioEnvelopeResponse,
  parseOfficialScenariosListResponse,
  resolveOfficialApiErrorMessage,
  updateOfficialScenario,
} from './officialApi.ts';
import { loadOfficialScenarioSeedDocuments, validateScenarioDocumentStrict } from './official.ts';
import { mergeOfficialEditIntoDocument } from './panelHelpers.ts';
import { parseScenarioDocument } from './schema.ts';

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

test('loadOfficialScenarioSeedDocuments returns at least 20 valid official scenarios', () => {
  const docs = loadOfficialScenarioSeedDocuments();
  assert.ok(docs.length >= 16);
  const ids = new Set<string>();
  for (const d of docs) {
    assert.equal(d.version, 1);
    assert.equal(d.kind, 'official');
    const again = parseScenarioDocument(d);
    assert.equal(again.ok, true);
    ids.add(d.id);
  }
  assert.equal(ids.size, docs.length);
});

test('validateScenarioDocumentStrict throws with a clear message when document is invalid', () => {
  assert.throws(
    () =>
      validateScenarioDocumentStrict(
        {
          id: 'bad',
          version: 999,
          kind: 'official',
          meta: {
            name: 'x',
            description: 'y',
            tags: [],
            difficulty: 'easy',
          },
          boardOrientation: 'horizontal',
          snapshot: minimalValidSnapshot,
        },
        'test doc',
      ),
    /test doc:.*version/i,
  );
});

test('parseScenarioDocument rejects invalid payload (validator path)', () => {
  const r = parseScenarioDocument({ foo: 1 });
  assert.equal(r.ok, false);
  if (r.ok) assert.fail('expected failure');
});

test('mergeOfficialEditIntoDocument preserves official id/kind and merges meta + board fields', () => {
  const [base] = loadOfficialScenarioSeedDocuments();
  const snap = structuredClone(base.snapshot);
  const out = mergeOfficialEditIntoDocument(
    base,
    { name: 'Renamed', description: 'New desc', tags: ['alpha'], difficulty: 'hard' },
    'vertical',
    snap,
  );
  assert.equal(out.id, base.id);
  assert.equal(out.version, 1);
  assert.equal(out.kind, 'official');
  assert.equal(out.boardOrientation, 'vertical');
  assert.equal(out.meta.name, 'Renamed');
  assert.equal(out.meta.description, 'New desc');
  assert.deepEqual(out.meta.tags, ['alpha']);
  assert.equal(out.meta.difficulty, 'hard');
  assert.equal(out.snapshot, snap);
});

test('parseOfficialScenariosListResponse accepts empty scenarios with catalogUpdatedAt', () => {
  const r = parseOfficialScenariosListResponse({ scenarios: [], catalogUpdatedAt: '2026-04-12T00:00:00.000Z' });
  assert.equal(r.ok, true);
  if (!r.ok) assert.fail(r.error);
  assert.equal(r.value.scenarios.length, 0);
  assert.equal(r.value.catalogUpdatedAt, '2026-04-12T00:00:00.000Z');
});

test('parseOfficialScenariosListResponse rejects missing catalogUpdatedAt', () => {
  const r = parseOfficialScenariosListResponse({ scenarios: [] });
  assert.equal(r.ok, false);
  if (r.ok) assert.fail('expected failure');
  assert.match(r.error, /catalogUpdatedAt/i);
});

test('parseOfficialScenariosListResponse validates each scenario document', () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const r = parseOfficialScenariosListResponse({
    scenarios: [one],
    catalogUpdatedAt: '2026-04-12T00:00:00.000Z',
  });
  assert.equal(r.ok, true);
  if (!r.ok) assert.fail(r.error);
  assert.equal(r.value.scenarios[0]!.id, one.id);
});

test('parseOfficialScenariosListResponse reports first invalid scenario entry', () => {
  const r = parseOfficialScenariosListResponse({
    scenarios: [{ foo: 1 }],
    catalogUpdatedAt: '2026-04-12T00:00:00.000Z',
  });
  assert.equal(r.ok, false);
  if (r.ok) assert.fail('expected failure');
  assert.match(r.error, /\[0\]/);
});

test('parseOfficialScenarioEnvelopeResponse validates scenario field', () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const r = parseOfficialScenarioEnvelopeResponse({ scenario: one });
  assert.equal(r.ok, true);
  if (!r.ok) assert.fail(r.error);
  assert.equal(r.value.id, one.id);
});

test('officialApiErrorCodeForStatus maps key HTTP statuses', () => {
  assert.equal(officialApiErrorCodeForStatus(400), 'bad_request');
  assert.equal(officialApiErrorCodeForStatus(404), 'not_found');
  assert.equal(officialApiErrorCodeForStatus(409), 'conflict');
  assert.equal(officialApiErrorCodeForStatus(413), 'payload_too_large');
  assert.equal(officialApiErrorCodeForStatus(500), 'unknown');
});

test('resolveOfficialApiErrorMessage prefers JSON error string from body', () => {
  const msg = resolveOfficialApiErrorMessage(400, 'bad_request', '{"error":"bad things"}');
  assert.equal(msg, 'bad things');
});

test('OfficialApiError.fromHttpStatus sets code and message for 404', () => {
  const err = OfficialApiError.fromHttpStatus(404, '');
  assert.equal(err.status, 404);
  assert.equal(err.code, 'not_found');
  assert.match(err.message, /не найден/i);
});

test('fetchOfficialScenarios uses injected fetch and parses list', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.match(url, /\/api\/scenarios\/official$/);
    return new Response(
      JSON.stringify({ scenarios: [], catalogUpdatedAt: '2026-04-12T12:00:00.000Z' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const out = await fetchOfficialScenarios({ fetchImpl });
  assert.equal(out.catalogUpdatedAt, '2026-04-12T12:00:00.000Z');
  assert.deepEqual(out.scenarios, []);
});

test('fetchOfficialScenarios throws OfficialApiError on HTTP error', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('{"error":"nope"}', { status: 409, headers: { 'content-type': 'application/json' } });
  await assert.rejects(
    async () => fetchOfficialScenarios({ fetchImpl }),
    (e: unknown) => e instanceof OfficialApiError && e.status === 409 && e.code === 'conflict',
  );
});

test('fetchOfficialScenarios throws OfficialApiError on invalid 200 payload', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ scenarios: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(
    async () => fetchOfficialScenarios({ fetchImpl }),
    (e: unknown) => e instanceof OfficialApiError && e.code === 'unknown' && e.status === 200,
  );
});

test('fetchOfficialScenarios reports proxy hint when HTML is returned instead of JSON', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('<!doctype html><html><body>index</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  await assert.rejects(
    async () => fetchOfficialScenarios({ fetchImpl }),
    (e: unknown) =>
      e instanceof OfficialApiError &&
      /reverse proxy/i.test(e.message) &&
      /\/api\/scenarios/i.test(e.message),
  );
});

test('fetchOfficialScenarioById parses envelope on success', async () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.ok(url.includes(encodeURIComponent(one.id)));
    return new Response(JSON.stringify({ scenario: one }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const out = await fetchOfficialScenarioById(one.id, { fetchImpl });
  assert.equal(out.id, one.id);
});

test('fetchOfficialScenarioById maps 404 to not_found', async () => {
  const fetchImpl: typeof fetch = async () => new Response('{"error":"missing"}', { status: 404 });
  await assert.rejects(
    async () => fetchOfficialScenarioById('missing-id', { fetchImpl }),
    (e: unknown) => e instanceof OfficialApiError && e.code === 'not_found' && e.status === 404,
  );
});

test('updateOfficialScenario parses envelope on success', async () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(init?.method, 'PUT');
    const url = typeof input === 'string' ? input : input.toString();
    assert.ok(url.includes(encodeURIComponent(one.id)));
    return new Response(JSON.stringify({ scenario: one }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const out = await updateOfficialScenario(one, { fetchImpl });
  assert.equal(out.id, one.id);
});

test('updateOfficialScenario maps 413 to payload_too_large', async () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const fetchImpl: typeof fetch = async () => new Response('', { status: 413 });
  await assert.rejects(
    async () => updateOfficialScenario(one, { fetchImpl }),
    (e: unknown) =>
      e instanceof OfficialApiError && e.status === 413 && e.code === 'payload_too_large',
  );
});

test('updateOfficialScenario throws OfficialApiError on invalid 200 envelope', async () => {
  const [one] = loadOfficialScenarioSeedDocuments();
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(
    async () => updateOfficialScenario(one, { fetchImpl }),
    (e: unknown) => e instanceof OfficialApiError && e.code === 'unknown' && e.status === 200,
  );
});
