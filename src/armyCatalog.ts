/**
 * Army Builder catalog: factions (with domain), leaders, roster slots (maxCopies), unit definitions.
 */

import type { Domain, UnitCardData } from './unitCard';

/** Default army points limit (panel lets user pick 200 / 300 / 400). */
export const ARMY_POINTS_CAP = 300;

export type FactionDef = {
  id: string;
  name: string;
  domain: Domain;
  /** Faction emblem in the army panel filter row (`public/` path). */
  panelIconSrc: string;
};

export type RosterSlotDef = {
  unitId: string;
  maxCopies: number;
};

export type LeaderDef = {
  id: string;
  name: string;
  factionId: string;
  /** Placeable leader miniature in `CATALOG_UNITS` (same stats row as troops in the panel). */
  catalogUnitId: string;
  roster: RosterSlotDef[];
};

/** Max models of a given leader mini on the board (per leader id + catalog id). */
export const LEADER_MINI_MAX_COPIES = 1;

export type CatalogUnitDef = {
  id: string;
  points: number;
  card: UnitCardData;
};

const SMALL_WALK = 4;
const SMALL_RUN = 7;
const BIG_WALK = 2;
const BIG_RUN = 4;

const SMALL_SPRITES = ['/tern-unit-1.jpg', '/Frame 144.png'] as const;
const BIG_SPRITE = '/Frame 118.png';

function gruntCard(
  name: string,
  sprite: string,
  domains: Domain[],
  keywords: string[],
): UnitCardData {
  return {
    name,
    size: 'small',
    health: 6,
    maxHealth: 6,
    defense: { white: 1 },
    walk: SMALL_WALK,
    run: SMALL_RUN,
    sprite,
    domains,
    concentration: {},
    defenseReaction: { white: 1 },
    exploration: {},
    grabRange: 1,
    attacks: [
      {
        name: 'Strike',
        range: 1,
        attackRange: 'melee',
        damageType: 'physical',
        damage: 2,
        dice: { red: 1 },
      },
    ],
    traits: [{ name: 'Line Trooper', description: 'Placeholder unit for roster testing.' }],
    keywords,
  };
}

