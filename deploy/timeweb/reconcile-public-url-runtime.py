#!/usr/bin/env python3
"""Apply env URL changes with the existing local Compose override, rejecting other changes."""
import json
import subprocess

command = ['docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml']
config = json.loads(subprocess.check_output(command + ['config', '--format', 'json'], text=True))
allowed = {'SUPABASE_PUBLIC_URL', 'STORAGE_PUBLIC_URL', 'API_EXTERNAL_URL', 'GOTRUE_SITE_URL', 'GOTRUE_URI_ALLOW_LIST', 'GOTRUE_JWT_ISSUER'}
changed_services = []
for service in ['auth', 'api-gw', 'storage', 'functions', 'studio']:
    container_id = subprocess.check_output(command + ['ps', '-q', service], text=True).strip()
    if not container_id:
        raise SystemExit(f'Missing running service: {service}')
    current = json.loads(subprocess.check_output(['docker', 'inspect', container_id], text=True))[0]
    runtime = dict(item.split('=', 1) for item in current['Config']['Env'])
    desired = config['services'][service].get('environment', {})
    differences = {key for key, value in desired.items() if str(value) != runtime.get(key)}
    unexpected = differences - allowed
    if unexpected:
        raise SystemExit(f'Refusing unrelated environment changes for {service}: {sorted(unexpected)}')
    if differences:
        print(f'{service}: updating {sorted(differences)}', flush=True)
        changed_services.append(service)
if changed_services:
    subprocess.run(command + ['up', '-d', '--no-deps'] + changed_services, check=True)
else:
    print('Public URL runtime already matches env')
