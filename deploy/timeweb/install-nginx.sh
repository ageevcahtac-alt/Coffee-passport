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
if ! nginx -s reload; then
    restore
    echo "nginx -s reload не прошёл — прежние конфиги возвращены" >&2
    exit 1
fi
sleep 3 # reload асинхронный: проверка ниже не должна попасть в старые воркеры

# Тайл с самого сервера через домен: 200 image/png и тело — настоящий PNG, иначе откат.
tile=$(mktemp)
code=$(curl -sS -o "$tile" -w '%{http_code} %{content_type}' --max-time 60 https://coffeepassport.ru/tiles/0/0/0.png) || code="curl error $?"
magic=$(head -c 8 "$tile" | od -An -tx1 | tr -d ' \n')
echo "GET /tiles/0/0/0.png → $code, $(stat -c %s "$tile") байт"
rm -f "$tile"
if [ "$code" != "200 image/png" ] || [ "$magic" != 89504e470d0a1a0a ]; then
    # Разбор: ошибки nginx по тайлам (без адресов посетителей) и прямой запрос сервера к OSM.
    grep -E 'cp_tiles|tile\.openstreetmap|coffee-passport-tiles' /var/log/nginx/error.log 2>/dev/null | tail -n 15 \
        | sed -E 's/client: [^,]+,/client: -,/' || true
    for ipv in 4 6; do
        echo "curl -$ipv https://tile.openstreetmap.org/0/0/0.png → $(curl -"$ipv" -sS -o /dev/null --max-time 20 \
            -A 'CoffeePassport/1.0 (+https://coffeepassport.ru; tile proxy)' \
            -w '%{http_code} %{remote_ip}' https://tile.openstreetmap.org/0/0/0.png 2>&1 || true)"
    done
    restore
    echo "тайл не отдаётся — прежние конфиги возвращены" >&2
    exit 1
fi
