"""Apply public HTTPS URLs and audited Auth flags, then rebuild target Next.

Optional application env lines are read on stdin and stored only in protected
target env files. No credentials are printed. Database data is never modified.
"""

import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    payload=json.load(sys.stdin)
    app=Path('/opt/coffee-passport/app');backend=Path('/opt/coffee-passport/supabase')
    root=Path('/opt/coffee-passport/backups')/('runtime-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    root.mkdir(mode=0o700)
    allowed={'ADMIN_USER','ADMIN_PASSWORD','RESEND_API_KEY','PARTNER_NOTIFY_EMAIL','PARTNER_NOTIFY_FROM',
             'EVENTS_CRON_SECRET','EVENT_SOURCE_ICS_URLS','XO_STORE_INTEGRATION_SECRET',
             'XO_ADMIN_INTEGRATION_URL','XO_ADMIN_INTEGRATION_SECRET','NEXT_PUBLIC_PILOT_DEMO_ENABLED'}

    def private(name,data):
        path=root/name;path.touch(mode=0o600,exist_ok=False);path.write_bytes(data)
        return path

    def run(args,name,sensitive_stdout=False,**kwargs):
        result=subprocess.run(args,capture_output=True,timeout=900,**kwargs)
        private(name+'.log',result.stderr if sensitive_stdout else result.stdout+result.stderr)
        print('RUNTIME_STEP',name,'exit',result.returncode,flush=True)
        if result.returncode:
            raise SystemExit('RUNTIME_FAILED; protected log '+str(root/(name+'.log')))
        return result

    def parse(text):
        return {line.split('=',1)[0].strip():line.split('=',1)[1].strip().strip('"').strip("'")
                for line in text.splitlines() if '=' in line and not line.lstrip().startswith('#')}

    def update(text,values):
        lines=[];seen=set()
        for line in text.splitlines():
            key=line.split('=',1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else None
            if key in values:
                lines.append(key+'='+values[key]);seen.add(key)
            else:
                lines.append(line)
        lines.extend(key+'='+value for key,value in values.items() if key not in seen)
        return '\n'.join(lines)+'\n'

    app_old=(app/'.env.local').read_text();backend_old=(backend/'.env').read_text()
    private('app-env-before',app_old.encode());private('supabase-env-before',backend_old.encode())
    keys=parse(backend_old)
    app_values={'NEXT_PUBLIC_SUPABASE_URL':'https://147.45.102.186/supabase',
                'NEXT_PUBLIC_SUPABASE_ANON_KEY':keys['ANON_KEY'],'SUPABASE_SERVICE_ROLE_KEY':keys['SERVICE_ROLE_KEY']}
    source_lines=payload.get('application_env_lines',{})
    for key,line in source_lines.items():
        if key not in allowed or not isinstance(line,str) or '\n' in line or '\r' in line or line.split('=',1)[0].strip()!=key:
            raise SystemExit('Invalid application env line')
        # Keep original dotenv quoting/comments for optional credentials.
        app_values[key]=line.split('=',1)[1]
    backend_values={'SUPABASE_PUBLIC_URL':'https://147.45.102.186/supabase',
                    'API_EXTERNAL_URL':'https://147.45.102.186/supabase/auth/v1',
                    'SITE_URL':'https://147.45.102.186','ADDITIONAL_REDIRECT_URLS':'https://147.45.102.186/auth/callback',
                    'DISABLE_SIGNUP':'false','ENABLE_EMAIL_SIGNUP':'true','ENABLE_EMAIL_AUTOCONFIRM':'true',
                    'ENABLE_PHONE_SIGNUP':'false','ENABLE_PHONE_AUTOCONFIRM':'false','ENABLE_ANONYMOUS_USERS':'false'}
    (app/'.env.local').write_text(update(app_old,app_values));(app/'.env.local').chmod(0o600)
    (backend/'.env').write_text(update(backend_old,backend_values));(backend/'.env').chmod(0o600)
    inspected=json.loads(subprocess.run(['docker','inspect','supabase-auth'],capture_output=True,check=True).stdout)[0]
    labels=inspected['Config']['Labels'];compose=['docker','compose']
    for filename in labels['com.docker.compose.project.config_files'].split(','):
        path=Path(filename).resolve()
        if path.parent!=backend:
            raise SystemExit('Unexpected Compose file')
        compose+=['-f',str(path)]
    config=run(compose+['config','--format','json'],'compose-validation',sensitive_stdout=True,cwd=backend)
    services=json.loads(config.stdout)['services']
    for service in services.values():
        for port in service.get('ports',[]):
            if port.get('published') and port.get('host_ip') not in ['127.0.0.1','::1']:
                # Restore original env before stopping any service.
                (backend/'.env').write_text(backend_old);(app/'.env.local').write_text(app_old)
                raise SystemExit('Compose would publish a nonlocal backend port')
    run(compose+['up','-d','--no-deps','auth'],'apply-auth-config',cwd=backend)
    run(['tar','-czf',str(root/'next-build-before.tar.gz'),'.next'],'backup-next-build',cwd=app)
    (root/'next-build-before.tar.gz').chmod(0o600)
    run(['systemctl','stop','coffee-passport'],'stop-target-next')
    import os
    env=os.environ.copy();env.update(NEXT_TELEMETRY_DISABLED='1',NODE_OPTIONS='--max-old-space-size=1536')
    build=subprocess.run(['npm','run','build'],cwd=app,env=env,capture_output=True,timeout=900)
    private('next-build.log',build.stdout+build.stderr)
    print('RUNTIME_STEP next-build exit',build.returncode,flush=True)
    if build.returncode:
        # Restore the previous build and app env; leave the audited Auth URLs.
        (app/'.env.local').write_text(app_old)
        run(['tar','-xzf',str(root/'next-build-before.tar.gz')],'restore-previous-next-build',cwd=app)
        run(['systemctl','start','coffee-passport'],'restart-previous-next')
        raise SystemExit('TARGET_BUILD_FAILED; previous build restored')
    old_urls=[];leaked_keys=[]
    for path in (app/'.next/static').rglob('*.js'):
        text=path.read_text(errors='replace')
        if '127.0.0.1:8000' in text or 'https://vodmmtzclvqemcujwmdf.supabase.co' in text:
            old_urls.append(str(path.relative_to(app)))
        if keys['SERVICE_ROLE_KEY'] in text or keys['JWT_SECRET'] in text:
            leaked_keys.append(str(path.relative_to(app)))
    if old_urls or leaked_keys:
        import shutil
        shutil.move(str(app/'.next'),str(root/'rejected-next-build'))
        (app/'.env.local').write_text(app_old)
        run(['tar','-xzf',str(root/'next-build-before.tar.gz')],'restore-rejected-next-build',cwd=app)
        run(['systemctl','start','coffee-passport'],'restart-after-bundle-rejection')
        raise SystemExit('BUNDLE_CHECK_FAILED; details suppressed; previous build restored')
    dropin=Path('/etc/systemd/system/coffee-passport.service.d/listen-local.conf')
    dropin.parent.mkdir(parents=True,exist_ok=True)
    if dropin.exists():
        private('next-listener-before.conf',dropin.read_bytes())
    dropin.write_text('[Service]\nExecStart=\nExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1\n')
    run(['systemctl','daemon-reload'],'reload-next-service')
    run(['systemctl','start','coffee-passport'],'start-target-next')
    report={'public_url':'https://147.45.102.186/supabase','source_auth_flags_preserved':True,
            'source_optional_env_names':sorted(source_lines),'old_client_urls':old_urls,'leaked_server_keys':leaked_keys,
            'build_exit':build.returncode,'working_database_unchanged':True,'next_binds_localhost':True}
    private('runtime-summary.json',json.dumps(report,indent=2).encode())
    print('RUNTIME_CONFIGURED; NEXT_REBUILT; NO_OLD_API_URLS_OR_SERVER_KEYS_IN_CLIENT_BUNDLE',flush=True)
    print('RUNTIME_BACKUP_DIRECTORY',root,flush=True)


if __name__=='__main__':
    main()
