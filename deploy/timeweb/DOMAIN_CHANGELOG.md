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
- Source image rollback copy saved locally under ignored `.next/source-backup/`; committed source remains unchanged and server baseline remains available in Git.
- Browser checks passed at 320/390/768/1440: computed main background `rgb(245, 242, 235)`, full image ratio, original opens, no horizontal overflow or page errors.
- Auth tests passed: 13 tests in three files, including public-host callback and arbitrary Host rejection.
- Found and fixed callback redirect to `https://localhost:3000`. Focused commit `856f42f1e6fd87aaeae0af376dc6d46cac8f5d8f` deployed after successful server build and Next.js restart. Confirmed redirect now uses `https://147.45.102.186/auth/login`.
- Main and login routes respond after restart; guest cafe/roaster cabinet requests redirect to login. Recovery page returns 200. Supabase Auth health returns 200 with public key, without exposing it.
- IP certificate valid through 2026-10-16; renewal timer enabled and most recent renewal service result success/exit 0. Domain certificate has not been issued.
- Commits `f54b4b6` and `856f42f` pushed. No authenticated user login, valid callback exchange or password update was performed, respecting the prohibition on password/data changes.
- Database contents, users, roles, passwords and RLS unchanged. IP cookies/localStorage do not migrate to the domain.

## Pending acceptance

- Owner action: change apex A record to `147.45.102.186`.
- Actual domain DNS/HTTPS and renewal dry run.
- Computed background and screenshots at 320/390/768/1440 px.
- Background seam elimination while preserving protected pixels.
- API, authenticated access, callback and recovery via domain; Next.js restart verification.
