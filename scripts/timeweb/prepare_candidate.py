"""Rehearse a filtered Cloud import on a fresh copy of the target database.

Only newly created candidate databases are changed. Working postgres/_supabase
are backed up and read, never modified. Generated SQL contains private data and
must remain in the protected backup directory, outside Git.
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
    summary = json.loads((root / 'summary.json').read_text())
    archive = Path(summary['archive'])
    source_db = summary['rehearsal_database']
    source_inventory = json.loads((root / 'source-inventory.json').read_text())
    target_inventory = json.loads((root / 'target-inventory.json').read_text())
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')
    run_root = root / ('candidate-' + stamp)
    run_root.mkdir(mode=0o700)

    def private(name, content):
        path = run_root / name
        path.touch(mode=0o600, exist_ok=False)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())
        return path

    def command(args, log, **kwargs):
        result = subprocess.run(args, capture_output=True, timeout=300, **kwargs)
        private(log, result.stderr)
        if result.returncode:
            raise SystemExit('OPERATION_FAILED ' + log + '; inspect protected log')
        return result.stdout

    def query(db, sql):
        result = subprocess.run(['docker', 'exec', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', db,
                                 '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], capture_output=True, timeout=120)
        if result.returncode:
            raise SystemExit('QUERY_FAILED (private result suppressed)')
        return result.stdout.decode().strip()

    def tables(db, schema):
        return json.loads(query(db, "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='" + schema + "'"))

    def digest(db, schema, table):
        return json.loads(query(db, 'SELECT json_build_object(\'rows\',count(*),\'digest\',md5(coalesce(string_agg(h,\'\' ORDER BY h),\'\'))) FROM (SELECT md5(to_jsonb(t)::text) AS h FROM "' + schema + '"."' + table + '" t)s'))

    target_before = {}
    for schema in ['public', 'auth', 'storage']:
        for table in tables('postgres', schema):
            target_before[schema + '.' + table] = digest('postgres', schema, table)
    populated_target = [k for k,v in target_before.items() if v['rows'] and k not in ['auth.schema_migrations', 'storage.migrations']]
    if populated_target:
        raise SystemExit('TARGET_HAS_DATA; prepare reconciliation before any replacement')

    target_dump = command(['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc'], 'target-backup.log')
    target_backup = private('target-before.dump', target_dump)
    internal_dump = command(['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'supabase_admin', '-d', '_supabase', '-Fc'], 'internal-backup.log')
    internal_backup = private('internal-before.dump', internal_dump)
    for path in [target_backup, internal_backup]:
        command(['pg_restore', '--data-only', '--file=/dev/null', str(path)], path.stem + '-read-check.log')
    candidate = 'cp_candidate_' + stamp
    command(['docker', 'exec', 'supabase-db', 'createdb', '-U', 'supabase_admin', '-T', 'template0', candidate], 'candidate-create.log')
    command(['docker', 'exec', '-i', 'supabase-db', 'pg_restore', '-U', 'supabase_admin', '-d', candidate, '--exit-on-error'], 'candidate-baseline-restore.log', input=target_dump)
    for name, expected in target_before.items():
        schema, table = name.split('.')
        if digest(candidate, schema, table) != expected:
            raise SystemExit('TARGET_BACKUP_CONTENT_MISMATCH')
    print('FRESH_TARGET_BACKUP_RESTORE_AND_CONTENT_OK', flush=True)

    source_auth = {table: digest(source_db, 'auth', table) for table in tables(source_db, 'auth')}
    target_auth = set(tables(candidate, 'auth'))
    source_cols = {(x['table_name'],x['column_name']):x['udt_name'] for x in source_inventory['columns'] if x['table_schema']=='auth'}
    target_cols = {(x['table_name'],x['column_name']):x['udt_name'] for x in target_inventory['columns'] if x['table_schema']=='auth'}
    selected_tables = []
    for table, state in source_auth.items():
        if table == 'schema_migrations' or not state['rows']:
            continue
        if table not in target_auth:
            raise SystemExit('NONEMPTY_AUTH_TABLE_MISSING ' + table)
        incompatible = [col for (tab,col),typ in source_cols.items() if tab==table and target_cols.get((tab,col))!=typ]
        if incompatible:
            raise SystemExit('NONEMPTY_AUTH_COLUMNS_INCOMPATIBLE ' + table)
        selected_tables.append(table)
    source_storage = {table: digest(source_db, 'storage', table) for table in tables(source_db, 'storage')}
    if any(state['rows'] for table,state in source_storage.items() if table!='migrations'):
        raise SystemExit('STORAGE_HAS_DATA; migrate binaries and compatible metadata first')

    toc = subprocess.run(['pg_restore', '--list', str(archive)], capture_output=True, check=True).stdout.decode()
    selected = []
    app_triggers = []
    function_names = {x['proname'] for x in source_inventory['functions'] if x['nspname']=='public'}
    for trigger in source_inventory['triggers']:
        match = re.search(r'EXECUTE FUNCTION (?:public\.)?(\w+)\(', trigger['definition'])
        if trigger['nspname']=='auth' and match and match.group(1) in function_names:
            app_triggers.append(trigger['tgname'])
    for line in toc.splitlines():
        if any(' TABLE DATA auth ' + table + ' ' in line for table in selected_tables):
            selected.append(line)
        elif ' SEQUENCE SET auth ' in line:
            selected.append(line)
    auth_list = private('auth-data.toc', '\n'.join(selected)+'\n')
    auth_sql = subprocess.run(['pg_restore', '--use-list', str(auth_list), '--file=-', str(archive)], capture_output=True, check=True).stdout
    public_sql = subprocess.run(['pg_restore', '--schema=public', '--file=-', str(archive)], capture_output=True, check=True).stdout
    # Schema ACL entries have namespace "-" in the TOC, so --schema=public
    # does not include them. Replay those exact ACLs instead of inventing grants.
    schema_acl_lines = [line for line in toc.splitlines() if ' ACL - SCHEMA public ' in line]
    schema_acl_list = private('public-schema-acl.toc', '\n'.join(schema_acl_lines)+'\n')
    schema_acl_sql = subprocess.run(['pg_restore', '--use-list', str(schema_acl_list), '--file=-', str(archive)], capture_output=True, check=True).stdout
    # pg_restore's schema filter excludes auth triggers owned by the application.
    trigger_lines = [line for line in toc.splitlines() if any(' TRIGGER auth users '+name+' ' in line for name in app_triggers)]
    trigger_list = private('app-auth-triggers.toc', '\n'.join(trigger_lines)+'\n')
    trigger_sql = subprocess.run(['pg_restore', '--use-list', str(trigger_list), '--file=-', str(archive)], capture_output=True, check=True).stdout
    # Only the candidate is used here. This SQL is NOT applied to working postgres.
    sql = b'SET session_replication_role = replica;\nDROP SCHEMA public CASCADE;\n'
    # Depending on pg_dump version, the public schema itself may be omitted.
    if not re.search(rb'CREATE SCHEMA public\s*;', public_sql):
        sql += b'CREATE SCHEMA public AUTHORIZATION postgres;\n'
    source_public_owner = next(row['owner'] for row in source_inventory['schema_acl'] if row['nspname']=='public')
    owner_sql = ('ALTER SCHEMA public OWNER TO "' + source_public_owner.replace('"','""') + '";\n').encode()
    # pg_dump expresses schema ACL changes relative to PostgreSQL's standard
    # public schema. Explicit CREATE SCHEMA lacks its default PUBLIC USAGE.
    # Reconstruct the complete observed ACL, including grantors and grant option,
    # rather than assuming defaults or adding an unverified broad grant.
    acl_query = "SELECT coalesce(json_agg(x),'[]') FROM (SELECT pg_get_userbyid(a.grantor) AS grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY 1,2,3)x"
    acl = json.loads(query(source_db, acl_query))
    def identifier(value):
        return '"' + value.replace('"','""') + '"'
    acl_sql = 'SET ROLE ' + identifier(source_public_owner) + ';\n'
    grantees = sorted({row['grantee'] for row in acl})
    # Include the creator to remove CREATE SCHEMA's initial implicit ACL.
    for grantee in sorted(set(grantees + ['PUBLIC','postgres'])):
        acl_sql += 'REVOKE ALL ON SCHEMA public FROM ' + ('PUBLIC' if grantee=='PUBLIC' else identifier(grantee)) + ';\n'
    acl_sql += 'RESET ROLE;\n'
    for row in acl:
        acl_sql += 'SET ROLE '+identifier(row['grantor'])+';\nGRANT '+row['privilege_type']+' ON SCHEMA public TO '+('PUBLIC' if row['grantee']=='PUBLIC' else identifier(row['grantee']))+(' WITH GRANT OPTION' if row['is_grantable'] else '')+';\nRESET ROLE;\n'
    sql += auth_sql + b'\n' + public_sql + b'\n' + owner_sql + schema_acl_sql + acl_sql.encode() + b'\n' + trigger_sql + b'\nSET session_replication_role = origin;\n'
    restore_sql = private('filtered-restore.sql', sql)
    command(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', candidate,
             '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1'], 'candidate-filtered-restore.log', input=sql)

    mismatches = []
    actual_acl=json.loads(query(candidate,acl_query))
    if actual_acl != acl:
        raise SystemExit('CANDIDATE_SCHEMA_ACL_MISMATCH')
    for table in tables(source_db,'public'):
        if digest(source_db,'public',table) != digest(candidate,'public',table):
            mismatches.append('public.'+table)
    for table in selected_tables:
        if digest(source_db,'auth',table) != digest(candidate,'auth',table):
            mismatches.append('auth.'+table)
    for table in ['auth.schema_migrations','storage.migrations']:
        schema, name = table.split('.')
        if digest(candidate,schema,name) != target_before[table]:
            mismatches.append(table+' (target service history)')
    if mismatches:
        raise SystemExit('CANDIDATE_CONTENT_MISMATCH '+','.join(mismatches))
    report = {'candidate_database':candidate,'source_database':source_db,'restore_sql':str(restore_sql),
              'restore_sql_sha256':hashlib.sha256(sql).hexdigest(),'target_backup':str(target_backup),
              'target_backup_sha256':hashlib.sha256(target_dump).hexdigest(),
              'source_public_tables':len(tables(source_db,'public')),'auth_tables_imported':selected_tables,
              'auth_application_triggers':app_triggers,'auth_schema_migrations_preserved':True,
              'storage_schema_and_history_preserved':True,'content_mismatches':mismatches,
              'schema_acl_exact_match':True,
              'target_before':target_before}
    private('candidate-summary.json',json.dumps(report,indent=2))
    latest = root/'candidate-summary.json'
    if latest.exists():
        latest.rename(root/('candidate-summary-before-'+stamp+'.json'))
    latest.touch(mode=0o600,exist_ok=False)
    latest.write_text(json.dumps(report,indent=2))
    print('CANDIDATE_FILTERED_RESTORE_OK',candidate,flush=True)
    print('PUBLIC_CONTENT_MATCH',report['source_public_tables'],'AUTH_TABLES_CONTENT_MATCH',len(selected_tables),flush=True)
    print('SERVICE_MIGRATION_HISTORY_PRESERVED; WORKING_DATABASE_UNCHANGED',flush=True)
    print('CANDIDATE_REPORT',root/'candidate-summary.json',flush=True)


if __name__=='__main__':
    main()
