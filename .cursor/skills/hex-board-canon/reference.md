# Схема каталога (справка)

Типы: `src/catalog/types.ts`, карточка: `UnitCardData` в `src/unitCard.ts`.

## `factions.json`

Массив объектов:

`id` совпадает с basename файла иконки (без `/` и `.webp`), например `/keld.webp` → `"id": "keld"`.

```json
{
  "id": "keld",
  "name": "Кельд",
  "domain": "life",
  "panelIconSrc": "/keld.webp"
}
```

## `leaders.json`

Массив объектов:

```json
{
  "id": "leader_id",
  "name": "Имя в UI",
  "factionId": "faction_snake_id",
  "catalogUnitId": "leader_unit_id",
  "roster": [{ "unitId": "troop_id", "maxCopies": 3 }]
}
```

## `units/*.json`

Корень — объект, ключ = `unitId`:

```json
{
  "unit_id": {
    "id": "unit_id",
    "points": 40,
    "card": {
      "name": "Display Name",
      "size": "small",
      "health": 6,
      "maxHealth": 6,
      "defense": { "white": 1 },
      "walk": 4,
      "run": 7,
      "sprite": "/path-under-public.webp",
      "domains": ["creation"],
      "concentration": {},
      "defenseReaction": { "white": 1 },
      "exploration": {},
      "grabRange": 1,
      "attacks": [
        {
          "name": "Attack",
          "range": 1,
          "attackRange": "melee",
          "damageType": "physical",
          "damage": 2,
          "dice": { "red": 1 },
          "modifiers": [{ "kind": "text", "label": "..." }]
        }
      ],
      "traits": [{ "name": "Trait", "description": "..." }],
      "keywords": ["Tag"]
    }
  }
}
```

Литералы: `size` — `small` | `big` | `large` | `huge`; `domains[]` — только четыре id домена; `attackRange` — `melee` | `ranged`; `damageType` — `physical` | `fire` | `mental` | `poison`; `modifier.kind` — `icon` | `text`.

Обязательное правило: ключ объекта === `"id"` записи.