/** Canonical catalog entries keyed by id. */
export const CATALOG_UNITS: Record<string, CatalogUnitDef> = {
  tern_vanguard: {
    id: 'tern_vanguard',
    points: 55,
    card: {
      name: 'Tern Vanguard',
      size: 'small',
      health: 10,
      maxHealth: 10,
      defense: { white: 2, green: 1 },
      walk: SMALL_WALK,
      run: SMALL_RUN,
      sprite: SMALL_SPRITES[0],
      domains: ['order'],
      concentration: { red: 1 },
      defenseReaction: { white: 1 },
      exploration: { white: 1 },
      grabRange: 1,
      attacks: [
        {
          name: 'Sword Strike',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 3,
          dice: { red: 2 },
          modifiers: [
            {
              kind: 'icon',
              label: 'Bleeding',
              description: 'Target loses 1 HP at the start of each turn.',
            },
          ],
        },
        {
          name: 'Shield Bash',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 2,
          dice: { red: 1, green: 1 },
          modifiers: [{ kind: 'text', label: 'Pushback 1 hex' }],
        },
      ],
      traits: [
        { name: 'Shield Wall', description: '+1 white defense die when adjacent to an ally.' },
      ],
      keywords: ['Human', 'Warrior', 'Sword', 'Order'],
    },
  },
  tern_ranger: {
    id: 'tern_ranger',
    points: 50,
    card: {
      name: 'Tern Ranger',
      size: 'small',
      health: 8,
      maxHealth: 8,
      defense: { white: 1, green: 1 },
      walk: SMALL_WALK,
      run: SMALL_RUN,
      sprite: SMALL_SPRITES[1],
      domains: ['nature', 'order'],
      concentration: { green: 1 },
      defenseReaction: { green: 1 },
      exploration: { green: 1 },
      grabRange: 2,
      attacks: [
        {
          name: 'Aimed Shot',
          range: 6,
          attackRange: 'ranged',
          damageType: 'physical',
          damage: 3,
          dice: { green: 2, red: 1 },
          modifiers: [
            {
              kind: 'icon',
              label: 'Piercing',
              description: 'Ignores 1 defense die.',
            },
          ],
        },
        {
          name: 'Poison Arrow',
          range: 5,
          attackRange: 'ranged',
          damageType: 'poison',
          damage: 2,
          dice: { green: 2 },
          modifiers: [{ kind: 'text', label: 'Poison: 1 dmg/turn for 2 turns' }],
        },
      ],
      traits: [
        { name: 'Evasion', description: 'After being attacked, may move 1 hex.' },
        { name: 'Poison Resistance', description: 'Halves poison damage (round down).' },
      ],
      keywords: ['Human', 'Ranger', 'Bow', 'Nature'],
    },
  },
  iron_golem: {
    id: 'iron_golem',
    points: 95,
    card: {
      name: 'Iron Golem',
      size: 'big',
      health: 20,
      maxHealth: 20,
      defense: { white: 3, green: 2 },
      walk: BIG_WALK,
      run: BIG_RUN,
      sprite: BIG_SPRITE,
      domains: ['order', 'chaos'],
      concentration: { red: 2 },
      defenseReaction: { white: 2 },
      exploration: { white: 1, green: 1 },
      grabRange: 1,
      attacks: [
        {
          name: 'Stomp',
          range: 1,
          attackRange: 'melee',
          damageType: 'physical',
          damage: 5,
          dice: { red: 3, black: 1 },
          modifiers: [
            { kind: 'text', label: 'AoE: all enemies in hexon' },
            {
              kind: 'icon',
              label: 'Stun',
              description: 'Target skips next activation.',
            },
          ],
        },
        {
          name: 'Flame Breath',
          range: 3,
          attackRange: 'ranged',
          damageType: 'fire',
          damage: 4,
          dice: { red: 2, black: 1 },
          modifiers: [{ kind: 'text', label: 'Region AoE: cone 3 hexes' }],
        },
      ],
      traits: [
        { name: 'Regenerate', description: 'Heal 2 HP at the start of each turn.' },
        { name: 'Fortify', description: 'If stationary, +2 white defense dice until next activation.' },
        {
          name: 'Last Stand',
          description: 'When would die, roll 1 white die. On success: survive with 1 HP.',
        },
      ],
      keywords: ['Construct', 'Heavy', 'Golem', 'Fire'],
    },
  },
  ash_legionnaire: {
    id: 'ash_legionnaire',
    points: 40,
    card: gruntCard('Ash Legionnaire', SMALL_SPRITES[0], ['chaos'], ['Chaos', 'Melee', 'Ash']),
  },
  sylvan_warden: {
    id: 'sylvan_warden',
    points: 42,
    card: gruntCard('Sylvan Warden', SMALL_SPRITES[1], ['nature'], ['Nature', 'Sylvan', 'Spear']),
  },
  umbral_stalker: {
    id: 'umbral_stalker',
    points: 48,
    card: gruntCard('Umbral Stalker', SMALL_SPRITES[0], ['shadow'], ['Shadow', 'Stealth', 'Blade']),
  },
  iron_oath_knight: {
    id: 'iron_oath_knight',
    points: 52,
    card: gruntCard('Iron Oath Knight', SMALL_SPRITES[1], ['order'], ['Order', 'Knight', 'Shield']),
  },
  bloodbound_berzerker: {
    id: 'bloodbound_berzerker',
    points: 45,
    card: gruntCard('Bloodbound Berserker', SMALL_SPRITES[0], ['chaos'], ['Chaos', 'Berserker', 'Axe']),
  },
  wildfang_runner: {
    id: 'wildfang_runner',
    points: 38,
    card: gruntCard('Wildfang Runner', SMALL_SPRITES[1], ['nature'], ['Nature', 'Beast', 'Fast']),
  },
  veil_revenant: {
    id: 'veil_revenant',
    points: 44,
    card: gruntCard('Veil Revenant', SMALL_SPRITES[0], ['shadow'], ['Shadow', 'Undead', 'Zombie']),
  },
  // Leader miniatures (placeable; not part of `roster` slots; points count toward ARMY_POINTS_CAP)
  leader_tern_captain: {
    id: 'leader_tern_captain',
    points: 62,
    card: gruntCard('Captain Aldric', SMALL_SPRITES[0], ['order'], ['Leader', 'Tern', 'Order']),
  },
  leader_tern_warden: {
    id: 'leader_tern_warden',
    points: 60,
    card: gruntCard('Warden Mira', SMALL_SPRITES[1], ['order'], ['Leader', 'Tern', 'Order']),
  },
  leader_ash_warlord: {
    id: 'leader_ash_warlord',
    points: 64,
    card: gruntCard('Warlord Krask', SMALL_SPRITES[0], ['chaos'], ['Leader', 'Ash', 'Chaos']),
  },
  leader_sylvan_heartwood: {
    id: 'leader_sylvan_heartwood',
    points: 61,
    card: gruntCard('Heartwood Seer', SMALL_SPRITES[1], ['nature'], ['Leader', 'Sylvan', 'Nature']),
  },
  leader_umbral_prince: {
    id: 'leader_umbral_prince',
    points: 66,
    card: gruntCard('Prince of Veils', SMALL_SPRITES[0], ['shadow'], ['Leader', 'Umbral', 'Shadow']),
  },
  leader_iron_highmarshal: {
    id: 'leader_iron_highmarshal',
    points: 68,
    card: gruntCard('High Marshal', SMALL_SPRITES[1], ['order'], ['Leader', 'Iron', 'Order']),
  },
  leader_blood_matriarch: {
    id: 'leader_blood_matriarch',
    points: 63,
    card: gruntCard('Blood Matriarch', SMALL_SPRITES[0], ['chaos'], ['Leader', 'Blood', 'Chaos']),
  },
  leader_wild_alpha: {
    id: 'leader_wild_alpha',
    points: 58,
    card: gruntCard('Pack Alpha', SMALL_SPRITES[1], ['nature'], ['Leader', 'Wild', 'Nature']),
  },
  leader_veil_necromancer: {
    id: 'leader_veil_necromancer',
    points: 65,
    card: gruntCard('Necromancer of the Rift', SMALL_SPRITES[0], ['shadow'], ['Leader', 'Veil', 'Shadow']),
  },
};

