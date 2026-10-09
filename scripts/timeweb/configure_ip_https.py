"""Provision an HTTPS IP endpoint without changing DNS or source services.

Configuration files are passed as base64 on stdin; no secrets are accepted.
Certbot is pinned because Ubuntu's packaged version lacks IP certificate support.
"""

import base64
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    files=json.load(sys.stdin)
    root=Path('/opt/coffee-passport/logs')/('https-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    root.mkdir(mode=0o700)

    def run(args,name,**kwargs):
        result=subprocess.run(args,capture_output=True,timeout=600,**kwargs)
        path=root/(name+'.log');path.touch(mode=0o600,exist_ok=False);path.write_bytes(result.stdout+result.stderr)
        print('HTTPS_STEP',name,'exit',result.returncode,flush=True)
        if result.returncode:
            raise SystemExit('HTTPS_STEP_FAILED; private log '+str(path))
        return result

    if not shutil.which('nginx'):
        env=os.environ.copy();env['DEBIAN_FRONTEND']='noninteractive'
        run(['apt-get','install','-y','nginx'],'install-nginx',env=env)
    webroot=Path('/var/www/coffee-passport-acme');webroot.mkdir(parents=True,exist_ok=True)
    acme_config='''server {
    listen 80 default_server;
    server_name 147.45.102.186;
    location /.well-known/acme-challenge/ { root /var/www/coffee-passport-acme; }
    location / { return 503; }
}
'''
    default=Path('/etc/nginx/sites-enabled/default')
    if default.is_symlink():
        (root/'packaged-default-link.txt').write_text(str(default.readlink()))
        default.unlink()  # Packaged file in sites-available remains available.
    config=Path('/etc/nginx/sites-available/coffee-passport')
    if config.exists():
        saved=root/'nginx-before.conf';saved.touch(mode=0o600,exist_ok=False);saved.write_bytes(config.read_bytes())
    config.write_text(acme_config)
    link=Path('/etc/nginx/sites-enabled/coffee-passport')
    if not link.exists():
        link.symlink_to(config)
    run(['nginx','-t'],'http-config-check')
    run(['systemctl','enable','--now','nginx'],'enable-nginx')
    run(['systemctl','reload','nginx'],'reload-http')
    image='certbot/certbot:v5.4.0'
    check=subprocess.run(['docker','image','inspect',image],capture_output=True)
    if check.returncode:
        run(['docker','pull',image],'pull-certbot')
    cert_args=['docker','run','--rm','--network','host',
               '-v','/etc/letsencrypt:/etc/letsencrypt','-v','/var/lib/letsencrypt:/var/lib/letsencrypt',
               '-v','/var/log/letsencrypt:/var/log/letsencrypt','-v','/var/www/coffee-passport-acme:/var/www/coffee-passport-acme',image]
    cert=Path('/etc/letsencrypt/live/coffee-passport-ip/fullchain.pem')
    if not cert.exists():
        run(cert_args+['certonly','--non-interactive','--agree-tos','--register-unsafely-without-email',
                       '--preferred-profile','shortlived','--webroot','--webroot-path','/var/www/coffee-passport-acme',
                       '--ip-address','147.45.102.186','--cert-name','coffee-passport-ip'],'issue-certificate')
    config.write_bytes(base64.b64decode(files['nginx-ip.conf']))
    run(['nginx','-t'],'https-config-check')
    run(['systemctl','reload','nginx'],'reload-https')
    for name in ['coffee-passport-cert-renew.service','coffee-passport-cert-renew.timer']:
        Path('/etc/systemd/system',name).write_bytes(base64.b64decode(files[name]))
    run(['systemctl','daemon-reload'],'systemd-reload')
    run(['systemctl','enable','--now','coffee-passport-cert-renew.timer'],'enable-renew-timer')
    run(cert_args+['renew','--cert-name','coffee-passport-ip','--dry-run','--no-random-sleep-on-renew'],'renewal-dry-run')
    run(['curl','--fail','--silent','--show-error','--output','/dev/null','--max-time','20','https://147.45.102.186/'],'trusted-https-check')
    print('HTTPS_IP_READY https://147.45.102.186; DNS_UNCHANGED',flush=True)


if __name__=='__main__':
    main()
