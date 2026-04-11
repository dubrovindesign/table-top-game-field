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