export const FACTIONS: FactionDef[] = [
  /** Разрушение */
  { id: 'tern_concord', name: 'Кастилия', domain: 'order', panelIconSrc: '/castilla.webp' },
  { id: 'broken_veil', name: 'Бездна', domain: 'order', panelIconSrc: '/chasm.webp' },
  { id: 'wild_horde', name: 'Орда Брумгаров', domain: 'order', panelIconSrc: '/broomgar_horde.webp' },
  /** Созидание */
  { id: 'sylvan_enclave', name: 'Ангельн', domain: 'chaos', panelIconSrc: '/engeln.webp' },
  { id: 'ash_legion', name: 'Приорат Надежды', domain: 'chaos', panelIconSrc: '/priory_of_hope.webp' },
  /** Смерть */
  { id: 'iron_covenant', name: 'Великий Терновник', domain: 'nature', panelIconSrc: '/blackthorn.webp' },
  { id: 'blood_pact', name: 'Кригмарк', domain: 'nature', panelIconSrc: '/krigmark.webp' },
  /** Жизнь */
  { id: 'umbral_court', name: 'Кельд', domain: 'shadow', panelIconSrc: '/keld.webp' },
];

export const LEADERS: LeaderDef[] = [
  {
    id: 'tern_captain',
    name: 'Captain Aldric',
    factionId: 'tern_concord',
    catalogUnitId: 'leader_tern_captain',
    roster: [
      { unitId: 'tern_vanguard', maxCopies: 3 },
      { unitId: 'tern_ranger', maxCopies: 2 },
      { unitId: 'iron_golem', maxCopies: 1 },
    ],
  },
  {
    id: 'tern_warden',
    name: 'Warden Mira',
    factionId: 'tern_concord',
    catalogUnitId: 'leader_tern_warden',
    roster: [
      { unitId: 'tern_vanguard', maxCopies: 2 },
      { unitId: 'tern_ranger', maxCopies: 3 },
      { unitId: 'iron_golem', maxCopies: 1 },
    ],
  },
  {
    id: 'ash_warlord',
    name: 'Warlord Krask',
    factionId: 'ash_legion',
    catalogUnitId: 'leader_ash_warlord',
    roster: [
      { unitId: 'ash_legionnaire', maxCopies: 4 },
      { unitId: 'iron_golem', maxCopies: 1 },
    ],
  },
  {
    id: 'sylvan_heartwood',
    name: 'Heartwood Seer',
    factionId: 'sylvan_enclave',
    catalogUnitId: 'leader_sylvan_heartwood',
    roster: [{ unitId: 'sylvan_warden', maxCopies: 4 }],
  },
  {
    id: 'umbral_prince',
    name: 'Prince of Veils',
    factionId: 'umbral_court',
    catalogUnitId: 'leader_umbral_prince',
    roster: [
      { unitId: 'umbral_stalker', maxCopies: 3 },
      { unitId: 'veil_revenant', maxCopies: 2 },
    ],
  },
  {
    id: 'iron_highmarshal',
    name: 'High Marshal',
    factionId: 'iron_covenant',
    catalogUnitId: 'leader_iron_highmarshal',
    roster: [{ unitId: 'iron_oath_knight', maxCopies: 4 }],
  },
  {
    id: 'blood_matriarch',
    name: 'Blood Matriarch',
    factionId: 'blood_pact',
    catalogUnitId: 'leader_blood_matriarch',
    roster: [{ unitId: 'bloodbound_berzerker', maxCopies: 5 }],
  },
  {
    id: 'wild_alpha',
    name: 'Pack Alpha',
    factionId: 'wild_horde',
    catalogUnitId: 'leader_wild_alpha',
    roster: [{ unitId: 'wildfang_runner', maxCopies: 5 }],
  },
  {
    id: 'veil_necromancer',
    name: 'Necromancer of the Rift',
    factionId: 'broken_veil',
    catalogUnitId: 'leader_veil_necromancer',
    roster: [
      { unitId: 'veil_revenant', maxCopies: 6 },
      { unitId: 'umbral_stalker', maxCopies: 2 },
    ],
  },
];

