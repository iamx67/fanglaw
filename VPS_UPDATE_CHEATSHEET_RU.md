# Шпаргалка: как обновлять `fanglaw` на VPS

VPS:

- IP: `5.129.247.170`
- домен: `fanglaw1.ru`
- проект: `/root/fanglaw`
- сервер: `/root/fanglaw/server`
- web-файлы: `/var/www/fanglaw-web/current`
- PM2-процесс: `fanglaw-server`

---

## 1. Самый частый случай: обычная обнова после `git push`

Если вы меняли серверный код или клиентский web-export и просто хотите подтянуть всё на VPS:

```bash
cd /root/fanglaw
git pull

cd /root/fanglaw/server
npm install
npm run build
pm2 restart fanglaw-server --update-env

rm -rf /var/www/fanglaw-web/current/*
cp -r /root/fanglaw/client/web_export/* /var/www/fanglaw-web/current/
chown -R www-data:www-data /var/www/fanglaw-web
chmod -R 755 /var/www/fanglaw-web
```

Это безопасный универсальный вариант.

Если у вас уже включён HTTPS через Certbot, не копируйте заново
`server/deploy/nginx/fanglaw1.ru.single-domain.http.conf` на VPS при обычной обнове.
Этот шаблон HTTP-only и перезапишет живой конфиг с `443`, после чего браузер снова увидит
`ERR_CONNECTION_REFUSED` на `https://fanglaw1.ru`.

---

## 2. Если менялся только сервер

Например:

- `server/src/...`
- `package.json`
- `tsconfig.json`
- логика комнаты

Тогда достаточно:

```bash
cd /root/fanglaw
git pull

cd /root/fanglaw/server
npm install
npm run build
pm2 restart fanglaw-server --update-env
```

---

## 3. Если менялся только сайт / web-export

Например:

- `client/web_export/*`
- web-сборка после нового Godot export

Тогда достаточно:

```bash
cd /root/fanglaw
git pull

rm -rf /var/www/fanglaw-web/current/*
cp -r /root/fanglaw/client/web_export/* /var/www/fanglaw-web/current/
chown -R www-data:www-data /var/www/fanglaw-web
chmod -R 755 /var/www/fanglaw-web

systemctl reload nginx
```

---

## 4. Если менялся nginx-конфиг

Например:

- `server/deploy/nginx/fanglaw1.ru.single-domain.http.conf`

Тогда:

```bash
cp /root/fanglaw/server/deploy/nginx/fanglaw1.ru.single-domain.http.conf /etc/nginx/sites-available/fanglaw
ln -sf /etc/nginx/sites-available/fanglaw /etc/nginx/sites-enabled/fanglaw
nginx -t
systemctl reload nginx
```

Важно:

- этот шаг безопасен только до настройки HTTPS;
- после настройки Certbot не перезаписывайте живой конфиг этим файлом без необходимости;
- если уже настроен `https://fanglaw1.ru`, правьте боевой конфиг осторожно или заново прогоняйте `certbot --nginx`.

---

## 5. Быстрая проверка после обновы

```bash
pm2 status
pm2 logs fanglaw-server --lines 50
curl http://127.0.0.1:2567/
curl http://fanglaw1.ru/api-health
curl -I http://fanglaw1.ru/
```

Если позже будет HTTPS, проверяйте так:

```bash
curl -I https://fanglaw1.ru/
curl https://fanglaw1.ru/api-health
```

---

## 6. Если сервер не поднялся

Проверка:

```bash
pm2 logs fanglaw-server --lines 100
cd /root/fanglaw/server
npm run build
```

Потом перезапуск:

```bash
pm2 restart fanglaw-server --update-env
```

---

## 7. Если сайт перестал открываться

Проверка:

```bash
nginx -t
systemctl status nginx --no-pager
tail -f /var/log/nginx/error.log
ls -la /var/www/fanglaw-web/current
```

Частая причина:

- web-файлы не были скопированы в `/var/www/fanglaw-web/current`

---

## 8. Если игра открывается, но backend не отвечает

Проверка:

```bash
pm2 status
curl http://127.0.0.1:2567/
curl http://fanglaw1.ru/api-health
```

Если `127.0.0.1:2567` жив, а домен нет:

- проблема в `nginx`

Если `127.0.0.1:2567` мёртв:

- проблема в `pm2` / серверной сборке

---

## 9. Полезные команды

```bash
cd /root/fanglaw
git status
git pull

cd /root/fanglaw/server
npm install
npm run build
pm2 restart fanglaw-server --update-env
pm2 status
pm2 logs fanglaw-server --lines 100

nginx -t
systemctl reload nginx
systemctl status nginx --no-pager
```

---

## 10. Главное правило

Порядок почти всегда такой:

1. `git pull`
2. `npm install`
3. `npm run build`
4. `pm2 restart fanglaw-server --update-env`
5. если менялся web-export — скопировать `client/web_export/*`
6. если менялся nginx и у вас уже есть HTTPS — не перезаписывать Certbot-конфиг HTTP-only шаблоном без необходимости
7. после правок nginx — `nginx -t && systemctl reload nginx`
