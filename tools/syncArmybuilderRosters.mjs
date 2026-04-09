/**
 * One-shot: читает src/catalog/data/armybuilder-leaders-ru.json,
 * сопоставляет юниты с каталогом (имя / tech / таблица), создаёт ab-ns-* без спрайтов,
 * перезаписывает src/catalog/leaders.json слотами ростера из Army Builder.
 *
 * Запуск из корня: node tools/syncArmybuilderRosters.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UNITS_DIR = path.join(ROOT, 'src/catalog/units');
const LEADERS_PATH = path.join(ROOT, 'src/catalog/leaders.json');
const DATA_PATH = path.join(ROOT, 'src/catalog/data/armybuilder-leaders-ru.json');

const FACTION_FLAG = {
  engeln: '/engeln.webp',
  priory_of_hope: '/priory_of_hope.webp',
  castilla: '/castilla.webp',
  chasm: '/chasm.webp',
  broomgar_horde: '/broomgar_horde.webp',
  keld: '/keld.webp',
  krigmark: '/krigmark.webp',
  blackthorn: '/blackthorn.webp',
};

const DOMAIN_OF = {
  engeln: 'creation',
  priory_of_hope: 'creation',
  castilla: 'destruction',
  chasm: 'destruction',
  broomgar_horde: 'destruction',
  keld: 'life',
  krigmark: 'death',
  blackthorn: 'death',
};

const KEYWORD_OF = {
  engeln: 'Ангельн',
  priory_of_hope: 'Приорат Надежды',
  castilla: 'Кастилия',
  chasm: 'Бездна',
  broomgar_horde: 'Орда Брумгаров',
  keld: 'Кельд',
  krigmark: 'Кригмарк',
  blackthorn: 'Великий Терновник',
};

const HERO_TECH_TO_LEADER = {
  richard: 'engeln-richard-serdtse-leogriffa',
  richard_2: 'engeln-richard-pervyy-rytsar',
  breylon: 'engeln-braylon-osveshchayuschiy-put',
  ayris: 'engeln-iris-iz-yorvika',
  hoakin_de_esperando: 'priory_of_hope-khoakin-de-esperando',
  ferran_infantry: 'priory_of_hope-ricardo-ferran-lighthouse-keeper',
  ferran_bull: 'priory_of_hope-ricardo-ferran-roar-of-the-sea',
  torquemad: 'castilla-leader-torquemad-prelat',
  torquemad_2: 'castilla-leader-torquemad-revnitel',
  torres: 'castilla-leader-carlos-torres',
  salvador: 'castilla-leader-salvador-yerro',
  faceless: 'chasm-bezlikiy-vladyka-nenavisti',
  garkrand: 'chasm-garkrand-sotnik-chetvertogo-kruga',
  abgorr: 'chasm-abgorr-neotrazimyy-istyazatel',
  chazz: 'chasm-chazz-otpriysk-neotrazimogo',
  kurosh_khan: 'broomgar-kurosh-khan',
  kellantra: 'Kellantra',
  kellantra_lindwurm: 'kellantra-with-lindwurm',
  brammn_hero: "Bram'mn-the-Wise",
  "na'atly_hero": "Na'atly-Wild-Huntress",
  gottfried: 'krigmark-gottfried-goed-kriglingen',
  gottfried_2: 'krigmark-gottfried-goed-iron-hand',
  dalmar_shultz_hero: 'krigmark-dalmar-shultz-starshiy-inzhener',
  drago_mort: 'Drago-Mort-DeaMor',
};

const GLOBAL_TECH = {
  taorgas_blades: 'merc-kow-mr03',
  taorgas_hammer: 'merc-kow-mr04',
  gatarkhin_blades: 'merc-kow-mr01',
  gatarkhin_glaive: 'merc-kow-mr02',
  aldvin_book: 'merc-kow-mr05',
  aldvin_beast: 'merc-kow-mr06',
};

function engelnTech(tech) {
  const m = {
    swordsman: 'engeln-mechitsa-angelyna',
    swordmaster: 'engeln-master-mecha',
    healing_hand: 'engeln-klirik-istselyayushchey-dlani',
    shieldman: 'engeln-pochotnyy-shchitonosets',
    ranger_archer: 'engeln-reindzher-angelyna',
    shadowstep_thief: 'engeln-plut-tenevogo-shaga',
    lion_cavalry_knight: 'engeln-rytsar-lvinnoy-kavalerii',
    magister_windtower: 'engeln-magistr-bashni-vozduha',
    houndmaster: 'engeln-psar-angelyna',
    militia_sword: 'engeln-opolchenets-s-mechom',
    militia_banner: 'engeln-opolchenets-so-shlemom',
    militia_crossbow: 'engeln-opolchenets-s-arbaletom',
    exonaut_spear: 'engeln-ekzonat-s-kopiom',
    exonaut_sword: 'engeln-ekzonat-s-mechom',
    exonaut_spear_breylon: 'engeln-ekzonat-s-kopiom',
    exonaut_sword_breylon: 'engeln-ekzonat-s-mechom',
    ranger_swordsman: 'engeln-reindzher-s-mechom',
    rob_liberated_ogrid: 'engeln-boevoy-pes',
    thunderbird: 'engeln-burevestnik-angelyna',
    thunderbird_crossbow: 'engeln-strelok-angelyna',
    stingray_captain: 'engeln-iris-jorvik-soar',
    ekzo_efirnat_lightning: 'engeln-kondensator-molniy',
    siege_golem: 'engeln-osadnyy-golem-angelyna',
    ekzoknight_two_swords: 'engeln-ekzo-rytsar-mechami',
    ekzoknight_spear: 'engeln-ekzo-rytsar-kopiom',
    ekzoknight_shield: 'engeln-ekzo-rytsar-shchit-mech',
    ekzoknight_twohanded_sword: 'engeln-ekzo-rytsar-dvuruchnyy-mech',
    ekzoknight_heavy_gun: 'engeln-ekzo-rytsar-tyazhelyy-grozomet',
    olverton: 'engeln-devring-olverton',
    condesator_of_lightning: 'engeln-kondensator-molniy',
    servidim_sword_shield: 'engeln-servidim-shield-sword',
    servidim_swords: 'engeln-servidim-dual-swords',
    servidim_shooter: 'engeln-servidim-grozomet',
  };
  return m[tech] ?? null;
}

function prioryTech(tech) {
  const m = {
    coast_guard_cannon: 'priory_of_hope-strazh-poberezhya-s-kulverinoy',
    coast_guard_halberd: 'priory_of_hope-strazh-poberezhya-s-alebardoy',
    coast_guard_musket: 'priory_of_hope-strazh-poberezhya-so-sdvoennym-mushketom',
    coast_guard_assault_musket: 'priory_of_hope-strazh-poberezhya-so-shturmovym-mushketom',
    coast_guard_mace: 'priory_of_hope-strazh-poberezhya-s-bulavoy',
    coast_guard_officer: 'priory_of_hope-brigadir-strazhey-poberezhya',
    coast_guard_seeker: 'priory_of_hope-iskatel-strazhey-poberezhya',
    coast_guard_medic: 'priory_of_hope-sanador-strazhey-poberezhya',
    ferran_infantry_unit: 'priory_of_hope-ricardo-ferran-lighthouse-keeper',
  };
  return m[tech] ?? null;
}

function castillaTech(tech) {
  const m = {
    guardsman_halberd: 'castilla-gvardeets-alebardist',
    marauder: 'castilla-dyavol-nalyotchik',
    hellhound: 'castilla-gonchaya-bezdny',
    saint_hunter: 'castilla-okhotnik-na-svyatykh',
    succubus: 'castilla-sukkub-porokov',
    flamethrower: 'castilla-ognemetchik-drakoniego-plameni',
    possessed_rider: 'castilla-oderzhimyy-naezdnik-i',
    guardsman_musketeer: 'castilla-gvardeets-mushketer',
    torquemad_2_unit: 'castilla-torkemad-revnitel-chistoty',
    guardsman_officer: 'castilla-ofitser-gvardii',
    flammalero_bigaxe: 'castilla-flammalero-sekira',
    flammalero_mortar: 'castilla-flammalero-mortira',
    flammalero_axes: 'castilla-flammalero-topory',
    possessed_rider_two_handed_axe: 'castilla-oderzhimyy-dvuruchnaya-sekira',
    possessed_rider_hand_mortar: 'castilla-oderzhimyy-naezdnik-mortira',
    gabrielit_monk: 'castilla-monakh-gabrielit',
    purifirer: 'castilla-ochistitel',
    hoakin_de_esperando_captan_of_targera: 'castilla-khoakin-de-esperando',
    siege_mortar: 'castilla-osadnaya-mortira',
    void_walker_flamethrower: 'castilla-razrushitel-tyazhelyy-ognemetchik',
    void_walker_hammer: 'castilla-razrushitel-molot',
    catimp: 'castilla-kattimp',
    catimp_gun: 'castilla-kattimp-s-pistoletom',
    imp_sword: 'castilla-kattimp',
    imp_grenade: 'castilla-kattimp-s-pistoletom',
    succubus_flamehands: 'castilla-sukkub-porokov',
    heavy_inquisitor_flamer: 'castilla-razrushitel-tyazhelyy-ognemetchik',
    inquisitor_sword: 'castilla-gvardeets-mushketer',
    sacrifice_monk: 'castilla-monakh-gabrielit',
    heavy_castilla_guard_halberd: 'castilla-gvardeets-alebardist',
    olverton: 'castilla-khoakin-de-esperando',
    castilla_guard_hand: 'castilla-gvardeets-alebardist',
    heavy_inquisitor_light_flamer: 'castilla-ognemetchik-drakoniego-plameni',
    heavy_inquisitor_hand: 'castilla-torkemad-revnitel-chistoty',
    heavy_inquisitor_swords: 'castilla-flammalero-topory',
    faceless_unit: 'castilla-bezlikiy-vladyka-nenavisti',
    flammalero_axes_torres: 'castilla-flammalero-topory',
    flammalero_bigaxe_torres: 'castilla-flammalero-sekira',
    flammalero_mortar_torres: 'castilla-flammalero-mortira',
    possessed_rider_torres: 'castilla-oderzhimyy-naezdnik-i',
    possessed_rider_two_handed_axe_torres: 'castilla-oderzhimyy-dvuruchnaya-sekira',
    possessed_rider_hand_mortar_torres: 'castilla-oderzhimyy-naezdnik-mortira',
    saint_hunter_salvador: 'castilla-okhotnik-na-svyatykh',
  };
  return m[tech] ?? null;
}

function broomgarTech(tech) {
  const m = {
    boiler_soup: 'broomgar-kotel-sup-bul-ragvy',
    boiler_fish: 'broomgar-kotel-ryba-ognevik',
    boiler_sausage: 'broomgar-kotel-kolbasy-burtaga',
    zurbag_butcher: 'broomgar-zurbag-myasnik',
    zurbag_devastator: 'broomgar-zurbag-razoritel',
    zurbag_conqueror: 'broomgar-zurbag-pokoritel',
    grrokh: 'broomgar-grrokh-ten-shaktana',
    gahai_spear: 'broomgar-gakhay-rogatina',
    gahai_sling: 'broomgar-gakhay-prasha',
    gahai_boomerang: 'broomgar-gakhay-bumerang',
    hogrim_tsereg_axe: 'broomgar-tsereg-tesak',
    hogrim_tsereg_maul: 'broomgar-tsereg-bulava',
    hogrim_daichin_spear: 'broomgar-daychin-znamenosets',
    hogrim_daichin_cleavers: 'broomgar-daychin-tesaki',
    hogrim_daichin_maul: 'broomgar-daychin-bulava',
    hogrim_mutsereg_axe: 'broomgar-mutsereg-topory',
    hogrim_mutsereg_cleavers: 'broomgar-mutsereg-sekira',
    hogrim_yargochin_sword: 'broomgar-yargachin-mech',
    hogrim_yargochin_maul: 'broomgar-yargachin-bulava',
    bibar_boptir_axe: 'broomgar-bibar-batyr-topory',
    bibar_boptir_bombard: 'broomgar-bibar-batyr-bombarda',
    hogrim_shaktan_gun: 'broomgar-shaktan-ruchnitsa',
    hogrim_shaktan_spear: 'broomgar-shaktan-trezubets',
  };
  return m[tech] ?? null;
}

function keldTech(tech) {
  const m = {
    dryadint_warrior: 'Dryadint-Warrior',
    dryadint_archer: 'Dryadint-Archer',
    dryadint_woodseer: 'Dryadint-Warrior',
    defender_seedlings: 'defender_seedlings',
    spirit_of_keld: 'Spirit-of-Keld',
    felidarn_sword: 'Blade-Dancer',
    felidarn_bow: 'Dryadint-Archer',
    felidarn_spear: 'Dryadint-Warrior',
    keld_hunter_claw: 'Keld Predator',
    keld_hunter_bow: 'Keld-Predator-with-bow',
    keld_hunter_glaive: 'Keld-Predator-with-glaive',
    keld_assassin_1: 'Blade-Dancer',
    keld_assassin_2: 'Silent-Blade',
    "na'atly_unit": "Na'atly-Wild-Huntress",
    virmgling: 'virmgling',
    voice_of_keld: 'Syld-Voice-of-Blackthorn',
    sild_seeder_keld: 'Syld-Seeder-Blackthorn',
    sild_protector_keld: 'Syld-Protector-blackthorn',
    sild_glaive_keld: 'Syld-Avenger-with-glaive-blackthorn',
    aent: 'Great-Aent-Sentry',
    alraune: 'Alraune-Blackthorn-seed',
    barkbeast: 'Undergrowth-Barkbeast',
    centaur_dryadint: 'Dryadint-centaur',
    thicket_guardian_sword: 'Undergrowth-Barkbeast',
    thicket_guardian_stone: 'Great-Aent-Sentry',
    kristoff_keller_who_discovered_life: 'krigmark-kristof-koller',
  };
  return m[tech] ?? null;
}

function krigmarkTech(tech) {
  const m = {
    untoten_1: 'krigmark-returned-mod-i',
    footsoldier_mace: 'krigmark-line-mace',
    frontline_healer: 'krigmark-field-medic',
    grenadier: 'krigmark-doomed-grenadier',
    jagdzombie: 'krigmark-yagdzombie',
    alchemist: 'krigmark-necro-alchemist',
    homunculus: 'krigmark-homunculus',
    kefer_modification_a: 'krigmark-kofer-mod-a',
    kefer_modification_b: 'krigmark-kofer-mod-b',
    kefer_modification_c: 'krigmark-kofer-mod-c',
    stosskrieger_1: 'krigmark-shock-mace',
    stosskrieger_2: 'krigmark-shock-launcher',
    stosskrieger_3: 'krigmark-shock-crossbow',
    immortal: 'krigmark-immortal',
    dalmar_shultz_unit: 'krigmark-dalmar-schulz',
    deathbringer: 'krigmark-death-bringer',
    abomination: 'krigmark-war-abomination',
    bolt_thrower: 'krigmark-heavy-crossbow',
    hundmeister: 'krigmark-hundmeister',
    twins_wolf: 'krigmark-wolf-baldauf',
    twins_verena: 'krigmark-verena-baldauf',
    stormtrooper_1: 'krigmark-stormtrooper-assault-carbine',
    stormtrooper_2: 'krigmark-stormtrooper-gubitel',
    stormtrooper_sergant: 'krigmark-feldwebel-stormtroopers',
    stormtrooper_reaper: 'krigmark-stormtrooper-gubitel',
    stormtrooper_reaper_sergant: 'krigmark-feldwebel-reapers',
    kristoff_keller_who_discovered_life: 'krigmark-kristof-koller',
  };
  return m[tech] ?? null;
}

function blackthornTech(tech) {
  const m = {
    alraune_blackthorn: 'Alraune-Blackthorn-seed',
    blackthorn_hunter_claw: 'Blackthorn-Predator',
    blackthorn_hunter_bow: 'Blackthorn-Predator-with-bow',
    blackthorn_hunter_glaive: 'Blackthorn-Predator-with-glave',
    blackthorn_assassin_2: 'Silent-Blade-blackthorn-card',
    barkbeast_blackthorn: 'Undergrowth-Barkbeast',
    centaur_dryadint_blackthorn: 'Dryadint-centaur',
    dal_hiar: 'DalHiar-Blackthorn-Hermit',
    defender_seedlings_blackthorn: 'Defender-of-Seedlings-blackthorn',
    sild_seeder: 'Syld-Seeder-Blackthorn',
    sild_protector: 'Syld-Protector-blackthorn',
    sild_glaive: 'Syld-Avenger-with-glaive-blackthorn',
    voice_of_blackthorn: 'Syld-Voice-of-Blackthorn',
    kristoff_keller_who_discovered_life: 'krigmark-kristof-koller',
  };
  return m[tech] ?? null;
}

function resolveByFaction(faction, tech) {
  if (GLOBAL_TECH[tech]) return GLOBAL_TECH[tech];
  if (faction === 'engeln') return engelnTech(tech);
  if (faction === 'priory_of_hope') return prioryTech(tech);
  if (faction === 'castilla') return castillaTech(tech);
  if (faction === 'chasm') return castillaTech(tech);
  if (faction === 'broomgar_horde') return broomgarTech(tech);
  if (faction === 'keld') return keldTech(tech);
  if (faction === 'krigmark') return krigmarkTech(tech);
  if (faction === 'blackthorn') return blackthornTech(tech);
  return null;
}

function buildNameIndex() {
  const exact = new Map();
  for (const f of fs.readdirSync(UNITS_DIR)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(UNITS_DIR, f), 'utf8'));
    const n = j.card?.name?.trim();
    if (n) exact.set(n, j.id);
  }
  return exact;
}

function placeholderId(faction, tech) {
  const safe = tech.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return `ab-ns-${faction.replace(/[^a-z0-9]/gi, '')}-${safe}`;
}

function makePlaceholderUnit({ id, displayName, points, faction }) {
  const dom = DOMAIN_OF[faction] ?? 'life';
  const kw = KEYWORD_OF[faction] ?? 'Army Builder';
  const flag = FACTION_FLAG[faction] ?? '/mercenaries.webp';
  return {
    id,
    points,
    card: {
      name: displayName,
      size: 'small',
      health: 5,
      maxHealth: 5,
      defense: { white: 1, green: 0 },
      walk: 3,
      run: 6,
      movementDistanceUnit: 'hex',
      domains: [dom],
      catalogUnitId: id,
      concentration: { red: 0, green: 0, black: 0, white: 0 },
      exploration: { red: 0, green: 0, black: 0, white: 0 },
      explorationRange: 0,
      grabRange: 1,
      defenseReaction: { white: 1, green: 0 },
      attacks: [],
      traits: [
        {
          name: 'Ростер Army Builder',
          description:
            'Карточка-заглушка: заданы только имя, очки и лимит из torn-world.com. Арт и игровые статы не заполнены.',
        },
      ],
      keywords: [kw, 'Army Builder'],
      flagSprite: flag,
      faithMarkers: { red: 0 },
    },
  };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const nameIndex = buildNameIndex();
  const leadersOut = new Map();
  const pendingPlaceholders = new Map();

  for (const hero of raw.leaders) {
    const leaderId = HERO_TECH_TO_LEADER[hero.hero_tech_name];
    if (!leaderId || leaderId === '__skip__') continue;

    const slots = [];
    for (const u of hero.units) {
      let unitId = nameIndex.get(u.name) ?? resolveByFaction(hero.faction.tech_name, u.tech_name);
      if (!unitId) {
        unitId = placeholderId(hero.faction.tech_name, u.tech_name);
        if (!pendingPlaceholders.has(unitId)) {
          pendingPlaceholders.set(
            unitId,
            makePlaceholderUnit({
              id: unitId,
              displayName: u.name,
              points: u.point_cost,
              faction: hero.faction.tech_name,
            })
          );
        }
      }
      slots.push({
        unitId,
        maxCopies: u.max_quantity,
        points: u.point_cost,
      });
    }

    leadersOut.set(leaderId, slots);
  }

  for (const p of pendingPlaceholders.values()) {
    const fp = path.join(UNITS_DIR, `${p.id}.json`);
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, JSON.stringify(p, null, 2), 'utf8');
      console.log('created placeholder', p.id);
    }
  }

  const leaders = JSON.parse(fs.readFileSync(LEADERS_PATH, 'utf8'));
  for (const L of leaders) {
    const ab = leadersOut.get(L.id);
    if (ab) {
      L.roster = ab;
    }
  }

  fs.writeFileSync(LEADERS_PATH, JSON.stringify(leaders, null, 2) + '\n', 'utf8');
  console.log('Updated leaders.json for', leadersOut.size, 'leaders');
}

main();
