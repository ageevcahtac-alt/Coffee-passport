# COFFEEPASSPORT.RU — factual deployment journal

## 2026-10-10

- Working branch: `fix/pre-pilot-shortlist`; deployed application baseline: `5aa84a0`.
- DNS observed on workstation and server: apex A = `92.53.96.201`, expected `147.45.102.186`. Domain activation is pending.
- Server backup created before changes: `/opt/coffee-passport/backups/domain-20261010T095505Z`, mode 0700. Includes Nginx, app env, Supabase env and previous `.next`. No secrets or backups are committed.
- Installed HTTP domain virtual host separately from existing IP virtual host. `nginx -t` passed; reload succeeded; local request with `Host: coffeepassport.ru` returned 200 after reload.
- Uploaded `/opt/coffee-passport/activate-domain.sh`; `bash -n` passed. Execution correctly stopped at DNS guard. Domain certificate, auth URL changes and application restart have **not** occurred.
- Activation script preserves IP virtual hosts and redirect allowlist, issues domain certificate, changes URL configuration without database changes, rebuilds/restarts Next.js and tests certificate renewal. Requires post-activation browser acceptance checks.
- Local `npm run build`: passed (Next.js 14.2.35, 39 generated pages).
- Existing page uses intrinsic 1672×941 image, `w-full h-auto`, and opens full-size original in a new tab. No interface styles changed.
- Imagegen edit rejected: dimensions preserved, but protected lower image samples changed and corner was RGB(242,238,229), not #F5F2EB. Original asset retained. Exact masked processing awaits user authorization.
- Source image rollback copy saved in the server backup above as `coffee-passport-four-philosophies.png`; committed source remains unchanged.
- Browser checks passed at 320/390/768/1440: computed main background `rgb(245, 242, 235)`, full image ratio, original opens, no horizontal overflow or page errors.
- Auth tests passed: 13 tests in three files, including public-host callback and arbitrary Host rejection.
- Found and fixed callback redirect to `https://localhost:3000`. Focused commit `856f42f1e6fd87aaeae0af376dc6d46cac8f5d8f` deployed after successful server build and Next.js restart. Confirmed redirect now uses `https://147.45.102.186/auth/login`.
- Main and login routes respond after restart; guest cafe/roaster cabinet requests redirect to login. Recovery page returns 200. Supabase Auth health returns 200 with public key, without exposing it.
- IP certificate valid through 2026-10-16; renewal timer enabled and most recent renewal service result success/exit 0. Domain certificate has not been issued.
- Commits `f54b4b6` and `856f42f` pushed. No authenticated user login, valid callback exchange or password update was performed, respecting the prohibition on password/data changes.
- Repeated all four browser viewport checks after the deployed Next.js restart: passed; screenshots and JSON stored locally in ignored `.next/domain-qa/`. Visual review at 320 px confirms the original background rectangle remains visible.
- Actual HTTPS request to the public domain failed TLS hostname validation (curl error 60) on the old DNS target. No domain acceptance claim is made.
- Verification commit `98edc85` pushed and pulled on Timeweb; journal copied to `/opt/coffee-passport/logs/domain-changelog-20261010.md`.
- Database contents, users, roles, passwords and RLS unchanged. IP cookies/localStorage do not migrate to the domain.

## Pending acceptance

- Owner action: change apex A record to `147.45.102.186`.
- Actual domain DNS/HTTPS and renewal dry run.
- Computed background and screenshots at 320/390/768/1440 px.
- Background seam elimination while preserving protected pixels.
- API, authenticated access, callback and recovery via domain; Next.js restart verification.

## Apex HTTPS and www preparation

- Both apex and www resolve to `92.53.96.201` on workstation and Timeweb. Actual HTTPS checks for both fail hostname validation (curl 60). DNS management is unavailable in the connected tools/browser session.
- Before changes, saved Nginx, renewal service, app/Supabase env, previous build and activation script in `/opt/coffee-passport/backups/domain-www-20261010T110139Z` (0700).
- Installed HTTP www host with ACME webroot and 308 redirect to `https://coffeepassport.ru$request_uri`. Verified `/verification?test=1` redirects with path/query intact. IP HTTPS stays available.
- Activation script now includes www in the domain certificate and adds its HTTPS redirect when www resolves to the Timeweb IP. Otherwise apex can be activated independently. DNS guard still stops activation before certificate or auth URL changes.
- Renewal service now runs `certbot renew` for all installed certificates, covering IP and future domain certificates. Timer enabled; manual service start succeeded (Result=success, exit 0). Domain renewal dry run remains pending until issuance.
- Owner DNS action: replace A records for `@` and `www` with `147.45.102.186`; preserve NS and mail MX/TXT records.

## Public URL and Auth configuration verification

- Verified running gateway is **Envoy**, service `api-gw`, not Kong. Inspected its mounted `volumes/api/envoy/lds.template.yaml` and cluster configuration. Nginx removes `/supabase/` and proxies to loopback port 8000; Envoy removes `/auth/v1/` before forwarding to Auth on port 9999. Public API base is therefore `/supabase`, external Auth base `/supabase/auth/v1`.
- Actual stack uses both `docker-compose.yml` and `docker-compose.local.yml`. Activation now preserves these files and reconciles only services whose URL environment differs. It rejects environment changes outside the public URL allowlist before recreating any service.
- Backed up Auth env in `/opt/coffee-passport/backups/auth-redirects-20261010T110802Z`. Added exact `https://coffeepassport.ru/auth/callback` and `https://coffeepassport.ru/auth/reset-password` to the running Auth allowlist, preserving existing entries and adding IP recovery URL. Auth runtime verification confirms all four destinations.
- Corrected stale runtime `http://localhost:8000` public URLs in api-gw, storage, functions and studio to current `https://147.45.102.186/supabase`. Comparison against running container environment confirmed only SUPABASE_PUBLIC_URL/STORAGE_PUBLIC_URL changed. Auth API_EXTERNAL_URL, SITE_URL and issuer remain on working IP until domain TLS succeeds.
- Read-only API checks after container recreation: Auth health 200; REST `lots?select=public_id&limit=1` 200 (response data not logged); Storage status 200. Public `/supabase/` and `/supabase/pg/` remain blocked with 404. OpenAPI root is restricted by Envoy and is not used as an anonymous availability check.
- Prepared activation values: Next.js NEXT_PUBLIC_SUPABASE_URL and Supabase SUPABASE_PUBLIC_URL = `https://coffeepassport.ru/supabase`; API_EXTERNAL_URL = `https://coffeepassport.ru/supabase/auth/v1`; SITE_URL = `https://coffeepassport.ru`. Runtime changes and Next.js rebuild occur only after domain TLS verification.
- DNS and domain certificate remain pending. Render, Supabase Cloud, DNS NS/MX/mail TXT, database contents, users, passwords and RLS unchanged.
