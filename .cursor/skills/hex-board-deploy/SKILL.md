---
name: hex-board-deploy
description: Migrates catalog editor export to static JSON, extracts inlined card images, verifies production build, pushes to main, and deploys the hex-board client to the VPS so new or edited units, leaders, and hotspot markup reach production. Use when the user asks to deploy, update production catalog, ship unit cards, sync hotspots, or run the catalog-to-repo pipeline before release.
---

# Деплой каталога юнитов и клиента (hex-board)

## Контекст

- **Редактор каталога** хранит черновики в `localStorage`. На прод для всех игроков нужны **файлы в репозитории** после миграции.
- **Скрипты** в корне: `npm run catalog:apply`, `npm run catalog:extract-images` (см. `scripts/apply-catalog-export.mjs`, `scripts/extract-catalog-base64-images.mjs`).
- **Сервер** пересобирает клиент при деплое; `roomServer` перезапускается только если менялись `package.json` / `package-lock.json` или `server/` (см. `deploy/deploy.sh`).

## Обязательная цепочка (карточки, юниты, лидеры, хотспоты)

Выполняй по порядку, пока не будет успешного `npm run build`.

### 1. Экспорт из приложения (всё должно попасть в один JSON)

Экспорт — это снимок **`localStorage`** (`getCatalogOverrides()`). Если что-то не сохранено в редакторе до нажатия «Экспорт», в файле этого не будет.

**Перед экспортом обязательно:**

1. **Новый юнит** — сохранить форму юнита (карточка, статы), чтобы он оказался в `newUnits`.
2. **Цена юнита** — поле **`points`** у юнита в форме (для `newUnits` это число; иначе в JSON не попадёт корректная цена).
3. **Ростер лидера** — у каждого слота задано **`maxCopies`** (сколько моделей доступно); при правках только через оверрайды это попадает в `newLeaders.roster` / `rosterAdditions` / `rosterSlotPatches`. После изменения лимитов не забудь, что оверрайды записались (UI сохраняет при blur и т.д.).
4. **Хотспоты** — разметить зоны и нажать **«Сохранить хотспоты»**, иначе в экспорте не будет ключа в `hotspots`.
5. **Свежий файл** — скачай JSON заново после правок; не используй старый файл из Downloads с прежней датой/размером (частая причина «не экспортировался юнит»).

- В UI: **экспорт** → `hex-board-catalog-overrides.json`.
- Сохрани файл под путём для `npm run catalog:apply` (или абсолютный путь).

После запуска `catalog:apply` смотри **первую строку сводки** в консоли (`newUnits=N, hotspots=…`). Если числа не совпадают с ожидаемыми — экспорт устарел или не всё сохранено в браузере.

### 2. Миграция в репозиторий

```bash
npm run catalog:apply -- path/to/hex-board-catalog-overrides.json
```

Опционально сначала: `npm run catalog:apply -- --dry-run path/to/...`

Скрипт обновляет:

- `src/catalog/units/<id>.json` — новые юниты и патчи к существующим (как в `getMergedCatalogUnit`);
- `src/catalog/leaders.json` — лидеры, ростер, скрытия, слоты;
- `src/catalog/hotspots/<unitId>.json` — разметка хотспотов из поля `hotspots` экспорта.

**Хотспоты на проде:** `getHotspotsForUnit` сначала смотрит **оверрайды в `localStorage`**, затем **`src/catalog/hotspots/<unitId>.json`**. Если на localhost зоны «не как на проде», часто в браузере лежат **старые хотспоты в localStorage** — сбрось оверрайды каталога или открой прод в режиме инкогнито. Имя файла = **id юнита**; файлы только в `public/card-hotspots/` с другим именем **не подхватываются** — перенеси в `src/catalog/hotspots/<unitId>.json`, поле `image` должно совпадать с тем же артом, по которому размечались зоны (иначе доли x/y/w/h «поедут»). Превью редактора и карточка в игре используют одинаковую модель координат (`uc-image-card-inner` + `uc-image-card-img`).

Если в экспорте **нет** записей в `hotspots`, но разметка лежит отдельно в `public/card-hotspots/` — перенеси её в `src/catalog/hotspots/<unitId>.json` вручную или добавь в экспорт и снова выполни `catalog:apply`.

### 3. Картинки карточек (не раздувать бандл)

Если в JSON юнитов остались строки **`data:image/...;base64,...`**:

```bash
npm run catalog:extract-images
```

Они выносятся в `public/catalog-units/<unitId>/...` и заменяются на URL вида `/catalog-units/...`. После этого основной JS-чанк должен оставаться сотни килобайт, а не несколько мегабайт.

Новые файлы под `public/` (не только из скрипта) — **добавить в git** вместе с JSON.

### 4. Проверка сборки

```bash
npm run build
```

При ошибке Workbox / precache из‑за гигантского чанка — сначала добейся выноса base64 (шаг 3).

### 5. Git и удалённый репозиторий

- `git add` всех изменений каталога, `public/`, при необходимости `vite.config.ts` / скриптов.
- Не коммитить `dist/` как замену прод-сборке, если в проекте принято собирать на сервере (см. README / `.gitignore`).
- Commit с понятным сообщением, **push в `main`** (или в ветку, из которой деплой тянет код).

### 6. Деплой на VPS

На машине с настроенным SSH (в репозитории в примере хост `tornscape`, путь приложения из `deploy/deploy.sh`):

```bash
ssh tornscape 'bash /var/www/hex-board-game/deploy/deploy.sh'
```

При смене домена/пути WebSocket можно переопределить `VITE_MP_WS_URL` (см. комментарии в `deploy/deploy.sh`).

### 7. После выката

- Жёсткое обновление страницы (кэш / SW), чтобы подтянулась новая версия клиента.

## Чеклист быстрой проверки

- [ ] В редакторе сохранены: юнит (`points`), слоты ростера (`maxCopies`), хотспоты («Сохранить хотспоты»).
- [ ] Скачан **новый** JSON после правок; в логе `catalog:apply` сводка (`newUnits` / `hotspots`) совпадает с ожиданием; предупреждений скрипта нет или они осознанны.
- [ ] Экспорт применён (`catalog:apply`).
- [ ] Нет лишнего base64 в юнитах или выполнен `catalog:extract-images`.
- [ ] `npm run build` без ошибок.
- [ ] Изменения запушены на удалённый репозиторий.
- [ ] Выполнен удалённый `deploy.sh`, в логе успешная сборка и при необходимости рестарт `hex-room-server`.

## Связанные материалы в репо

- `README.md` — варианты деплоя, `VITE_MP_WS_URL`, ограничения roomServer.
- `deploy/deploy.sh` — точные шаги на сервере.
- `.cursor/skills/hex-board-canon/` — канон данных каталога и терминология.
