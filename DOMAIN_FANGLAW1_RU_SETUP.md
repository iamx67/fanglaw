# `fanglaw1.ru`: запуск игры на одном домене

Этот сценарий рассчитан на один домен без отдельного `api.` поддомена.

Схема работы:

- `https://fanglaw1.ru` раздаёт сайт `auth -> create-character -> appearance`
- `https://fanglaw1.ru/catlaw.html` открывает web-клиент Godot
- тот же `fanglaw1.ru` проксирует Colyseus:
  - `POST /matchmake/...`
  - websocket-подключения `/<processId>/<roomId>?sessionId=...`

## Что уже подготовлено в проекте

- desktop-клиент по умолчанию смотрит на `ws://fanglaw1.ru`
- web-клиент автоматически берёт текущий хост страницы
- `pm2` конфиг использует `PUBLIC_URL=http://fanglaw1.ru`
- готов nginx-конфиг:
  [fanglaw1.ru.single-domain.http.conf](C:/Users/kuravella/Documents/GitHub/fanglaw/server/deploy/nginx/fanglaw1.ru.single-domain.http.conf)
  Это HTTP-only шаблон для первого запуска до Certbot. После настройки HTTPS не нужно
  копировать его поверх боевого конфига на VPS без необходимости, иначе пропадёт `443`.

## Что ещё нужно сделать руками

1. Убедиться, что DNS уже смотрит на VPS:
   - `A @ -> 5.129.247.170`
   - `A www -> 5.129.247.170`

2. На VPS заменить старый nginx-конфиг на доменный.

3. Локально сделать Godot Web export.

4. Залить в `/var/www/fanglaw-web/current` общий static-root:
   - `site/*`
   - `client/web_export/*`

5. Потом включить HTTPS и перевести клиент на `wss`.

После выпуска сертификата через `certbot --nginx` рабочий конфиг на VPS уже будет отличаться
от этого шаблона. Обычные обновления проекта после этого не требуют повторного копирования
HTTP-only файла в `/etc/nginx/sites-available/fanglaw`.

## Что изменится после HTTPS

- сайт будет открываться по `https://fanglaw1.ru`
- web-клиент сам начнёт использовать `wss://fanglaw1.ru`
- desktop-клиент можно будет тоже перевести на:

```ini
[network]
endpoint="wss://fanglaw1.ru"
```

Текущий nginx-шаблон уже содержит заголовки:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`

Они нужны Godot Web после перехода на HTTPS.

## Быстрые проверки после деплоя

- `http://fanglaw1.ru/api-health`
- страница `http://fanglaw1.ru/`
- вход в мир из браузера
- вход в мир из desktop-клиента

## Важно про имя стартового файла

Текущая web-сборка Godot экспортируется как:

- `index.html`
- `create-character.html`
- `appearance.html`
- `app.js`
- `styles.css`
- `assets/...`
- `catlaw.html`
- `catlaw.js`
- `catlaw.wasm`
- `catlaw.pck`

Поэтому nginx в этом проекте должен:

- отдавать `index.html` на `/`
- отдавать `catlaw.html` по пути `/catlaw.html`
- проксировать `/api/*` в backend
