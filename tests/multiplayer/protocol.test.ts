import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseClientMessage,
  type ServerToClientMessage,
} from '../../src/multiplayer/protocol.ts';

test('ServerToClientMessage includes officialScenariosUpdated (typed payload)', () => {
  const msg: ServerToClientMessage = {
    type: 'officialScenariosUpdated',
    catalogUpdatedAt: '2026-04-12T12:00:00.000Z',
    changedIds: ['scenario-a', 'scenario-b'],
  };
  assert.equal(msg.type, 'officialScenariosUpdated');
  assert.equal(msg.catalogUpdatedAt, '2026-04-12T12:00:00.000Z');
  assert.deepEqual(msg.changedIds, ['scenario-a', 'scenario-b']);
  const roundTrip = JSON.parse(JSON.stringify(msg)) as ServerToClientMessage;
  if (roundTrip.type !== 'officialScenariosUpdated') assert.fail('expected officialScenariosUpdated');
  assert.equal(roundTrip.catalogUpdatedAt, msg.catalogUpdatedAt);
  assert.deepEqual(roundTrip.changedIds, msg.changedIds);
});

test('parseClientMessage accepts pingIntent with finite board coordinates', () => {
  const raw = JSON.stringify({ type: 'pingIntent', boardX: 10.25, boardY: -3 });
  assert.deepEqual(parseClientMessage(raw), {
    type: 'pingIntent',
    boardX: 10.25,
    boardY: -3,
  });
});

test('parseClientMessage rejects pingIntent with missing boardX', () => {
  const raw = JSON.stringify({ type: 'pingIntent', boardY: 1 });
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent with missing boardY', () => {
  const raw = JSON.stringify({ type: 'pingIntent', boardX: 1 });
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent with non-numeric boardX', () => {
  const raw = JSON.stringify({ type: 'pingIntent', boardX: '10', boardY: 0 });
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent with non-numeric boardY', () => {
  const raw = JSON.stringify({ type: 'pingIntent', boardX: 0, boardY: null });
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent when boardX is JSON numeric overflow (parses to Infinity)', () => {
  const raw = '{"type":"pingIntent","boardX":1e400,"boardY":0}';
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent when boardY is JSON numeric overflow (parses to -Infinity)', () => {
  const raw = '{"type":"pingIntent","boardX":0,"boardY":-1e400}';
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent when boardX is null after JSON.stringify (Infinity does not round-trip)', () => {
  const raw = JSON.stringify({
    type: 'pingIntent',
    boardX: Number.POSITIVE_INFINITY,
    boardY: 0,
  });
  assert.equal(parseClientMessage(raw), null);
});

test('parseClientMessage rejects pingIntent when boardY is null after JSON.stringify (-Infinity does not round-trip)', () => {
  const raw = JSON.stringify({
    type: 'pingIntent',
    boardX: 0,
    boardY: Number.NEGATIVE_INFINITY,
  });
  assert.equal(parseClientMessage(raw), null);
});
