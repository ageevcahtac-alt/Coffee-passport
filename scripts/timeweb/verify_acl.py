"""Compare complete application SQL catalogs and effective schema ACLs."""
import ast
import datetime
import json
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
if root.parent!=Path('/opt/coffee-passport/backups'):
    raise SystemExit('Unexpected backup directory')
candidate=json.loads((root/'candidate-summary.json').read_text())
database=sys.argv[2] if len(sys.argv)>2 else candidate['candidate_database']
source=json.loads((root/'source-inventory.json').read_text())
tree=ast.parse(Path('/root/cp-source-sql-audit.py').read_text())
queries=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='queries' for t in n.targets))
def query(db,sql):
    r=subprocess.run(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,timeout=120)
    if r.returncode: raise SystemExit('Catalog query failed (private output suppressed)')
    return json.loads(r.stdout)
def normalize(rows):
    selected=[]
    for row in rows:
        if not any(row.get(k)=='public' for k in ['schemaname','table_schema','nspname']): continue
        item={k:sorted(v) if isinstance(v,list) else v for k,v in row.items() if k!='table_catalog'}
        selected.append(json.dumps(item,sort_keys=True))
    return sorted(selected)
results={}
for key in ['tables','columns','constraints','policies','rls','functions','triggers','grants','schema_acl','object_acl','default_acl']:
    sql="SELECT coalesce(json_agg(row_to_json(s)),'[]') FROM ("+queries[key]+")s"
    expected=source[key] if key in ['grants','schema_acl'] else query(candidate['source_database'],sql)
    results[key]=normalize(expected)==normalize(query(database,sql))
    print('SQL_ACL',key,results[key],flush=True)
roles=query(database,"SELECT json_agg(x ORDER BY rolname) FROM (SELECT rolname,rolinherit,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres','supabase_auth_admin','supabase_storage_admin','pg_database_owner'))x")
expected_roles={x['rolname']:x for x in source['roles']}
results['required_roles']=len(roles)==7 and all(x['rolinherit']==expected_roles[x['rolname']]['rolinherit'] and x['rolbypassrls']==expected_roles[x['rolname']]['rolbypassrls'] for x in roles)
print('SQL_ACL required_roles',results['required_roles'],flush=True)
failures=[k for k,v in results.items() if not v]
path=root/('acl-verification-'+database+'-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.json')
path.touch(mode=0o600);path.write_text(json.dumps({'database':database,'results':results,'failures':failures},indent=2))
print('SQL_ACL_FAILURES',failures,flush=True)
if failures: raise SystemExit(1)
