# `fanglaw1.ru`: запуск игры на одном домене

Этот сценарий рассчитан на один домен без отдельного `api.` поддомена.

Схема работы:

- `https://fanglaw1.ru` раздаёт web-клиент Godot
- тот же `fanglaw1.ru` проксирует Colyseus:
  - `POST /matchmake/...`
  - websocket-подключения `/<processId>/<roomId>?sessionId=...`

## Что уже подготовлено в проекте

- desktop-клиент по умолчанию смотрит на `ws://fanglaw1.ru`
- web-клиент автоматически берёт текущий хост страницы
- `pm2` конфиг использует `PUBLIC_URL=http://fanglaw1.ru`
- готов nginx-конфиг:
  [fanglaw1.ru.single-domain.http.conf](C:/Users/kuravella/Documents/GitHub/fanglaw/server/deploy/nginx/fanglaw1.ru.single-domain.http.conf)

## Что ещё нужно сделать руками

1. Убедиться, что DNS уже смотрит на VPS:
   - `A @ -> 5.129.247.170`
   - `A www -> 5.129.247.170`

2. На VPS заменить старый nginx-конфиг на доменный.

3. Локально сделать Godot Web export.

4. Залить экспорт на VPS в `/var/www/fanglaw-web/current`.

5. Потом включить HTTPS и перевести клиент на `wss`.

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

- `catlaw.html`
- `catlaw.js`
- `catlaw.wasm`
- `catlaw.pck`

Поэтому nginx в этом проекте должен отдавать именно `catlaw.html`, а не `index.html`.
