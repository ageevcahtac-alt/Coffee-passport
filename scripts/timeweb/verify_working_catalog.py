"""Verify application catalogs, post-test data and restart persistence."""
import ast
import datetime
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

root=Path(sys.argv[1]).resolve()
if root.parent!=Path('/opt/coffee-passport/backups'):
    raise SystemExit('Unexpected backup directory')
report=json.loads((root/'working-summary.json').read_text())
source_db=json.loads((root/'candidate-summary.json').read_text())['source_database']
def query(db,sql):
    r=subprocess.run(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,timeout=120)
    if r.returncode: raise SystemExit('Query failed; private output suppressed')
    return json.loads(r.stdout)
tree=ast.parse(Path('/root/cp-source-sql-audit.py').read_text())
queries=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='queries' for t in n.targets))
failures=[]
source_inventory=json.loads((root/'source-inventory.json').read_text())
for name in ['tables','columns','constraints','policies','rls','functions','triggers','grants','schema_acl','object_acl','default_acl']:
    sql="SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM ("+queries[name]+")s"
    def public_only(rows):
        # Database names are expected to differ. ACLs must be compared with the
        # live-source inventory: a full restore into template0 can retain its
        # default PUBLIC schema USAGE, which was not present in the Cloud ACL.
        selected=[{k:sorted(v) if isinstance(v,list) else v for k,v in x.items() if k!='table_catalog'} for x in rows if any(x.get(k)=='public' for k in ['schemaname','table_schema','nspname'])]
        return sorted((json.dumps(x,sort_keys=True) for x in selected))
    # Compare deparsed definitions under the same target search_path so auth
    # qualification differences (uid() vs auth.uid()) are not false failures.
    expected=source_inventory[name] if name in ['grants','schema_acl'] else query(source_db,sql)
    if public_only(expected)!=public_only(query('postgres',sql)): failures.append('catalog_'+name)
    print('CATALOG',name,name not in [x.removeprefix('catalog_') for x in failures],flush=True)
tables=query(source_db,"SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
for table in tables:
    sql='SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM public."'+table+'" t)s'
    if query('postgres',sql)!=query(source_db,sql): failures.append('content_'+table)
sql="SELECT json_agg(x ORDER BY id) FROM (SELECT id,encrypted_password,email_confirmed_at FROM auth.users)x"
if query('postgres',sql)!=query(source_db,sql): failures.append('users_ids_passwords_confirmation')
for name in ['auth.schema_migrations','storage.migrations']:
    schema,table=name.split('.')
    sql='SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM "'+schema+'"."'+table+'" t)s'
    if query('postgres',sql)!=report['before'][name]: failures.append('service_history_'+name)
for name,state in report['internal_before'].items():
    schema,table=name.split('.')
    sql='SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM "'+schema+'"."'+table+'" t)s'
    if query('_supabase',sql)!=state: failures.append('internal_database')
api=json.loads((root/'working-api-verification.json').read_text())
failures.extend(api['failures'])
if failures:
    print('PRE_RESTART_FAILURES',failures,flush=True)
else:
    subprocess.run(['docker','restart','supabase-auth','supabase-rest'],capture_output=True,check=True,timeout=90)
    subprocess.run(['systemctl','restart','coffee-passport'],capture_output=True,check=True,timeout=90)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('https://147.45.102.186',timeout=15) as response:
                if response.status==200: break
        except Exception: time.sleep(1)
    else: failures.append('app_restart_https')
    env=dict(line.split('=',1) for line in Path('/opt/coffee-passport/app/.env.local').read_text().splitlines() if line.startswith('NEXT_PUBLIC_SUPABASE_ANON_KEY='))
    # Gateway requires an API key even for Auth's health route.
    request=urllib.request.Request('https://147.45.102.186/supabase/auth/v1/health',headers={'apikey':env['NEXT_PUBLIC_SUPABASE_ANON_KEY'].strip().strip('"').strip("'")})
    for attempt in range(20):
        try:
            with urllib.request.urlopen(request,timeout=15) as response:
                if response.status==200: break
        except Exception: time.sleep(1)
    else: failures.append('auth_restart')
path=root/('working-catalog-verification-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.json')
path.touch(mode=0o600);path.write_text(json.dumps({'failures':failures,'catalogs':11,'public_tables':len(tables),'api_checks':len(api['results']),'restart_tested':not failures},indent=2))
print('FINAL_VERIFICATION_FAILURES',failures,flush=True)
if failures: raise SystemExit(1)
