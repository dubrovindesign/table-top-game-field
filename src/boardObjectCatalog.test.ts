import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_OBJECT_CATALOG, listBoardObjectCategories } from './boardObjectCatalog';

test('board object catalog includes prisoners category with four single-hex prisoners', () => {
  const categories = listBoardObjectCategories();
  assert.ok(categories.includes('prisoners'));

  const prisonerIds = [
    'prisoner-krig',
    'prisoner-engeln',
    'prisoner-keld',
    'prisoner-kastillia',
  ] as const;

  for (const id of prisonerIds) {
    const item = BOARD_OBJECT_CATALOG.find((entry) => entry.id === id);
    assert.ok(item, `missing prisoner entry ${id}`);
    assert.equal(item?.category, 'prisoners');
    assert.equal(item?.footprint, 'hex');
    assert.equal(item?.keepImagePlayerFacing, true);
    assert.equal(item?.defaultHealth, 5);
  }
});
