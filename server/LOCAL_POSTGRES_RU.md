# Локальный PostgreSQL

Для проекта теперь подготовлен отдельный dev-кластер Postgres, который можно держать прямо рядом с репозиторием.

Плюсы такого варианта:

- не нужно трогать уже существующие системные базы;
- не нужен неизвестный пароль `postgres`;
- локальная dev-база живёт отдельно от будущего production.

## Что уже поддерживает сервер

Если задан `DATABASE_URL`, сервер хранит данные в Postgres.
Если `DATABASE_URL` не задан, остаётся файловый fallback.

Сейчас в Postgres переведены:

- `auth_accounts`
- `auth_characters`
- `auth_sessions`
- `player_profiles`

Файлы `server/data/auth.json` и `server/data/players.json` теперь нужны только как fallback, если убрать `DATABASE_URL`.

## Быстрый запуск локальной базы

Один раз:

```powershell
cd C:\Users\kuravella\Documents\GitHub\fanglaw\server
powershell -ExecutionPolicy Bypass -File .\scripts\local-db-init.ps1
```

Это сделает всё сразу:

- создаст локальный кластер в `server/.local-postgres/`
- поднимет его на `127.0.0.1:55432`
- создаст БД `fanglaw_local`
- запишет `server/.env`

После этого обычный запуск сервера:

```powershell
cd C:\Users\kuravella\Documents\GitHub\fanglaw\server
npm run dev
```

## Миграция старых JSON в Postgres

Если у вас уже были данные в:

- `server/data/auth.json`
- `server/data/players.json`

их можно перелить в Postgres одной командой:

```powershell
cd C:\Users\kuravella\Documents\GitHub\fanglaw\server
npm run migrate:json-to-postgres
```

Что делает команда:

- читает оба JSON-файла, если они существуют;
- делает `upsert` в Postgres, а не создаёт дубли;
- переносит `auth_accounts`, `auth_characters`, `auth_sessions`;
- переносит `player_profiles`;
- если для персонажа из auth нет записи в `players.json`, создаёт профиль с координатами `0, 0`.

## Повторный старт и остановка базы

Старт:

```powershell
cd C:\Users\kuravella\Documents\GitHub\fanglaw\server
powershell -ExecutionPolicy Bypass -File .\scripts\local-db-start.ps1
```

Остановка:

```powershell
cd C:\Users\kuravella\Documents\GitHub\fanglaw\server
powershell -ExecutionPolicy Bypass -File .\scripts\local-db-stop.ps1
```

## Подключение

Текущий локальный `DATABASE_URL` выглядит так:

```env
DATABASE_URL=postgresql://fanglaw_local@127.0.0.1:55432/fanglaw_local
```

## Что будет потом

Когда купите production Postgres, менять код почти не придётся:

1. меняете `DATABASE_URL`
2. при необходимости ставите `DATABASE_SSL=true`
3. поднимаете сервер уже с боевой БД

Локальная dev-база и production-база при этом остаются раздельными.
