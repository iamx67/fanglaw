#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/root/fanglaw"
SERVER_DIR="$REPO_ROOT/server"
WEB_ROOT="/var/www/fanglaw-web/current"

echo "[1/5] Updating repository"
cd "$REPO_ROOT"
git pull

echo "[2/5] Building backend"
cd "$SERVER_DIR"
npm install
npm run build
pm2 restart fanglaw-server --update-env

echo "[3/5] Refreshing web root"
rm -rf "$WEB_ROOT"/*
cp -r "$REPO_ROOT/site/." "$WEB_ROOT/"
cp -r "$REPO_ROOT/client/web_export/." "$WEB_ROOT/"
chown -R www-data:www-data /var/www/fanglaw-web
chmod -R 755 /var/www/fanglaw-web

echo "[4/5] Reloading nginx"
python3 "$REPO_ROOT/scripts/patch_vps_nginx_fanglaw1.py"
nginx -t
systemctl reload nginx

echo "[5/5] Done"
echo "Open:"
echo "  https://fanglaw1.ru/"
echo "  https://fanglaw1.ru/catlaw.html"
