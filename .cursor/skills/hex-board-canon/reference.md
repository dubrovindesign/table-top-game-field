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
  "points": 70,
  "roster": [
    { "unitId": "troop_id", "maxCopies": 3 },
    { "unitId": "elite_id", "maxCopies": 1, "points": 50, "requiresUnitId": "controller_unit_id" }
  ]
}
```

- **`points`** на лидере (опционально): очки миниатюры лидера в лимит армии; если нет — берётся `points` записи `catalogUnitId` из каталога юнитов.
- **`points`** на слоте `roster` (опционально): очки этого отрядного юнита для данного лидера; если нет — `points` из `units/<unitId>.json`. Один и тот же `unitId` у разных лидеров может иметь разную стоимость. Не дублировать один `unitId` в `roster` одного лидера с разными `points` — используется первый найденный слот.
- **`requiresUnitId`** (опционально): слот доступен для добавления только если у этого лидера на поле уже есть хотя бы одна модель указанного `unitId` (счётчик армии).

## `units/<unit_id>.json` — один файл на юнит

Имя файла = `id` (например `tern_vanguard.json`). Корень файла — объект `CatalogUnitDef` (без внешней обёртки с ключом):

```json
{
  "id": "unit_id",
  "points": 40,
  "card": {
    "name": "Отображаемое имя",
    "size": "small",
    "health": 6,
    "maxHealth": 6,
    "defense": { "white": 1, "green": 0 },
    "walk": 4,
    "run": 7,
    "movementDistanceUnit": "hex",
    "flagSprite": "/castilla.webp",
    "faithMarkers": { "red": 1, "green": 1 },
    "sprite": "/path-under-public.webp",
    "domains": ["creation"],
    "concentration": { "red": 1 },
    "concentrationEtherCost": { "red": 1, "black": 1 },
    "defenseReaction": { "white": 1 },
    "defenseReactionEtherCost": { "blue": 2 },
    "exploration": { "white": 1 },
    "explorationEtherCost": { "red": 1 },
    "explorationRange": 1,
    "grabRange": 1,
    "grabEtherCost": { "red": 1 },
    "attacks": [
      {
        "name": "Attack",
        "range": 1,
        "attackRange": "melee",
        "damageType": "physical",
        "damage": 2,
        "dice": { "red": 1 },
        "etherCost": { "red": 1 },
        "ethereal": false,
        "areaAttack": false,
        "attackRangeUnit": "hex",
        "modifiers": [{ "kind": "text", "label": "..." }]
      }
    ],
    "traits": [{ "name": "Trait", "description": "..." }],
    "keywords": ["Тег на русском"],
    "transformsIntoUnitId": "other_unit_id"
  }
}
```

Литералы:

- `size` — `small` | `big` | `large` | `huge`
- `domains[]` — только четыре id домена
- `attackRange` — `melee` | `ranged`
- `damageType` — `physical` | `fire` | `mental` | `poison` | `cold` | `electric`
- `modifier.kind` — `icon` | `text`
- Пулы эфирных кристаллов (`etherCost`, `*EtherCost`, `faithMarkers`): `red`, `green`, `yellow`, `black`, `blue` (числа ≥ 0)

Сборка каталога: **`src/catalog/index.ts`** подхватывает все `./units/*.json` через `import.meta.glob` — **отдельно регистрировать импорт не нужно**.

Обязательное правило: поле **`id`** в корне файла уникально среди всех `units/*.json`.

## Ключевые слова

`card.keywords` — **русские** строки (как на карточке / для поиска в панели армии).
