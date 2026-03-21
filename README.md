# Fanglaw

`Fanglaw` — многопользовательская игра про котов.

Сейчас проект уже не является старым минимальным прототипом “зайти по имени в комнату cats”. В репозитории есть:

- backend на `Node.js 22 + TypeScript + Colyseus + Express`
- сайт с flow `auth -> create character -> appearance`
- игровой клиент на Godot / GDScript
- миграции PostgreSQL
- новая доменная модель `Account / Character / CharacterProfile / CharacterAppearance / CharacterProgression`
- совместимость с legacy `player_profiles`, пока cleanup ещё не завершён

## Что уже работает

- регистрация и вход в аккаунт
- отдельное создание персонажа
- отдельный выбор внешности
- вход в игру по `sessionToken`
- сервер-авторитетный мир
- сохранение позиции, профиля, внешности и прогрессии
- Postgres backend с миграциями
- файловый fallback, если `DATABASE_URL` не задан

## Актуальный flow пользователя

1. Пользователь открывает `/`
2. Создаёт аккаунт или входит
3. Переходит на `/create-character.html`
4. Создаёт персонажа
5. Переходит на `/appearance.html`
6. Один раз сохраняет внешний вид
7. Запускает игру через `/catlaw.html`

## Структура репозитория

- `server/` — backend, API, Colyseus room, миграции, persistence, сервисы
- `client/` — Godot-клиент
- `site/` — статический сайт с auth/create-character/appearance flow
- `client/web_export/` — web-export игры, в том числе `catlaw.html`
- `docs/` — доменная модель, статус и migration plan

## Локальный запуск

### Backend

```bash
cd server
npm.cmd install
npm.cmd run dev
```

Backend по умолчанию слушает `http://localhost:2567`.

Если задан `DATABASE_URL`, backend использует PostgreSQL и новую split-модель данных.
Если `DATABASE_URL` не задан, используется файловый fallback.

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

Сайт поднимается на `http://127.0.0.1:4173/`.
Этот dev-server также раздаёт `client/web_export`, поэтому `http://127.0.0.1:4173/catlaw.html` открывает игру.

### Клиент Godot

Открыть папку `client/` в Godot и запускать проект оттуда.

## Где смотреть документацию

- [PROJECT_CONTEXT_RU.md](./PROJECT_CONTEXT_RU.md) — текущий контекст проекта
- [DEPLOY_NOW_RU.md](./DEPLOY_NOW_RU.md) — самый короткий деплой сайта и игры на `fanglaw1.ru`
- [docs/domain-model.md](./docs/domain-model.md) — термины и compatibility contract
- [docs/migration-plan.md](./docs/migration-plan.md) — какие этапы рефакторинга уже сделаны
- [docs/STATUS_RU.md](./docs/STATUS_RU.md) — короткий список того, что уже реализовано и что менялось недавно
- [site/README_RU.md](./site/README_RU.md) — сайт и его flow
- [client/web_export/README_RU.md](./client/web_export/README_RU.md) — web-export игры

## Что важно помнить

- В runtime поле `playerId` пока ещё существует, но по смыслу это legacy-имя для `characterId`
- `sessionId` и `reconnectionToken` не являются доменными идентификаторами персонажа
- `player_profiles` пока ещё не удалён, но это уже не целевая модель
- Для Postgres runtime игра уже читает персонажа из `auth_characters + character_profiles + character_appearances + character_progression`
- Файловый fallback пока остаётся legacy-совместимым
