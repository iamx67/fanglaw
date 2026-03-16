# Prod cache для Godot Web

Если браузерная версия долго грузится повторно, не копируйте на VPS
`fanglaw1.ru.single-domain.http.conf`. Этот шаблон специально отключает кеш
для активной разработки.

Для боевой или полу-боевой среды используйте:

- `server/deploy/nginx/fanglaw1.ru.single-domain.prod.conf`

Что делает `prod`-шаблон:

- `catlaw.html` всегда пере-проверяется браузером
- `catlaw.js`, `catlaw.wasm`, `catlaw.pck` кешируются локально и
  пере-проверяются через revalidation вместо полной перезагрузки
- websocket и `/matchmake/` остаются без изменений
- включается `gzip` для текстовых файлов и `wasm`

Как применить на VPS:

```bash
cd /root/fanglaw
git pull

cp /root/fanglaw/server/deploy/nginx/fanglaw1.ru.single-domain.prod.conf /etc/nginx/sites-available/fanglaw
ln -sf /etc/nginx/sites-available/fanglaw /etc/nginx/sites-enabled/fanglaw
nginx -t
systemctl reload nginx
```

Если у вас уже есть HTTPS-конфиг, не перезаписывайте его этим HTTP-only
шаблоном напрямую. В этом случае перенесите только блоки кеша в живой конфиг
с `443`.

Как проверить заголовки после обновления:

```bash
curl -I http://fanglaw1.ru/catlaw.html
curl -I http://fanglaw1.ru/catlaw.js
curl -I http://fanglaw1.ru/catlaw.wasm
curl -I http://fanglaw1.ru/catlaw.pck
```

Ожидаемо:

- для `catlaw.html`: `Cache-Control: no-cache, must-revalidate`
- для `catlaw.js`, `catlaw.wasm`, `catlaw.pck`:
  `Cache-Control: public, max-age=0, must-revalidate`
