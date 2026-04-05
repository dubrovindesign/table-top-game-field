# Hex board game

Vite + TypeScript клиент и отдельный WebSocket-сервер комнат для мультиплеера (`server/roomServer.ts`).

## Локальная разработка

```bash
npm install
npm run dev
```

Нужны одновременно Vite и сервер комнат (скрипт `dev` запускает оба). Только клиент: `npm run dev:vite-only` (мультиплеер без `dev:server` не подключится к комнатам).

## Сборка

```bash
npm run build
```

Артефакты в `dist/`. Для **продакшена** задайте `VITE_MP_WS_URL` (см. ниже) в окружении или в `.env.production` до сборки — значение встраивается в бандл.

Шаблон переменных: [.env.example](.env.example).

## Деплой: выбор схемы

### Вариант A — один VPS (статика + reverse proxy + roomServer)

Подходит, если один сервер и свой домен.

1. На сервере: Node.js, Caddy или nginx, Git.
2. Клонировать репозиторий, в каталоге приложения:
   ```bash
   npm ci
   export VITE_MP_WS_URL='wss://ВАШ_ДОМЕН/__mp_ws'
   npm run build
   ```
3. Поднять **roomServer** постоянно (см. [deploy/hex-room-server.service](deploy/hex-room-server.service) — поправьте `User`, `WorkingDirectory`, путь к `npx`).
4. Настроить HTTPS и раздачу `dist/` + прокси WebSocket на `127.0.0.1:3333`:
   - пример Caddy: [deploy/Caddyfile.example](deploy/Caddyfile.example)
   - пример nginx: [deploy/nginx-site.example.conf](deploy/nginx-site.example.conf)

Путь **`/__mp_ws`** на прокси должен совпадать с URL в `VITE_MP_WS_URL`, если вы используете этот путь (как в примерах).

### Вариант B — статика отдельно, сокеты отдельно

1. **Статический хостинг** (Cloudflare Pages, Netlify, Vercel и т.д.):  
   - Build command: `npm run build`  
   - Publish directory: `dist`  
   - В настройках окружения задайте **`VITE_MP_WS_URL`** = публичный `wss://...` на ваш сервис с roomServer.
2. **Room server** на VPS / Railway / Fly.io / Render (нужен долгоживущий процесс и WebSocket):
   ```bash
   npm ci
   MP_PORT=3333 npm run start:room
   ```
   Или Docker: [docker-compose.yml](docker-compose.yml) (образ собирается из [deploy/Dockerfile.roomserver](deploy/Dockerfile.roomserver)). Снаружи обычно ставят TLS-прокси на `wss://`.

На странице по **https** браузер требует **wss**, не `ws` (иначе смешанный контент).

## Политика `dist/` в Git

Рекомендуется **не коммитить** `dist/`: собирать на хостинге или на сервере перед выкладкой. В репозитории добавлен [.gitignore](.gitignore) с `dist/`. Если `dist/` уже отслеживается, убрать из индекса (файлы останутся локально):

```bash
git rm -r --cached dist
```

Альтернатива — деплой только готовой папки `dist` (FTP и т.д.); тогда можно не игнорировать `dist/`, но дублировать артефакты в Git обычно неудобно.

## Проверка после выкладки

1. Открыть сайт с другой сети или устройства.
2. DevTools → Network → WS: должен быть успешный коннект на ожидаемый `wss://...`.
3. Создать комнату в мультиплеере — оба клиента должны видеть друг друга.

## Ограничения

- Один процесс `roomServer` держит комнаты **в памяти**; несколько инстансов без общего хранилища **не** дадут общие комнаты.
- Защиты комнат по паролю нет — любой с ID комнаты может подключиться.

## CI

[.github/workflows/build.yml](.github/workflows/build.yml) выполняет `npm ci` и `npm run build`. Опционально задайте в настройках репозитория секрет **`VITE_MP_WS_URL`**, чтобы прод-сборка в CI совпадала с продакшеном.
