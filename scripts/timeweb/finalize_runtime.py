"""Close the direct HTTP listener and verify HTTPS and Storage lifecycle.

Only a uniquely named, disposable probe bucket/object is created and removed.
No existing buckets, files, users, application records or source services change.
"""

import base64
import datetime
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    app=Path('/opt/coffee-passport/app')
    root=Path(sys.argv[1]).resolve()
    if root.parent!=Path('/opt/coffee-passport/backups'):
        raise SystemExit('Unexpected backup directory')
    env={line.split('=',1)[0]:line.split('=',1)[1].strip().strip('"').strip("'")
         for line in (app/'.env.local').read_text().splitlines() if '=' in line and not line.lstrip().startswith('#')}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    results={}
    dropin=Path('/etc/systemd/system/coffee-passport.service.d/listen-local.conf')
    dropin.parent.mkdir(parents=True,exist_ok=True)
    content='[Service]\nExecStart=\nExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1\n'
    if dropin.exists() and dropin.read_text()!=content:
        backup=root/('listener-before-'+stamp+'.conf');backup.touch(mode=0o600,exist_ok=False);backup.write_bytes(dropin.read_bytes())
    if not dropin.exists() or dropin.read_text()!=content:
        dropin.write_text(content)
        subprocess.run(['systemctl','daemon-reload'],capture_output=True,check=True)
        subprocess.run(['systemctl','restart','coffee-passport'],capture_output=True,check=True)

    def request(url,method='GET',token=None,data=None,content_type='application/json',full=False):
        headers={}
        if token:
            headers={'apikey':token,'Authorization':'Bearer '+token}
        if data is not None:
            headers['Content-Type']=content_type
            data=data if isinstance(data,bytes) else json.dumps(data).encode()
        req=urllib.request.Request(url,method=method,headers=headers,data=data)
        try:
            with urllib.request.urlopen(req,timeout=20) as response:
                body=response.read()
                return response.status,body if full else (json.loads(body) if body else None)
        except urllib.error.HTTPError as exc:
            return exc.code,None

    for attempt in range(30):
        try:
            status,_=request('https://147.45.102.186/',full=True)
            if status==200:
                break
        except (urllib.error.URLError,ConnectionError):
            pass
        time.sleep(0.5)
    results['https_after_next_restart']=status==200
    listeners=subprocess.run(['ss','-lntH'],capture_output=True,check=True).stdout.decode()
    results['next_localhost_only']='127.0.0.1:3000' in listeners and not any(s in listeners for s in ['*:3000','0.0.0.0:3000','[::]:3000'])
    api=env['NEXT_PUBLIC_SUPABASE_URL'];anon=env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];service=env['SUPABASE_SERVICE_ROLE_KEY']
    status,settings=request(api+'/auth/v1/settings',token=anon)
    results['source_auth_flags_match']=status==200 and settings['mailer_autoconfirm'] and not settings['disable_signup'] and settings['external']['email'] and not settings['external']['phone']
    status,_=request(api+'/auth/v1/health',token=anon)
    results['auth_https_health']=status==200
    status,_=request('https://147.45.102.186/supabase/',full=True)
    results['studio_not_public']=status==404

    storage=api+'/storage/v1';bucket='migration-probe-'+secrets.token_hex(12);object_name='probe.txt'
    contents=b'Coffee Passport disposable Storage verification\n'+secrets.token_bytes(32)
    created=False;uploaded=False
    try:
        status,before=request(storage+'/bucket',token=service)
        results['storage_bucket_list']=status==200 and isinstance(before,list)
        status,_=request(storage+'/bucket',method='POST',token=service,data={'id':bucket,'name':bucket,'public':False})
        created=status in [200,201]
        results['storage_private_bucket_create']=created
        if not created:
            raise RuntimeError('Storage probe bucket creation failed')
        url=storage+'/object/'+bucket+'/'+object_name
        status,_=request(url,method='POST',token=service,data=contents,content_type='application/octet-stream')
        uploaded=status in [200,201]
        results['storage_upload']=uploaded
        status,download=request(url,token=service,full=True)
        results['storage_download_digest']=status==200 and hashlib.sha256(download).digest()==hashlib.sha256(contents).digest()
        status,_=request(storage+'/object/public/'+bucket+'/'+object_name,full=True)
        results['storage_private_public_read_rejected']=status in [400,401,403,404]
        status,signed=request(storage+'/object/sign/'+bucket+'/'+object_name,method='POST',token=service,data={'expiresIn':60})
        if status==200:
            # Signed URL is a credential. Keep it in memory, never print it.
            signed_url=signed.get('signedURL') or signed.get('signedUrl')
            status,download=request(storage+signed_url,full=True)
            results['storage_signed_download_digest']=status==200 and download==contents
        else:
            results['storage_signed_download_digest']=False
        status,_=request(storage+'/bucket/'+bucket,method='PUT',token=service,data={'public':True})
        results['storage_probe_public_bucket']=status==200
        status,download=request(storage+'/object/public/'+bucket+'/'+object_name,full=True)
        results['storage_public_download_digest']=status==200 and download==contents
    finally:
        if uploaded:
            status,_=request(storage+'/object/'+bucket,method='DELETE',token=service,data={'prefixes':[object_name]})
            results['storage_probe_object_cleanup']=status==200
        if created:
            status,_=request(storage+'/bucket/'+bucket,method='DELETE',token=service)
            results['storage_probe_bucket_cleanup']=status==200
        status,after=request(storage+'/bucket',token=service)
        results['storage_bucket_inventory_preserved']=status==200 and {b['id'] for b in after}=={b['id'] for b in before}
    failures=[key for key,value in results.items() if value is not True]
    path=root/('runtime-verification-'+stamp+'.json');path.touch(mode=0o600,exist_ok=False)
    path.write_text(json.dumps({'results':results,'failures':failures,'source_services_unchanged':True},indent=2))
    for key,value in results.items():
        print('RUNTIME_CHECK',key,value,flush=True)
    print('RUNTIME_FAILURES',failures,flush=True)
    if failures:
        raise SystemExit(1)


if __name__=='__main__':
    main()
