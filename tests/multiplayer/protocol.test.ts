import assert from 'node:assert/strict';
import test from 'node:test';

import { parseClientMessage } from '../../src/multiplayer/protocol.ts';

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
