# Fanglaw Migration Plan

Статус: план первого большого рефакторинга почти доведён до рабочего результата.

Цель плана была простой: уйти от хаоса вокруг `player_profiles` и перейти к понятной схеме:

- `Account`
- `Character`
- `CharacterProfile`
- `CharacterAppearance`
- `CharacterProgression`

## Итог по этапам

### Этап 0. Терминология

Статус: `done`

Сделано:

- зафиксирована доменная терминология
- оформлен compatibility contract

Документ:

- `docs/domain-model.md`

### Этап 1. Миграции схемы

Статус: `done`

Сделано:

- добавлены `server/migrations/`
- добавлена таблица `schema_migrations`
- добавлены команды:
  - `npm run migrate`
  - `npm run migrate:status`
  - `npm run migrate:json-to-postgres`

### Этап 2. Новые таблицы персонажа

Статус: `done`

Сделано:

- `character_profiles`
- `character_appearances`
- `character_progression`

### Этап 3. Backfill из legacy

Статус: `done`

Сделано:

- backfill из `player_profiles` в новые таблицы
- JSON -> Postgres миграция умеет заполнять и новые таблицы

### Этап 4. Service layer

Статус: `done`

Сделано:

- `AccountsService`
- `CharactersService`
- `CharacterProfileService`
- `AppearanceService`
- `ProgressionService`

Результат:

- верхний уровень приложения больше не живёт напрямую на raw persistence-коде

### Этап 5. Разделение register и create character

Статус: `done`

Сделано:

- `POST /api/register` создаёт только аккаунт и сессию
- `POST /api/login` создаёт auth-сессию
- `GET /api/me` возвращает account + active character или `null`
- `POST /api/characters` создаёт персонажа отдельно
- `POST /api/me/appearance` сохраняет внешность отдельно

### Этап 6. Новый flow сайта

Статус: `done`

Сделано:

- `/` = auth
- `/create-character.html` = создание персонажа
- `/appearance.html` = выбор внешности

Результат:

- сайт соответствует новой модели “аккаунт отдельно, персонаж отдельно, внешность отдельно”

### Этап 7. Переключение игры на новую модель

Статус: `done` для PostgreSQL runtime

Сделано:

- Postgres runtime персонажа теперь собирается из:
  - `auth_characters`
  - `character_profiles`
  - `character_appearances`
  - `character_progression`
- игра продолжает получать те же `appearanceJson` и `skillsJson`
- визуальный рендер не переписывался

Важно:

- `player_profiles` пока ещё не удалён
- он остаётся как compatibility layer для world snapshot и fallback

## Что осталось после этапа 7

### Этап 8. Минимальный live-update

Статус: `partial`

Что уже есть:

- сайт может обновлять состояние через `GET /api/me`
- игра синхронизирует runtime через room state

Что ещё не сделано:

- полноценный push-канал site <-> game

### Cleanup после миграции

Статус: `pending`

Что ещё нужно:

- убрать чтение из legacy `player_profiles`, когда transitional период закончится
- постепенно убрать legacy-имя `playerId` из доменного слоя
- при необходимости выделить отдельный split-store и для file fallback

## Что это означает простыми словами

Главная цель уже достигнута:

- аккаунт отделён от персонажа
- внешность отделена от профиля
- прогрессия отделена от профиля
- сайт и игра опираются на одну и ту же доменную модель

То есть дальше уже можно развивать саму игру, а не бесконечно чинить архитектурный фундамент.
