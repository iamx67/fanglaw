# Fanglaw Site

Сайт больше не является отдельной заглушкой без backend.

Сейчас это frontend для account/character flow.

## Текущий flow

Страницы:

- `/` — регистрация и вход
- `/create-character.html` — создание персонажа
- `/appearance.html` — выбор и одноразовое сохранение внешности

Игра открывается отдельно:

- `/catlaw.html`

## Что делает сайт

Сайт:

- создаёт аккаунт
- логинит пользователя
- показывает текущую auth-сессию
- создаёт персонажа
- сохраняет внешность
- редиректит пользователя между шагами, если session/character ещё нет

## Какие API используются

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `POST /api/characters`
- `POST /api/me/appearance`

## Локальный запуск

### 1. Поднять backend

```bash
cd server
npm.cmd run dev
```

Ожидаемый backend:

- `http://localhost:2567`

### 2. Поднять сайт

Основной вариант:

```bash
cd site
node dev-server.mjs
```

Резервный вариант:

```bash
cd site
python dev_server.py
```

Ожидаемый адрес:

- `http://127.0.0.1:4173/`

## Важная деталь про dev-server

Локальный сервер сайта раздаёт не только файлы из `site/`, но и `client/web_export/`.

Поэтому локально доступны:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/create-character.html`
- `http://127.0.0.1:4173/appearance.html`
- `http://127.0.0.1:4173/catlaw.html`

## Guard-логика

### `/`

Если пользователь уже авторизован:

- без персонажа — уходит на `/create-character.html`
- с персонажем — уходит на `/appearance.html`

### `/create-character.html`

Если нет сессии:

- редирект на `/`

Если персонаж уже существует:

- редирект на `/appearance.html`

### `/appearance.html`

Если нет сессии:

- редирект на `/`

Если нет персонажа:

- редирект на `/create-character.html`

## Что хранится в localStorage

- `fanglaw.site.session_token` — текущий `sessionToken`
- `fanglaw.site.prototype.account` — последний auth payload
- `fanglaw.site.prototype.appearance.v3` — draft внешности до сохранения

## Что важно помнить

- аккаунт создаётся отдельно от персонажа
- персонаж создаётся отдельно от выбора внешности
- страница внешности не должна использоваться без созданного персонажа
- кнопка `Играть` ведёт на `/catlaw.html`
- шапка сайта сейчас обычная, без step-навигации
