# Деплой `fanglaw` на VPS Ubuntu 24.04

Этот файл описывает перенос текущего сервера `fanglaw` на VPS `5.129.247.170`.

## Что уже подготовлено в проекте

- Сервер читает `PORT`, `PUBLIC_URL`, `WORLD_ROOM_NAME`, `WORLD_KEY`.
- Для `pm2` добавлен [server/ecosystem.config.cjs](C:/Users/kuravella/Documents/GitHub/fanglaw/server/ecosystem.config.cjs).
- Для `nginx` добавлен шаблон [server/deploy/nginx/fanglaw.http.conf](C:/Users/kuravella/Documents/GitHub/fanglaw/server/deploy/nginx/fanglaw.http.conf).
- Клиент читает endpoint из [client/server_config.cfg](C:/Users/kuravella/Documents/GitHub/fanglaw/client/server_config.cfg).

## Временный вариант без домена

Пока домена нет, используйте:

- сервер: `http://5.129.247.170`
- клиент: `ws://5.129.247.170:2567`

Это подходит для desktop-теста Godot. Для браузерного релиза потом нужен домен и `https/wss`.

## 1. Подключение к VPS

На Windows:

```powershell
ssh root@5.129.247.170
```

## 2. Базовая подготовка системы

После входа на VPS:

```bash
apt update
apt upgrade -y
apt install -y git curl nginx ufw
```

## 3. Установка Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

Ожидается `node 22.x`.

## 4. Установка PM2

```bash
npm install -g pm2
pm2 -v
```

## 5. Загрузка проекта

```bash
cd /root
git clone https://github.com/iamx67/fanglaw.git
cd /root/fanglaw/server
```

Если репозиторий уже существует:

```bash
cd /root/fanglaw
git pull
cd /root/fanglaw/server
```

## 6. Установка зависимостей и сборка

```bash
npm ci
npm run build
```

Если `npm ci` ругается на lockfile, используйте:

```bash
npm install
npm run build
```

## 7. Проверка сервера без PM2

```bash
PORT=2567 PUBLIC_URL=http://5.129.247.170:2567 npm run start
```

Во втором SSH-окне:

```bash
curl http://127.0.0.1:2567/
```

Ожидается JSON с `ok: true`.

Остановить тест: `Ctrl+C`.

## 8. Запуск через PM2

```bash
cd /root/fanglaw/server
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs fanglaw-server
```

Сохранить автозапуск:

```bash
pm2 save
pm2 startup
```

Выполните команду, которую покажет `pm2 startup`, затем ещё раз:

```bash
pm2 save
```

## 9. Настройка firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

Если нужен прямой тест без nginx:

```bash
ufw allow 2567/tcp
```

Но для постоянной схемы лучше оставить наружу только `22`, `80`, `443`.

## 10. Подключение nginx

Скопируйте шаблон:

```bash
cp /root/fanglaw/server/deploy/nginx/fanglaw.http.conf /etc/nginx/sites-available/fanglaw
ln -s /etc/nginx/sites-available/fanglaw /etc/nginx/sites-enabled/fanglaw
nginx -t
systemctl reload nginx
```

Теперь сервер должен отвечать по:

```bash
curl http://5.129.247.170/
```

## 11. Переключение клиента на VPS

Откройте [client/server_config.cfg](C:/Users/kuravella/Documents/GitHub/fanglaw/client/server_config.cfg) и поставьте:

```ini
[network]
endpoint="ws://5.129.247.170:2567"
```

После этого Godot-клиент будет подключаться к VPS.

## 12. Что проверить руками

1. Сервер отвечает по `http://5.129.247.170/`
2. Клиент входит в мир
3. Второй клиент тоже входит
4. Игроки видят друг друга
5. Движение работает
6. Быстрый reconnect работает
7. На VPS создаётся файл `server/data/players.json`

## 13. Полезные команды

```bash
pm2 status
pm2 logs fanglaw-server
pm2 restart fanglaw-server
systemctl status nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

## 14. Что делать следующим этапом

После того как сервер стабильно заработает по IP:

1. Привязать домен к VPS
2. Выпустить HTTPS-сертификат
3. Переключить клиент на `wss://ваш-домен`
4. Добавить бэкап `server/data/players.json`
