# Fanglaw Domain Model

Статус: актуально для текущего состояния проекта.

Этот документ фиксирует, как правильно называть сущности и как читать текущий код без путаницы.

## 1. Основные сущности

### Account

Аккаунт сайта и игры.

- таблица: `auth_accounts`
- идентификатор: `accountId`
- содержит email, password hash и ссылку на активного персонажа

### Character

Игровой персонаж аккаунта.

- таблица: `auth_characters`
- идентификатор: `characterId`
- принадлежит одному аккаунту
- хранит имя персонажа

### CharacterProfile

Профиль персонажа без внешности и без прогрессии.

- таблица: `character_profiles`
- поля первого этапа:
  - `tribe`
  - `gender`
  - `bio`

### CharacterAppearance

Внешность персонажа.

- таблица: `character_appearances`
- поля первого этапа:
  - `appearance_json`
  - `appearance_locked`
  - `appearance_version`
  - `locked_at`

### CharacterProgression

Игровая прогрессия персонажа.

- таблица: `character_progression`
- поля первого этапа:
  - `skills_json`

### AuthSession

Серверная auth-сессия.

- таблица: `auth_sessions`
- идентификатор: `sessionToken`
- используется сайтом, API и игрой

## 2. Runtime-термины

### `characterId`

Это главный доменный идентификатор персонажа.

В новом коде именно `characterId` считается правильным именем сущности.

### `playerId`

Это legacy runtime-имя для `characterId`.

Сейчас оно всё ещё встречается в:

- `WorldState.Player.playerId`
- room runtime
- legacy store API
- `player_profiles.player_id`

Правило:

- в текущем runtime `playerId` нужно читать как `characterId`
- нельзя придумывать для `playerId` отдельный бизнес-смысл

### `sessionId`

Это Colyseus-идентификатор конкретного сетевого подключения.

Правило:

- не является идентификатором аккаунта
- не является идентификатором персонажа
- не должен использоваться как ключ долгоживущих данных

### `reconnectionToken`

Это временный transport token для reconnect в рамках Colyseus.

Правило:

- это не auth token
- это не замена `sessionToken`
- это не доменный идентификатор

### `sessionToken`

Это текущий auth token первого этапа проекта.

Правило:

- сайт использует `sessionToken`
- API использует `sessionToken`
- игра использует `sessionToken`

Отдельный `gameToken` на текущем этапе не вводится.

## 3. Compatibility Contract

### 1. `player_profiles` — legacy aggregate

`player_profiles` больше не считается целевой доменной моделью.

Исторически там были смешаны:

- профиль персонажа
- внешность персонажа
- прогрессия персонажа
- world snapshot

Сейчас это transitional compatibility layer.

### 2. Postgres runtime уже читает split-модель

В PostgreSQL-режиме runtime персонажа теперь собирается из:

- `auth_characters`
- `character_profiles`
- `character_appearances`
- `character_progression`

`player_profiles` там остаётся для:

- world snapshot
- legacy fallback, если split-строка ещё отсутствует

### 3. File fallback пока остаётся legacy-совместимым

Если backend запущен без `DATABASE_URL`, используется файловое хранение.

Это значит:

- split-модель является основной архитектурной целью
- но file fallback пока ещё не отдельный split-store

### 4. Сайт и игра должны опираться на одну доменную модель

Сайт и игра должны говорить об одних и тех же сущностях:

- аккаунт
- персонаж
- профиль персонажа
- внешность персонажа
- прогрессия персонажа

Именно под это и был сделан разделённый flow:

- auth
- create character
- appearance
- game

## 4. Что считать устаревшим

Устаревшими считаются такие формулировки:

- “игрок просто входит по имени”
- “register сразу создаёт персонажа”
- “`sessionId` — это идентификатор игрока”
- “`player_profiles` — основная модель персонажа”

## 5. Практическое правило для нового кода

Если в новом коде или в новой документации используется слово `player`, нужно явно уточнять, что имеется в виду:

- runtime player entity в комнате
- персонаж (`Character`)
- аккаунт (`Account`)

Если это не уточнено, термин считается слишком размытым.
