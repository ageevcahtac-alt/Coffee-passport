"""Read-only Cloud SQL audit and export; password is accepted only on stdin.

Run on the Timeweb host. Private exports stay outside the repository. Existing
databases and services are never changed. A new database is used for rehearsal.
"""

import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    payload = json.load(sys.stdin)
    env = os.environ.copy()
    env.update(PGPASSWORD=payload["password"].strip(), PGSSLMODE="require", PGCONNECT_TIMEOUT="12")
    connection = ["-h", "aws-1-eu-west-1.pooler.supabase.com", "-p", "5432",
                  "-U", "postgres.vodmmtzclvqemcujwmdf", "-d", "postgres", "--no-password"]
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = Path("/opt/coffee-passport/backups") / ("source-audit-" + stamp)
    root.mkdir(mode=0o700)

    def private(name, data):
        path = root / name
        path.touch(mode=0o600, exist_ok=False)
        path.write_bytes(data if isinstance(data, bytes) else data.encode())
        return path

    def source(sql):
        result = subprocess.run(["psql", *connection, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
                                env=env, capture_output=True, timeout=180)
        if result.returncode:
            private("source-error.log", result.stderr)
            category = "authentication" if b"password authentication failed" in result.stderr else "connection_or_query"
            print("SOURCE_SQL_FAILED", category, flush=True)
            raise SystemExit(1)
        return result.stdout.decode().strip()

    version = source("SELECT version()")
    print("SOURCE_SQL_CONNECTED", version, flush=True)
    queries = {
        "tables": "SELECT schemaname,tablename,tableowner FROM pg_tables WHERE schemaname IN ('public','auth','storage') ORDER BY 1,2",
        "columns": "SELECT table_schema,table_name,column_name,ordinal_position,udt_schema,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','auth','storage') ORDER BY 1,2,4",
        "constraints": "SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') ORDER BY 1,2,3",
        "policies": "SELECT * FROM pg_policies WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,tablename,policyname",
        "rls": "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p') ORDER BY 1,2",
        "functions": "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p') ORDER BY 1,2,3",
        "triggers": "SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal ORDER BY 1,2,3",
        "extensions": "SELECT e.extname,e.extversion,n.nspname,pg_get_userbyid(e.extowner) AS owner FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1",
        "roles": "SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname",
        "role_memberships": "SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,admin_option FROM pg_auth_members ORDER BY 1,2",
        "grants": "SELECT * FROM information_schema.role_table_grants WHERE table_schema IN ('public','auth','storage') ORDER BY table_schema,table_name,grantee,privilege_type",
        "schema_acl": "SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace WHERE nspname IN ('public','auth','storage') ORDER BY 1",
        "object_acl": "SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') ORDER BY 1,2",
        "default_acl": "SELECT pg_get_userbyid(d.defaclrole) AS role,n.nspname,d.defaclobjtype,d.defaclacl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3",
        "dependencies": "SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS object,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS reference,d.deptype FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') ORDER BY 1,2",
        "auth_migrations": "SELECT * FROM auth.schema_migrations ORDER BY version",
        "storage_migrations": "SELECT * FROM storage.migrations ORDER BY id",
    }
    source_inventory = {}
    target_inventory = {}
    for name, sql in queries.items():
        wrapped = "SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (" + sql + ")s"
        source_inventory[name] = json.loads(source(wrapped))
        result = subprocess.run(["docker", "exec", "supabase-db", "psql", "-U", "supabase_admin", "-d", "postgres",
                                 "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", wrapped], capture_output=True, timeout=90)
        if result.returncode:
            private("target-" + name + "-error.log", result.stderr)
            raise SystemExit("TARGET_INVENTORY_FAILED " + name)
        target_inventory[name] = json.loads(result.stdout)
        print("CATALOG", name, "source", len(source_inventory[name]), "target", len(target_inventory[name]), flush=True)
    private("source-inventory.json", json.dumps(source_inventory, indent=2))
    private("target-inventory.json", json.dumps(target_inventory, indent=2))

    dump = subprocess.run(["pg_dump", *connection, "-Fc"], env=env, capture_output=True, timeout=600)
    private("source-pg-dump.log", dump.stderr)
    if dump.returncode:
        raise SystemExit("SOURCE_EXPORT_FAILED; private log retained")
    archive = private("cloud.dump", dump.stdout)
    print("SOURCE_EXPORT_OK", "bytes", len(dump.stdout), "sha256", hashlib.sha256(dump.stdout).hexdigest(), flush=True)
    for args in [["pg_restore", "--list", str(archive)], ["pg_restore", "--data-only", "--file=/dev/null", str(archive)]]:
        result = subprocess.run(args, capture_output=True, timeout=180)
        if result.returncode:
            private("archive-check-error.log", result.stderr)
            raise SystemExit("SOURCE_ARCHIVE_CHECK_FAILED")
    db = "cp_source_" + stamp.lower().replace("t", "_").replace("z", "")
    result = subprocess.run(["docker", "exec", "supabase-db", "createdb", "-U", "supabase_admin", "-T", "template0", db], capture_output=True)
    if result.returncode:
        private("create-rehearsal-error.log", result.stderr)
        raise SystemExit("REHEARSAL_CREATE_FAILED")
    result = subprocess.run(["docker", "exec", "-i", "supabase-db", "pg_restore", "-U", "supabase_admin", "-d", db, "--exit-on-error"],
                            input=dump.stdout, capture_output=True, timeout=300)
    private("source-restore.log", result.stderr)
    print("SOURCE_RESTORE_EXIT", result.returncode, "database", db, flush=True)
    if result.returncode:
        raise SystemExit("SOURCE_RESTORE_FAILED; private log retained")
    summary = {"source_version": version, "archive": str(archive), "rehearsal_database": db,
               "export_exit": dump.returncode, "restore_exit": result.returncode,
               "catalog_sizes": {k: {"source": len(source_inventory[k]), "target": len(target_inventory[k])} for k in queries}}
    private("summary.json", json.dumps(summary, indent=2))
    print("SOURCE_AUDIT_DIRECTORY", root, flush=True)


if __name__ == "__main__":
    main()
