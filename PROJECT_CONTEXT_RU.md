# Fanglaw: текущий контекст проекта

Этот документ нужен как быстрый и понятный вход в проект.

## 1. Что это за проект

`Fanglaw` — игра про котов с сайтом, аккаунтами, персонажами и отдельным игровым клиентом.

Сейчас это уже не “минимальный Catlaw”, где игрок просто вводил имя и появлялся в тестовой комнате.
Проект находится на стадии рабочего вертикального среза:

- есть сайт
- есть аккаунт
- есть персонаж
- есть выбор внешности
- есть вход в игру
- есть сервер-авторитетный мир
- есть persistence
- есть PostgreSQL-миграции

## 2. Что реально работает сейчас

### Сайт

Текущий flow сайта:

1. `/` — регистрация и вход
2. `/create-character.html` — создание персонажа
3. `/appearance.html` — выбор внешности

Сайт работает через backend API, а не как отдельная заглушка.

### Backend

Backend:

- поднимает HTTP API
- поднимает Colyseus room
- работает с аккаунтами, персонажами, сессиями
- сохраняет профиль персонажа, внешность и прогрессию
- поддерживает Postgres через `DATABASE_URL`
- умеет fallback в файл, если БД не настроена

### Игра

Клиент игры сейчас фактически написан на `GDScript`.
Визуал не переписывался под новую модель.

Игра уже умеет:

- входить по `sessionToken`
- работать с одним общим миром
- двигаться по сервер-авторитетной сетке
- использовать sprint/stamina
- читать `appearanceJson`
- читать `skillsJson`
- работать с prey/hunting mechanics

## 3. Текущая архитектура

### Сервер

- стек: `Node.js 22 + TypeScript + Colyseus + Express`
- entrypoint: `server/src/index.ts`
- room: `server/src/rooms/CatRoom.ts`
- schema: `server/src/rooms/schema/WorldState.ts`

### Сервисы

На уровне бизнес-логики уже есть сервисный слой:

- `AccountsService`
- `CharactersService`
- `CharacterProfileService`
- `AppearanceService`
- `ProgressionService`

Это значит, что `index.ts` и `CatRoom.ts` больше не должны ходить напрямую в низкоуровневый persistence за всем подряд.

### Persistence

Есть два режима:

1. `PostgreSQL backend`
2. `file fallback`

Для PostgreSQL уже существуют миграции и новая split-модель данных.

## 4. Доменные сущности

Текущая целевая модель:

- `Account` -> `auth_accounts`
- `Character` -> `auth_characters`
- `CharacterProfile` -> `character_profiles`
- `CharacterAppearance` -> `character_appearances`
- `CharacterProgression` -> `character_progression`
- `AuthSession` -> `auth_sessions`

Legacy-модель:

- `player_profiles`

Важно понимать:

- `characterId` — основной идентификатор персонажа
- `playerId` в runtime пока ещё существует, но фактически равен `characterId`
- `sessionId` Colyseus — это только идентификатор конкретного сетевого подключения
- `reconnectionToken` Colyseus — только временный transport token
- `sessionToken` — текущий auth token для сайта, API и входа в игру

## 5. Что уже сделано по рефакторингу модели данных

К этому моменту уже выполнены ключевые этапы:

- зафиксирована доменная терминология
- введена система миграций PostgreSQL
- созданы `character_profiles`, `character_appearances`, `character_progression`
- сделан backfill из legacy
- вынесен service layer
- разделены `register` и `create character`
- сайт переведён на новый flow
- игра в Postgres runtime переключена на новую split-модель данных

Это означает:

- игра продолжает получать те же `appearanceJson` и `skillsJson`
- но backend в Postgres-режиме теперь собирает персонажа не из одной legacy-кучи, а из новых таблиц

## 6. Что именно осталось legacy

Legacy пока ещё не вычищен полностью.

### `player_profiles`

Эта таблица остаётся как совместимость:

- хранит world snapshot
- помогает пережить переходный период
- используется как fallback, если split-строка ещё не создана

Но это уже не целевая доменная модель.

### File fallback

Если `DATABASE_URL` не задан, backend до сих пор работает через старый файловый формат.
Это сделано ради совместимости и простого локального запуска.

То есть:

- `Postgres runtime` уже на новой модели
- `file fallback` пока ещё legacy-совместимый

## 7. Локальный запуск

### Backend

```bash
cd server
npm.cmd run dev
```

По умолчанию:

- URL: `http://localhost:2567`

### Сайт

```bash
cd site
node dev-server.mjs
```

Резервный вариант:

```bash
cd site
python dev_server.py
```

По умолчанию:

- URL: `http://127.0.0.1:4173/`
- игра: `http://127.0.0.1:4173/catlaw.html`

### Godot-клиент

Открыть `client/` в Godot и запускать проект оттуда.

## 8. Что важно для дальнейшей работы

- Не возвращаться к старой модели “register сразу создаёт персонажа”
- Не трактовать `sessionId` как идентификатор игрока
- Не расширять `player_profiles`, если поле можно положить в новую split-модель
- Не ломать current wire format без отдельного cleanup-этапа
- Не считать файловый fallback источником долгосрочной архитектурной правды

## 9. Что ещё не завершено

- полный cleanup legacy `player_profiles`
- отказ от legacy-термина `playerId` в wire/runtime
- полноценный live-update между сайтом и игрой
- расширение доменной модели дальше базового профиля/внешности/прогрессии
- production-ready публичный режим с финальным `HTTPS/wss`

## 10. Куда смотреть дальше

- `README.md` — короткий overview
- `docs/domain-model.md` — точные термины
- `docs/migration-plan.md` — статус этапов рефакторинга
- `docs/STATUS_RU.md` — короткая сводка сделанного
- `site/README_RU.md` — сайт
- `client/web_export/README_RU.md` — web-export
