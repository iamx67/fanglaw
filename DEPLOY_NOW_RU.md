# Быстрый Запуск Сайта И Игры На `fanglaw1.ru`

Это короткая инструкция без лишнего.

Что получится после этих шагов:

- `https://fanglaw1.ru/` — сайт с регистрацией
- `https://fanglaw1.ru/create-character.html` — создание персонажа
- `https://fanglaw1.ru/appearance.html` — выбор окраса
- `https://fanglaw1.ru/catlaw.html` — игра

## Нужно ли покупать облачную базу данных

Нет, прямо сейчас не нужно.

Сайт и игра могут работать без облачной БД.
Сервер умеет сохранять данные в локальные файлы на VPS.

Если позже захочется более надёжный прод:

- либо ставьте PostgreSQL прямо на VPS
- либо подключайте managed PostgreSQL

Но для запуска сайта + регистрации + игры это не обязательно.

## Что сделать у себя на компьютере

### 1. Сначала отправить изменения в GitHub

Если вы потом делаете на VPS `git pull`, сначала нужно запушить изменения с компьютера.

Минимально:

```bash
cd C:\Users\kuravella\Documents\GitHub\fanglaw
git status
git add .
git commit -m "Prepare fanglaw1.ru deploy"
git push
```

`git add .` используйте только если в репозитории нет лишних незаконченных правок.

Если у вас уже всё закоммичено и запушено, этот шаг пропустите.

### 2. Собрать web-версию игры

В Godot сделайте обычный Web export так, чтобы в папке `client/web_export` лежали:

- `catlaw.html`
- `catlaw.js`
- `catlaw.wasm`
- `catlaw.pck`

## Что вставить на VPS

Подключение:

```bash
ssh root@5.129.247.170
```

### 3. Обновить проект

```bash
cd /root/fanglaw
git pull
```

### 4. Самый простой способ обновления

Один раз дайте скрипту право на запуск:

```bash
chmod +x /root/fanglaw/scripts/vps_update_fanglaw1.sh
```

Потом запускайте так:

```bash
/root/fanglaw/scripts/vps_update_fanglaw1.sh
```

Этот скрипт сам:

- сделает `git pull`
- пересоберёт backend
- перезапустит `pm2`
- скопирует сайт и игру в web-root
- один раз поправит nginx под новый сайт
- проверит и перезагрузит `nginx`

### 5. Если хотите делать всё руками

```bash
cd /root/fanglaw/server
npm install
npm run build
pm2 restart fanglaw-server --update-env
pm2 status
```

### 6. Обновить web-файлы

Эта команда удалит старый web-root и положит новый сайт + игру:

```bash
rm -rf /var/www/fanglaw-web/current/*
cp -r /root/fanglaw/site/. /var/www/fanglaw-web/current/
cp -r /root/fanglaw/client/web_export/. /var/www/fanglaw-web/current/
chown -R www-data:www-data /var/www/fanglaw-web
chmod -R 755 /var/www/fanglaw-web
```

### 7. Если вы не запускали основной скрипт и делаете всё руками

Этот шаг нужен один раз.

Запустите:

```bash
python3 /root/fanglaw/scripts/patch_vps_nginx_fanglaw1.py
```

Скрипт сам:

- сделает backup живого nginx-файла
- заменит `index catlaw.html;` на `index index.html;`
- заменит fallback `/catlaw.html` на `/index.html`
- добавит `location /api/`

После этого:

```bash
nginx -t
systemctl reload nginx
```

## Что проверить

Вставьте по очереди:

```bash
curl https://fanglaw1.ru/api-health
curl -I https://fanglaw1.ru/
curl -I https://fanglaw1.ru/catlaw.html
```

Если всё хорошо:

- `api-health` отвечает
- `/` открывает сайт
- `/catlaw.html` открывает игру

## Если сайт всё ещё открывает старую игру

Значит проблема почти всегда в одном из двух мест:

- в `/var/www/fanglaw-web/current` не были скопированы файлы из `site/`
- nginx ещё не был пропатчен скриптом

## Если что-то пойдёт не так, пришлите содержимое файла:

```bash
cat /etc/nginx/sites-available/fanglaw
```

И тогда можно будет дать точный готовый вариант без догадок.
