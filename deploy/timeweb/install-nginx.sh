#!/bin/bash
# Ставит nginx-конфиги сайта из репозитория, если они отличаются от установленных:
#   nginx-tiles.conf  → /etc/nginx/sites-available/00-coffee-passport-tiles (+ ссылка в sites-enabled)
#   nginx-domain.conf → /etc/nginx/sites-available/coffee-passport-domain
# Запускается workflow deploy до update-app.sh (тайлы карты должны работать раньше, чем клиент на них
# переключится). Без отличий — ничего не делает. Иначе: бэкап /etc/nginx → установка → nginx -t →
# reload; не прошёл nginx -t — прежние файлы возвращаются, выход 1.
#   bash install-nginx.sh <каталог с nginx-tiles.conf и nginx-domain.conf>
set -euo pipefail
src=${1:?usage: install-nginx.sh <dir with nginx confs>}
avail=/etc/nginx/sites-available
enabled=/etc/nginx/sites-enabled
pairs=("nginx-tiles.conf:00-coffee-passport-tiles" "nginx-domain.conf:coffee-passport-domain")

changed=()
for pair in "${pairs[@]}"; do
    file=${pair%%:*} site=${pair#*:}
    if ! cmp -s "$src/$file" "$avail/$site" || [ ! -e "$enabled/$site" ]; then changed+=("$pair"); fi
done
if [ ${#changed[@]} -eq 0 ]; then
    echo "nginx: без изменений"
    exit 0
fi

backup=/opt/coffee-passport/backups/nginx-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a /etc/nginx "$backup/nginx"
echo "BACKUP=$backup"

restore() {
    rm -rf /etc/nginx/sites-available /etc/nginx/sites-enabled
    cp -a "$backup/nginx/sites-available" "$backup/nginx/sites-enabled" /etc/nginx/
    nginx -t && nginx -s reload
}

for pair in "${changed[@]}"; do
    file=${pair%%:*} site=${pair#*:}
    echo "== $file → $avail/$site"
    diff -u "$avail/$site" "$src/$file" || true
    install -m 644 "$src/$file" "$avail/$site"
    ln -sfn "$avail/$site" "$enabled/$site"
done

if ! nginx -t; then
    restore
    echo "nginx -t не прошёл — прежние конфиги возвращены" >&2
    exit 1
fi
nginx -s reload
sleep 3 # reload асинхронный: проверка ниже не должна попасть в старые воркеры

# Тайл с самого сервера через домен: 200 image/png или откат.
code=$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 60 https://coffeepassport.ru/tiles/0/0/0.png || true)
echo "GET /tiles/0/0/0.png → $code"
if [ "$code" != "200 image/png" ]; then
    restore
    echo "тайл не отдаётся — прежние конфиги возвращены" >&2
    exit 1
fi
