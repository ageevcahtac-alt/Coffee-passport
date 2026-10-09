"""Exercise installed Auth/PostgREST images against the isolated candidate.

Temporary containers bind only to localhost. No Cloud or working target writes.
Credentials/tokens stay in memory or a mode-600 environment file outside Git.
"""

import datetime
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    root = Path(sys.argv[1]).resolve()
    if root.parent != Path('/opt/coffee-passport/backups'):
        raise SystemExit('Unexpected backup directory')
    candidate = json.loads((root/'candidate-summary.json').read_text())['candidate_database']
    original = json.loads(subprocess.run(['docker','inspect','supabase-auth','supabase-rest'],capture_output=True,check=True).stdout)
    containers = []
    results = {}
    statuses = {}
    stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

    def query(sql):
        return subprocess.run(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',candidate,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,check=True).stdout.decode().strip()

    def request(port,path,token=None,data=None):
        headers={'Content-Type':'application/json'}
        if token:
            headers['Authorization']='Bearer '+token
        req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,headers=headers,data=None if data is None else json.dumps(data).encode())
        try:
            with urllib.request.urlopen(req,timeout=15) as response:
                content=response.read()
                return response.status,json.loads(content) if content else None
        except urllib.error.HTTPError as exc:
            # Error bodies can include identifying data; do not log or print them.
            return exc.code,None

    try:
        for item,port in zip(original,[19999,13001]):
            env=dict(line.split('=',1) for line in item['Config']['Env'] if '=' in line)
            replaced=[]
            for key in ['DATABASE_URL','GOTRUE_DB_DATABASE_URL','PGRST_DB_URI']:
                if key in env:
                    parsed=urllib.parse.urlsplit(env[key])
                    env[key]=urllib.parse.urlunsplit(parsed._replace(path='/'+candidate))
                    replaced.append(key)
            if not replaced:
                raise RuntimeError('No database URL to redirect')
            env_file=root/('verify-'+str(port)+'-'+stamp+'.env')
            env_file.touch(mode=0o600,exist_ok=False)
            env_file.write_text('\n'.join(key+'='+value for key,value in env.items())+'\n')
            name='cp-verify-'+str(port)+'-'+datetime.datetime.now().strftime('%H%M%S')
            network=next(iter(item['NetworkSettings']['Networks']))
            internal_port=9999 if port==19999 else 3000
            subprocess.run(['docker','run','-d','--rm','--name',name,'--label','coffee-passport.migration-verification=true',
                            '--network',network,'--env-file',str(env_file),'-p','127.0.0.1:'+str(port)+':'+str(internal_port),item['Config']['Image']],capture_output=True,check=True)
            containers.append(name)
        for attempt in range(20):
            try:
                status,_=request(19999,'/health')
                if status==200:
                    results['auth_health']=True
                    break
            except (urllib.error.URLError,ConnectionError):
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError('Auth did not become ready')

        # Public, deliberately hardcoded pilot fixtures are already part of the
        # project. Read the fixture password from code; never create Cloud users.
        import re
        fixture_file=Path('/opt/coffee-passport/app/lib/auth/pilotStaff.ts').read_text()
        password=re.search(r"PILOT_STAFF_PASSWORD = '([^']+)'",fixture_file).group(1)
        tokens={}
        for role,local in [('cafe_admin','cafe'),('roaster_admin','roaster'),('barista','barista'),('admin','admin')]:
            email=local+'@test.com'
            expected=query("SELECT id::text FROM auth.users WHERE email='"+email+"'")
            if not expected:
                results['login_'+role]='fixture_absent'
                continue
            status,session=request(19999,'/token?grant_type=password',data={'email':email,'password':password})
            ok=status==200 and session.get('user',{}).get('id')==expected
            results['login_'+role]=ok
            if not ok:
                continue
            tokens[role]=session['access_token']
            status,user=request(19999,'/user',tokens[role])
            results['get_user_'+role]=status==200 and user.get('id')==expected
            status,refreshed=request(19999,'/token?grant_type=refresh_token',data={'refresh_token':session['refresh_token']})
            results['refresh_'+role]=status==200 and refreshed.get('user',{}).get('id')==expected
            status,profile=request(13001,'/profiles?id=eq.'+expected+'&select=id,role',tokens[role])
            statuses['profile_role_'+role]=status
            results['profile_role_'+role]=status==200 and len(profile)==1 and profile[0].get('role')==role

        status,_=request(19999,'/token?grant_type=password',data={'email':'cafe@test.com','password':'deliberately-invalid-migration-probe'})
        results['invalid_password_rejected']=status==400
        env=dict(line.split('=',1) for line in original[0]['Config']['Env'] if '=' in line)
        # Unauthenticated requests must not read Auth tables or private requests.
        status,requests=request(13001,'/partner_requests?select=id')
        private_rls=query("SELECT relrowsecurity FROM pg_class WHERE oid='public.partner_requests'::regclass")=='t'
        select_policies=int(query("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='partner_requests' AND cmd IN ('SELECT','ALL') AND roles && ARRAY['public','anon']::name[]"))
        # With SELECT granted and no SELECT policies, PostgREST correctly returns
        # an empty array. HTTP 200 does not mean that private rows are visible.
        results['anonymous_partner_requests_read_protected']=status in [401,403] or (status==200 and requests==[] and private_rls and select_policies==0)
        status,_=request(13001,'/profiles',data={'id':'00000000-0000-0000-0000-000000000000','role':'admin'})
        results['anonymous_profile_promotion_rejected']=status in [401,403]
        status,shops=request(13001,'/coffee_shops?select=id')
        statuses['anonymous_public_shops_read']=status
        results['anonymous_public_shops_read']=status==200 and isinstance(shops,list)

        failures=[key for key,value in results.items() if value is not True]
        report={'candidate_database':candidate,'results':results,'http_statuses':statuses,'failures':failures,'temporary_containers_removed_on_exit':True}
        path=root/('candidate-api-verification-'+stamp+'.json')
        path.touch(mode=0o600,exist_ok=False);path.write_text(json.dumps(report,indent=2))
        for key,value in results.items():
            print('CHECK',key,value,flush=True)
        print('CANDIDATE_API_FAILURES',failures,flush=True)
        if failures:
            raise SystemExit(1)
    finally:
        for name in containers:
            logs=subprocess.run(['docker','logs',name],capture_output=True)
            path=root/(name+'.log');path.touch(mode=0o600,exist_ok=False);path.write_bytes(logs.stdout+logs.stderr)
            subprocess.run(['docker','stop','--time','10',name],capture_output=True,timeout=30)


if __name__=='__main__':
    main()
