"""Restore the proven empty preimport state after failed acceptance.

Only use before production cutover: this deliberately removes imported data and
acceptance-created Auth records. All source data remains in protected backups.
"""
import json
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
if root.parent!=Path('/opt/coffee-passport/backups'):
    raise SystemExit('Unexpected backup directory')
report=json.loads((root/'working-summary.json').read_text())
if any(state['rows'] for name,state in report['before'].items() if name not in ['auth.schema_migrations','storage.migrations']):
    raise SystemExit('Nonempty baseline requires reconciliation; refusing rollback')
run=Path(report['rollback_sql']).parent
subprocess.run(['systemctl','stop','coffee-passport'],check=True)
subprocess.run(['docker','stop','supabase-auth','supabase-rest'],capture_output=True,check=True)
cleanup='SET session_replication_role=replica;\n'+''.join('DELETE FROM auth."'+name.split('.')[1]+'";\n' for name,state in report['before'].items() if name.startswith('auth.') and state['rows']==0)+'SET session_replication_role=origin;\n'
result=subprocess.run(['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','--single-transaction','-v','ON_ERROR_STOP=1'],input=Path(report['rollback_sql']).read_bytes()+cleanup.encode(),capture_output=True,timeout=180)
path=run/'acceptance-rollback.log';path.touch(mode=0o600,exist_ok=False);path.write_bytes(result.stdout+result.stderr)
if result.returncode: raise SystemExit('ROLLBACK_FAILED; services remain stopped')
def digest(db,name):
    schema,table=name.split('.')
    sql='SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM "'+schema+'"."'+table+'" t)s'
    r=subprocess.run(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,check=True)
    return json.loads(r.stdout)
failures=[name for name,state in report['before'].items() if digest('postgres',name)!=state]+[name for name,state in report['internal_before'].items() if digest('_supabase',name)!=state]
report.update(acceptance='failed_rolled_back',rollback_verified=not failures,rollback_mismatches=failures)
(root/'working-summary.json').write_text(json.dumps(report,indent=2))
if failures: raise SystemExit('ROLLBACK_CONTENT_MISMATCH; services remain stopped')
subprocess.run(['docker','start','supabase-auth','supabase-rest'],capture_output=True,check=True)
subprocess.run(['systemctl','start','coffee-passport'],check=True)
print('ROLLBACK_VERIFIED; POSTGRES_BASELINE_RESTORED; INTERNAL_DATABASE_UNCHANGED')
