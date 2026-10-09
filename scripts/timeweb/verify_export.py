"""Compare every public/Auth/Storage table with live Cloud using row digests.

Password is read on stdin. Each side is read in one repeatable-read transaction;
only aggregate results are printed. The detailed digest report stays private.
"""

import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    root=Path(sys.argv[1]).resolve()
    if root.parent!=Path('/opt/coffee-passport/backups'):
        raise SystemExit('Unexpected backup directory')
    payload=json.load(sys.stdin)
    env=os.environ.copy()
    env.update(PGPASSWORD=payload['password'].strip(),PGSSLMODE='require',PGCONNECT_TIMEOUT='12')
    inventory=json.loads((root/'source-inventory.json').read_text())
    summary=json.loads((root/'summary.json').read_text())
    statements=['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;']
    for table in inventory['tables']:
        schema=table['schemaname'];name=table['tablename'];label=schema+'.'+name
        relation='"'+schema.replace('"','""')+'"."'+name.replace('"','""')+'"'
        statements.append("SELECT json_build_object('name','"+label.replace("'","''")+"','rows',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(to_jsonb(t)::text) AS h FROM "+relation+' t)s;')
    statements.append('COMMIT;')
    sql='\n'.join(statements).encode()
    source=['psql','-h','aws-1-eu-west-1.pooler.supabase.com','-p','5432','-U','postgres.vodmmtzclvqemcujwmdf','-d','postgres','--no-password','-X','-qAt','-v','ON_ERROR_STOP=1']
    restored=['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d',summary['rehearsal_database'],'-X','-qAt','-v','ON_ERROR_STOP=1']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures=[executor.submit(subprocess.run,args,input=sql,capture_output=True,env=env if args==source else None,timeout=180) for args in [source,restored]]
        results=[future.result() for future in futures]
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for index,result in enumerate(results):
        if result.returncode:
            path=root/('live-digest-error-'+str(index)+'-'+stamp+'.log')
            path.touch(mode=0o600,exist_ok=False);path.write_bytes(result.stderr)
            raise SystemExit('LIVE_DIGEST_QUERY_FAILED; private log retained')
    maps=[{row['name']:row for row in map(json.loads,result.stdout.decode().splitlines())} for result in results]
    mismatches=[name for name in maps[0] if maps[0][name]!=maps[1].get(name)]
    report={'live':maps[0],'restored':maps[1],'mismatches':mismatches,'checked_tables':len(maps[0])}
    path=root/('live-digest-verification-'+stamp+'.json')
    path.touch(mode=0o600,exist_ok=False);path.write_text(json.dumps(report,indent=2))
    print('LIVE_SOURCE_TABLES_CHECKED',len(maps[0]),'CONTENT_MISMATCHES',mismatches,flush=True)
    print('LIVE_SOURCE_DIGEST_REPORT',path,flush=True)
    if mismatches:
        raise SystemExit(1)


if __name__=='__main__':
    main()
