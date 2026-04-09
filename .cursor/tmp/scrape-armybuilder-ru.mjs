/**
 * Собирает с armybuilder.torn-world.com (RU) домены → фракции → герои:
 *   available_units, available_spells («карты богов» в билдере), available_equipment.
 * Запуск: node .cursor/tmp/scrape-armybuilder-ru.mjs
 */

const BASE = 'https://armybuilder.torn-world.com';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'hex-board-catalog-helper/1.0',
  Cookie: 'locale=ru',
};

async function getJson(path, params = {}) {
  const u = new URL(path, BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) u.searchParams.set(k, String(v));
  });
  const res = await fetch(u, {
    headers: HEADERS,
    redirect: 'follow',
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${u.href} ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const domains = (await getJson('/rosters/select_domain.json')).domains;
  const out = {
    source: BASE,
    locale: 'ru',
    scrapedAt: new Date().toISOString(),
    leaders: [],
  };

  for (const domain of domains) {
    const { factions = [] } = await getJson('/rosters/select_factions.json', {
      domain_id: domain.id,
    });
    for (const faction of factions) {
      if (!faction.has_heroes) continue;
      const { heroes = [] } = await getJson('/rosters/select_heroes.json', {
        faction_id: faction.id,
      });
      for (const h of heroes) {
        const detail = await getJson('/rosters/hero_details.json', {
          hero_id: h.id,
        });
        const units = (detail.available_units ?? []).map((u) => ({
          tech_name: u.tech_name,
          name: u.name ?? u.name_ru,
          point_cost: u.point_cost,
          max_quantity: u.quantity,
        }));
        const god_cards = (detail.available_spells ?? []).map((s) => ({
          id: s.id,
          tech_name: s.tech_name,
          name: s.name ?? s.name_ru,
          max_quantity: s.quantity,
          domain_name: s.domain_name,
          weight: s.weight,
        }));
        const equipment = (detail.available_equipment ?? []).map((e) => ({
          id: e.id,
          tech_name: e.tech_name,
          name: e.name ?? e.name_ru,
          point_cost: e.point_cost,
          max_quantity: e.quantity,
          weight: e.weight,
        }));
        out.leaders.push({
          hero_id: detail.id,
          hero_tech_name: detail.tech_name,
          hero_name: detail.name ?? detail.name_ru,
          hero_point_cost: detail.point_cost,
          domain: { id: domain.id, tech_name: domain.tech_name, name: domain.name },
          faction: { id: faction.id, tech_name: faction.tech_name, name: faction.name },
          units,
          god_cards,
          equipment,
        });
      }
    }
  }

  return out;
}

const data = await main();
const outPath = new URL('./torn-armybuilder-ru-leaders.json', import.meta.url);
await import('fs/promises').then((fs) =>
  fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf8')
);
console.log('Wrote', outPath.pathname, 'leaders:', data.leaders.length);
