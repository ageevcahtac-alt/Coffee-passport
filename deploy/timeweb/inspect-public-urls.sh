#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, subprocess
from pathlib import Path
allowed={'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_APP_URL','SITE_URL','API_EXTERNAL_URL','SUPABASE_PUBLIC_URL','STORAGE_PUBLIC_URL','ADDITIONAL_REDIRECT_URLS','GOTRUE_SITE_URL','GOTRUE_URI_ALLOW_LIST','GOTRUE_JWT_ISSUER'}
for name in ['/opt/coffee-passport/app/.env.local','/opt/coffee-passport/supabase/.env']:
 print(name)
 for line in Path(name).read_text().splitlines():
  key,_,value=line.partition('=')
  if key in allowed: print(key+'='+value)
names=subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines()
for name in names:
 if name.startswith(('supabase-','realtime-dev.')):
  data=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  print('RUNNING CONTAINER',name)
  print('COMPOSE FILES',data['Config']['Labels'].get('com.docker.compose.project.config_files'))
  print('COMPOSE SERVICE',data['Config']['Labels'].get('com.docker.compose.service'))
  for line in data['Config'].get('Env',[]):
   if line.partition('=')[0] in allowed: print(line)
  if name=='supabase-envoy':
   print('Gateway mounts:',[(m['Source'],m['Destination']) for m in data.get('Mounts',[])])
print('Compose URL mappings:')
for name in ['docker-compose.yml','docker-compose.local.yml','docker-compose.kong.yml']:
 for line in Path('/opt/coffee-passport/supabase',name).read_text().splitlines():
  if any(key in line for key in allowed): print(name+': '+line)
print('Envoy routing template (selected routing fields only):')
for path in Path('/opt/coffee-passport/supabase/volumes/api/envoy').glob('*.yaml'):
 if path.is_file():
  print(path.name)
  for line in path.read_text().splitlines():
   if line.strip().startswith(('prefix:','path:','prefix_rewrite:','cluster:','address:','port_value:')): print(line)
PY
