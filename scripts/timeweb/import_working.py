"""Apply the approved, byte-for-byte rehearsed import with tested rollback.

Private SQL, backups and reports remain on the server. No service schema or
database is dropped. Run with the source audit directory as the sole argument.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def main():
    root = Path(sys.argv[1]).resolve()
    if root.parent != Path('/opt/coffee-passport/backups'):
        raise SystemExit('Unexpected backup directory')
    approved = json.loads((root/'candidate-summary.json').read_text())
    if (root/'working-summary.json').exists():
        raise SystemExit('Previous working import requires explicit review; refusing repeat')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')
    run = root/('working-'+stamp)
    run.mkdir(mode=0o700)

    def private(name, data):
        path = run/name
        path.touch(mode=0o600, exist_ok=False)
        path.write_bytes(data if isinstance(data, bytes) else data.encode())
        return path

    def command(args, name, data=None):
        result = subprocess.run(args, input=data, capture_output=True, timeout=300)
        private(name+'.log', result.stdout+result.stderr)
        if result.returncode:
            raise RuntimeError('Operation failed: '+name+' (protected log)')
        return result.stdout

    def query(db, sql):
        result = subprocess.run(['docker','exec','supabase-db','psql','-U','supabase_admin','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql], capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError('Query failed (private output suppressed)')
        return result.stdout.decode().strip()

    def state(db, schemas=None):
        where = "n.nspname IN ('public','auth','storage')" if schemas is None else "n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"
        names = json.loads(query(db,"SELECT coalesce(json_agg(x),'[]') FROM (SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND "+where+" ORDER BY 1,2)x"))
        output = {}
        for item in names:
            name = item['schema']+'.'+item['name']
            output[name] = json.loads(query(db,'SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) h FROM "'+item['schema']+'"."'+item['name']+'" t)s'))
        return output

    sql = Path(approved['restore_sql']).read_bytes()
    backup = Path(approved['target_backup'])
    if hashlib.sha256(sql).hexdigest()!=approved['restore_sql_sha256'] or hashlib.sha256(backup.read_bytes()).hexdigest()!=approved['target_backup_sha256']:
        raise SystemExit('APPROVED_ARTIFACT_HASH_MISMATCH')
    for path in [backup, backup.parent/'internal-before.dump']:
        command(['pg_restore','--data-only','--file=/dev/null',str(path)], path.stem+'-read')
    before = state('postgres')
    if before != approved['target_before']:
        raise SystemExit('TARGET_CHANGED; no replacement performed')
    internal = state('_supabase', 'all')
    source = state(approved['source_database'])
    if source['auth.users']['rows'] != 14 or len([x for x in source if x.startswith('public.')]) != 31:
        raise SystemExit('APPROVED_SOURCE_COUNTS_CHANGED')
    fresh = command(['docker','exec','supabase-db','pg_dump','-U','supabase_admin','-d','postgres','-Fc'], 'fresh-backup')
    fresh_path = private('postgres-before.dump', fresh)
    private('internal-before.dump', command(['docker','exec','supabase-db','pg_dump','-U','supabase_admin','-d','_supabase','-Fc'], 'fresh-internal-backup'))
    command(['pg_restore','--data-only','--file=/dev/null',str(fresh_path)], 'fresh-read')

    # Restore rollback material from the actual baseline archive, including its
    # application-owned Auth trigger and schema ACL (not guessed grants).
    toc = command(['pg_restore','--list',str(fresh_path)], 'rollback-toc').decode()
    selection = [line for line in toc.splitlines() if ' ACL - SCHEMA public ' in line or ' TRIGGER auth users ' in line or ' SEQUENCE SET auth ' in line]
    selection_path = private('rollback-extra.toc','\n'.join(selection)+'\n')
    extra = command(['pg_restore','--use-list',str(selection_path),'--file=-',str(fresh_path)], 'rollback-extra')
    public = command(['pg_restore','--schema=public','--file=-',str(fresh_path)], 'rollback-public')
    owner = query('postgres',"SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public'")
    rollback = b'SET session_replication_role=replica;\nDROP SCHEMA public CASCADE;\n'
    if not re.search(rb'CREATE SCHEMA public\s*;', public):
        rollback += b'CREATE SCHEMA public AUTHORIZATION postgres;\n'
    for table in approved['auth_tables_imported']:
        rollback += ('DELETE FROM auth."'+table+'";\n').encode()
    rollback += public + ('\nALTER SCHEMA public OWNER TO "'+owner+'";\n').encode() + extra + b'\nSET session_replication_role=origin;\n'
    rollback_path = private('rollback.sql', rollback)
    rehearsal = 'cp_rollback_'+stamp
    command(['docker','exec','supabase-db','createdb','-U','supabase_admin','-T','template0',rehearsal], 'rollback-create')
    command(['docker','exec','-i','supabase-db','pg_restore','-U','supabase_admin','-d',rehearsal,'--exit-on-error'], 'rollback-baseline', fresh)
    def apply(db, body, label):
        command(['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d',db,'-X','--single-transaction','-v','ON_ERROR_STOP=1'], label, body)
    apply(rehearsal, sql, 'rehearsal-import')
    source_inventory=json.loads((root/'source-inventory.json').read_text())
    source_acl=next(x for x in source_inventory['schema_acl'] if x['nspname']=='public')
    actual_acl=json.loads(query(rehearsal,"SELECT row_to_json(x) FROM (SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace WHERE nspname='public')x"))
    # A schema created explicitly does not inherit template0's PUBLIC USAGE.
    # Fail before touching working data if the filtered archive omits it.
    if actual_acl!=source_acl:
        raise SystemExit('REHEARSED_SCHEMA_ACL_MISMATCH; working database unchanged')
    apply(rehearsal, rollback, 'rehearsal-rollback')
    if state(rehearsal)!=before:
        raise SystemExit('ROLLBACK_REHEARSAL_MISMATCH; working database unchanged')
    print('BASELINE_EMPTY_BACKUPS_READABLE_ROLLBACK_REHEARSED',flush=True)
    stopped = False
    committed = False
    safe_to_start = True
    try:
        command(['systemctl','stop','coffee-passport'], 'stop-app')
        stopped = True
        command(['docker','stop','supabase-auth','supabase-rest'], 'stop-api')
        if state('postgres')!=before or state('_supabase','all')!=internal:
            raise RuntimeError('Target changed before import')
        apply('postgres', sql, 'working-import')
        committed = True
        current = state('postgres')
        expected = {k:v for k,v in source.items() if k.startswith('public.') or k.split('.')[1] in approved['auth_tables_imported'] and k.startswith('auth.')}
        if any(current.get(k)!=v for k,v in expected.items()):
            raise RuntimeError('Imported content mismatch')
        if any(current.get(k)!=v for k,v in before.items() if not k.startswith('public.') and k not in expected) or state('_supabase','all')!=internal:
            raise RuntimeError('Service data mismatch')
        report = {'approved_sql_sha256':approved['restore_sql_sha256'],'working_database':'postgres','public_tables':31,'auth_users':14,'content_match':True,'service_histories_preserved':True,'internal_database_preserved':True,'rollback_rehearsed':True,'rollback_sql':str(rollback_path),'preimport_backup':str(fresh_path),'before':before,'internal_before':internal,'acceptance':'pending'}
        private('working-summary.json', json.dumps(report,indent=2))
        pointer=root/'working-summary.json'
        if pointer.exists():
            raise RuntimeError('Existing working import report requires review')
        pointer.touch(mode=0o600);pointer.write_text(json.dumps(report,indent=2))
        print('WORKING_IMPORT_CONTENT_VERIFIED 31_TABLES 14_USERS',flush=True)
        print('REPORT',run,flush=True)
    except Exception:
        if committed:
            safe_to_start = False
            apply('postgres', rollback, 'working-rollback')
            if state('postgres')!=before:
                raise SystemExit('ROLLBACK_VERIFICATION_FAILED; API remains stopped')
            print('WORKING_ROLLBACK_VERIFIED',flush=True)
            safe_to_start = True
        raise
    finally:
        if stopped and safe_to_start:
            command(['docker','start','supabase-auth','supabase-rest'], 'start-api')
            command(['systemctl','start','coffee-passport'], 'start-app')


if __name__=='__main__':
    main()
