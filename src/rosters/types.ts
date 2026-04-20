export type RosterMeta = {
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RosterWorld = { x: number; y: number };

/** Одно размещение юнита на столе, с сохранённой мировой позицией. */
export type RosterUnitPlacement = {
  leaderId: string;
  unitId: string;
  world: RosterWorld;
};

/** Стопка карт богов на столе. ids — от низа к верху. */
export type RosterGodPiece = {
  ids: string[];
  world: RosterWorld;
  faceUp: boolean;
};

/** Инвентарь на столе. */
export type RosterInventoryPlacement = {
  leaderId: string;
  itemId: string;
  world: RosterWorld;
};

export type RosterDocument = {
  id: string;
  version: 2;
  meta: RosterMeta;
  units: RosterUnitPlacement[];
  godPieces: RosterGodPiece[];
  inventory: RosterInventoryPlacement[];
};
