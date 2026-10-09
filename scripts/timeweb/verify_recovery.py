"""Test native recovery on a disposable user in the isolated Auth candidate."""
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

root=Path(sys.argv[1]).resolve()
candidate=json.loads((root/'candidate-summary.json').read_text())['candidate_database']
item=json.loads(subprocess.run(['docker','inspect','supabase-auth'],capture_output=True,check=True).stdout)[0]
env=dict(line.split('=',1) for line in item['Config']['Env'] if '=' in line)
parsed=urllib.parse.urlsplit(env['GOTRUE_DB_DATABASE_URL'])
env['GOTRUE_DB_DATABASE_URL']=urllib.parse.urlunsplit(parsed._replace(path='/'+candidate))
app_env=dict(line.split('=',1) for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
key=app_env['SUPABASE_SERVICE_ROLE_KEY'].strip().strip('"').strip("'")
name='cp-recovery-verify-'+secrets.token_hex(4)
path=root/(name+'.env');path.touch(mode=0o600);path.write_text('\n'.join(k+'='+v for k,v in env.items())+'\n')
network=next(iter(item['NetworkSettings']['Networks']))
def request(route,data=None,token=key,method=None):
    req=urllib.request.Request('http://127.0.0.1:19999'+route,data=None if data is None else json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            content=response.read();return response.status,json.loads(content) if content else None
    except urllib.error.HTTPError as exc:return exc.code,None
user=None
try:
    subprocess.run(['docker','run','-d','--rm','--name',name,'--network',network,'--env-file',str(path),'-p','127.0.0.1:19999:9999',item['Config']['Image']],capture_output=True,check=True)
    for attempt in range(30):
        try:
            if request('/health')[0]==200:break
        except Exception:pass
        time.sleep(0.5)
    email='recovery-probe-'+secrets.token_hex(8)+'@example.com'
    status,created=request('/admin/users',{'email':email,'password':secrets.token_urlsafe(24),'email_confirm':True})
    if status not in [200,201]:raise SystemExit('RECOVERY_TEST_CREATE_FAILED')
    user=created['id']
    status,link=request('/admin/generate_link',{'type':'recovery','email':email})
    if status!=200:raise SystemExit('RECOVERY_LINK_TEST_FAILED')
    hashed=link['hashed_token']
    status,session=request('/verify',{'type':'recovery','token_hash':hashed})
    if status!=200 or session['user']['id']!=user:raise SystemExit('RECOVERY_VERIFY_TEST_FAILED')
    password=secrets.token_urlsafe(24)
    status,updated=request('/user',{'password':password},session['access_token'],'PUT')
    if status!=200 or updated['id']!=user:raise SystemExit('RECOVERY_PASSWORD_TEST_FAILED')
    status,login=request('/token?grant_type=password',{'email':email,'password':password})
    if status!=200 or login['user']['id']!=user:raise SystemExit('RECOVERY_LOGIN_TEST_FAILED')
    if request('/verify',{'type':'recovery','token_hash':hashed})[0]==200:raise SystemExit('RECOVERY_REPLAY_TEST_FAILED')
    print('RECOVERY_GENERATE_VERIFY_UPDATE_LOGIN_UUID_AND_REPLAY_TESTS_PASSED',flush=True)
finally:
    if user:
        status,_=request('/admin/users/'+user,method='DELETE')
        if status!=200:print('ISOLATED_PROBE_CLEANUP_FAILED',flush=True)
    subprocess.run(['docker','stop',name],capture_output=True,timeout=30)
    path.unlink(missing_ok=True)
