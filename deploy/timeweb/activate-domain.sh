#!/bin/bash
# Включает HTTPS на coffeepassport.ru. Запускает workflow domain-https (mode=activate) на сервере:
#   bash activate-domain.sh <каталог с nginx-domain.conf и nginx-ip-redirect.conf>
# Повторный запуск безопасен: сертификат не перевыпускается раньше срока, env правится по ключам.
# Порядок важен — сборка с NEXT_PUBLIC_SUPABASE_URL на IP работает, пока IP не редиректит:
#   1) DNS: A апекса и www = IP, AAAA нет;  2) бэкап;  3) сертификат Let's Encrypt (webroot);
#   4) nginx домена (443) → nginx -t → reload;  5) адреса Supabase и приложения → домен;
#   6) пересборка Next.js (NEXT_PUBLIC_* вшиваются при сборке) → restart → /api/health по домену;
#   7) IP → 301 на домен → nginx -t → reload;  8) certbot renew --dry-run.
set -euo pipefail
src=${1:?usage: activate-domain.sh <dir with nginx confs>}
domain=coffeepassport.ru
ip=147.45.102.186
url=https://$domain
avail=/etc/nginx/sites-available

echo "== 1. DNS"
for h in "$domain" "www.$domain"; do
    v4=$(getent ahostsv4 "$h" | awk '{print $1}' | sort -u | tr '\n' ' ')
    v6=$(getent ahostsv6 "$h" | awk '{print $1}' | grep -v '^::ffff:' | sort -u | tr '\n' ' ' || true)
    echo "$h A: $v4 AAAA: ${v6:-none}"
    [ "$v4" = "$ip " ] || { echo "DNS: $h A = '$v4', ожидался $ip" >&2; exit 2; }
    [ -z "$v6" ] || { echo "DNS: у $h лишняя AAAA $v6 — удалить в панели DNS" >&2; exit 2; }
done

echo "== 2. backup"
backup=/opt/coffee-passport/backups/domain-https-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup"
cp -a /etc/nginx "$backup/nginx"
cp -a /opt/coffee-passport/app/.env.local "$backup/app.env"
cp -a /opt/coffee-passport/supabase/.env "$backup/supabase.env"
cp -a /opt/coffee-passport/app/.next "$backup/next"
echo "BACKUP=$backup"

install_site() { # $1 — файл из $src, $2 — имя в sites-available; при ошибке nginx -t вернуть прежний
    install -m 644 "$src/$1" "$avail/$2"
    if ! nginx -t; then
        cp -a "$backup/nginx/sites-available/$2" "$avail/$2"
        nginx -t && nginx -s reload
        echo "nginx -t не прошёл для $1 — прежний $2 возвращён" >&2
        exit 1
    fi
    nginx -s reload
}

echo "== 3. certificate"
docker run --rm --network host -v /etc/letsencrypt:/etc/letsencrypt -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/log/letsencrypt:/var/log/letsencrypt -v /var/www/coffee-passport-acme:/var/www/coffee-passport-acme \
    certbot/certbot:v5.4.0 certonly --webroot -w /var/www/coffee-passport-acme --non-interactive --agree-tos \
    --register-unsafely-without-email --cert-name coffee-passport-domain --keep-until-expiring --expand \
    -d "$domain" -d "www.$domain"
openssl x509 -in /etc/letsencrypt/live/coffee-passport-domain/cert.pem -noout -subject -dates -ext subjectAltName

echo "== 4. nginx: domain 443"
install_site nginx-domain.conf coffee-passport-domain
curl --fail --silent --show-error "$url/" -o /dev/null && echo "$url/ ok"

rollback() { # сбой на шагах 5–6: прежние env, runtime Supabase и сборка, рестарт; nginx домена остаётся
    echo "ROLLBACK: возвращаю env, Supabase runtime и .next из $backup" >&2
    cp -a "$backup/supabase.env" /opt/coffee-passport/supabase/.env
    cp -a "$backup/app.env" /opt/coffee-passport/app/.env.local
    (cd /opt/coffee-passport/supabase && python3 /opt/coffee-passport/app/deploy/timeweb/reconcile-public-url-runtime.py) || true
    rm -rf /opt/coffee-passport/app/.next && cp -a "$backup/next" /opt/coffee-passport/app/.next
    systemctl restart coffee-passport || true
}
trap rollback ERR

echo "== 5. public URLs → $url"
python3 - "$url" <<'PY'
import sys
from pathlib import Path
url = sys.argv[1]
p = Path('/opt/coffee-passport/supabase/.env')
lines = p.read_text().splitlines()
updates = {'SITE_URL': url, 'API_EXTERNAL_URL': url + '/supabase/auth/v1', 'SUPABASE_PUBLIC_URL': url + '/supabase'}
for i, line in enumerate(lines):
    key, _, value = line.partition('=')
    if key in updates:
        lines[i] = key + '=' + updates[key]
    if key == 'ADDITIONAL_REDIRECT_URLS':
        urls = [u for u in value.strip().strip('"').strip("'").split(',') if u]
        for u in (url + '/auth/callback', url + '/auth/reset-password'):
            if u not in urls:
                urls.append(u)
        lines[i] = key + '=' + ','.join(urls)
p.write_text('\n'.join(lines) + '\n')
p = Path('/opt/coffee-passport/app/.env.local')
lines = p.read_text().splitlines()
lines = [('NEXT_PUBLIC_SUPABASE_URL=' + url + '/supabase') if l.startswith('NEXT_PUBLIC_SUPABASE_URL=') else l for l in lines]
p.write_text('\n'.join(lines) + '\n')
PY
grep -hE '^(SITE_URL|API_EXTERNAL_URL|SUPABASE_PUBLIC_URL|ADDITIONAL_REDIRECT_URLS)=' /opt/coffee-passport/supabase/.env
grep -hE '^NEXT_PUBLIC_SUPABASE_URL=' /opt/coffee-passport/app/.env.local
(cd /opt/coffee-passport/supabase && python3 /opt/coffee-passport/app/deploy/timeweb/reconcile-public-url-runtime.py)

echo "== 6. rebuild Next.js"
cd /opt/coffee-passport/app
if ! npm run build > /opt/coffee-passport/logs/domain-https-build.log 2>&1; then
    tail -40 /opt/coffee-passport/logs/domain-https-build.log
    false # → rollback
fi
tail -5 /opt/coffee-passport/logs/domain-https-build.log
systemctl restart coffee-passport
deadline=$((SECONDS + 300))
until curl --fail-with-body --max-time 10 -sS "$url/api/health" 2>/dev/null | grep -qF '"status":"ok"'; do
    if [ "$SECONDS" -ge "$deadline" ]; then echo "/api/health по домену не ok за 5 минут" >&2; false; fi
    sleep 5
done
curl -sS "$url/api/health"; echo
trap - ERR

echo "== 7. nginx: IP → $url"
install_site nginx-ip-redirect.conf coffee-passport
curl -sS -o /dev/null -w "https://$ip/ -> %{http_code} %{redirect_url}\n" "https://$ip/"

echo "== 8. renew dry-run"
docker run --rm --network host -v /etc/letsencrypt:/etc/letsencrypt -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/log/letsencrypt:/var/log/letsencrypt -v /var/www/coffee-passport-acme:/var/www/coffee-passport-acme \
    certbot/certbot:v5.4.0 renew --dry-run --no-random-sleep-on-renew
systemctl is-enabled coffee-passport-cert-renew.timer
echo "DOMAIN_HTTPS_ACTIVE $url; backup: $backup"