export function getCatalogUnit(unitId: string): CatalogUnitDef | undefined {
  return CATALOG_UNITS[unitId];
}

export function leadersForFaction(factionId: string): LeaderDef[] {
  return LEADERS.filter((l) => l.factionId === factionId);
}

export function getLeader(leaderId: string): LeaderDef | undefined {
  return LEADERS.find((l) => l.id === leaderId);
}

export function getFaction(factionId: string): FactionDef | undefined {
  return FACTIONS.find((f) => f.id === factionId);
}

export type RosterRowView = {
  unitId: string;
  name: string;
  points: number;
  maxCopies: number;
  used: number;
  card: UnitCardData;
};

export function listRosterRows(
  leaderId: string,
  searchQuery: string,
  usedCount: (leaderId: string, unitId: string) => number,
): RosterRowView[] {
  const leader = getLeader(leaderId);
  if (!leader) return [];
  const q = searchQuery.trim().toLowerCase();
  const rows: RosterRowView[] = [];
  for (const slot of leader.roster) {
    const def = CATALOG_UNITS[slot.unitId];
    if (!def) continue;
    const kw = def.card.keywords?.join(' ') ?? '';
    const hay = `${def.card.name} ${kw}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    rows.push({
      unitId: slot.unitId,
      name: def.card.name,
      points: def.points,
      maxCopies: slot.maxCopies,
      used: usedCount(leaderId, slot.unitId),
      card: def.card,
    });
  }
  return rows;
}

export function maxCopiesForSlot(leaderId: string, unitId: string): number | null {
  const leader = getLeader(leaderId);
  if (!leader) return null;
  const slot = leader.roster.find((s) => s.unitId === unitId);
  return slot ? slot.maxCopies : null;
}

export function isLeaderCatalogUnitForLeader(leaderId: string, unitId: string): boolean {
  const leader = getLeader(leaderId);
  return leader !== undefined && leader.catalogUnitId === unitId;
}
