import assert from 'node:assert/strict';
import test from 'node:test';

import { boardLocalToWorld, worldToBoardLocal } from '../../src/board/boardTransforms.ts';
import type { BoardInstance } from '../../src/board/boardModel.ts';

function close(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

test('board transforms roundtrip without rotation', () => {
  const board: BoardInstance = {
    id: 'b1',
    templateId: 't',
    worldX: 100,
    worldY: -50,
    rotationDeg: 0,
    scale: 1.25,
    zIndex: 0,
  };
  const local = { x: 12, y: 34 };
  const world = boardLocalToWorld(board, local);
  const back = worldToBoardLocal(board, world);
  assert.equal(close(back.x, local.x), true);
  assert.equal(close(back.y, local.y), true);
});

test('board transforms roundtrip with 90-degree rotation', () => {
  const board: BoardInstance = {
    id: 'b2',
    templateId: 't',
    worldX: 10,
    worldY: 20,
    rotationDeg: 90,
    scale: 1,
    zIndex: 1,
  };
  const local = { x: 5, y: 2 };
  const world = boardLocalToWorld(board, local);
  const back = worldToBoardLocal(board, world);
  assert.equal(close(back.x, local.x), true);
  assert.equal(close(back.y, local.y), true);
});

