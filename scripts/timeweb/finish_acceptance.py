"""Back up and restore the accepted target; record health without secrets."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request

root=Path(sys.argv[1]).resolve()
if root.parent!=Path('/opt/coffee-passport/backups'):
    raise SystemExit('Unexpected backup directory')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')
run=root/('accepted-'+stamp);run.mkdir(mode=0o700)
def private(name,data):
    path=run/name;path.touch(mode=0o600);path.write_bytes(data if isinstance(data,bytes) else data.encode());return path
def command(args,name,data=None):
    r=subprocess.run(args,input=data,capture_output=True,timeout=300)
    private(name+'.log',r.stderr)
    if r.returncode: raise SystemExit('Operation failed: '+name+'; private log retained')
    return r.stdout
def query(db,sql):
    return json.loads(command(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],'query-'+hashlib.md5((db+sql).encode()).hexdigest()))
data=command(['docker','exec','supabase-db','pg_dump','-U','supabase_admin','-d','postgres','-Fc'],'accepted-dump')
archive=private('postgres.dump',data)
command(['pg_restore','--data-only','--file=/dev/null',str(archive)],'archive-read')
database='cp_accepted_'+stamp
command(['docker','exec','supabase-db','createdb','-U','supabase_admin','-T','template0',database],'create-restore')
command(['docker','exec','-i','supabase-db','pg_restore','-U','supabase_admin','-d',database,'--exit-on-error'],'accepted-restore',data)
tables=query('postgres',"SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
failures=[]
for table in tables:
    sql='SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public."'+table+'" t)s'
    if query('postgres',sql)!=query(database,sql): failures.append('backup_public_content_'+table)
sql="SELECT json_agg(x ORDER BY id) FROM (SELECT id,encrypted_password,email_confirmed_at FROM auth.users)x"
if query('postgres',sql)!=query(database,sql):failures.append('backup_users')
if query('postgres','SELECT count(*) FROM auth.users')!=14:failures.append('users_count')
containers=[json.loads(line) for line in command(['docker','ps','--format','json'],'docker-state').decode().splitlines()]
health={x['Names']:x['Status'] for x in containers if x['Names'].startswith('supabase-') or x['Names'].startswith('realtime-')}
if len(health)!=11 or any('(healthy)' not in value for value in health.values()):failures.append('docker_health')
for service in ['coffee-passport','nginx','coffee-passport-cert-renew.timer']:
    if command(['systemctl','is-active',service],service).strip()!=b'active':failures.append('service_'+service)
for name,args in [('next',['journalctl','-u','coffee-passport','--since','10 minutes ago','--no-pager']),('auth',['docker','logs','--since','10m','supabase-auth']),('rest',['docker','logs','--since','10m','supabase-rest'])]:
    r=subprocess.run(args,capture_output=True,timeout=30)
    content=r.stdout+r.stderr;private(name+'-runtime.log',content)
    if any(marker in content.lower() for marker in [b'panic:',b'uncaught exception',b'unhandledrejection',b'segmentation fault']):failures.append('fatal_log_'+name)
with urllib.request.urlopen('https://147.45.102.186',timeout=15) as response:
    if response.status!=200:failures.append('https')
report=json.loads((root/'working-summary.json').read_text())
report.update(acceptance='passed' if not failures else 'failed',accepted_backup=str(archive),accepted_backup_sha256=hashlib.sha256(data).hexdigest(),accepted_backup_restore_database=database,accepted_backup_restore_verified=not failures,container_health=health,acceptance_failures=failures,visual_browser_tested=False)
private('acceptance-summary.json',json.dumps(report,indent=2))
(root/'working-summary.json').write_text(json.dumps(report,indent=2))
print('ACCEPTED_BACKUP_RESTORE_VERIFIED',not failures,flush=True)
print('DOCKER_HEALTHY',len(health),flush=True)
print('ACCEPTANCE_FAILURES',failures,flush=True)
print('ACCEPTANCE_DIRECTORY',run,flush=True)
if failures:raise SystemExit(1)
