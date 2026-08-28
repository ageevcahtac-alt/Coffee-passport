-- =========================================================
-- Partner leads (B2B funnel) — public "Стать партнёром" form on the
-- landing page writes here; the /admin CRM reads/updates.
-- =========================================================

create table public.partner_requests (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  city text,
  contact_name text not null,
  email text not null,
  phone text,
  comment text,
  role_requested text not null default 'coffee_shop', -- 'coffee_shop' | 'roaster'
  status text not null default 'new',
  manager_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_requests_status_check
    check (status in ('new', 'in_progress', 'paid', 'activated'))
);

create index idx_partner_requests_status on public.partner_requests(status);
create index idx_partner_requests_created on public.partner_requests(created_at desc);

alter table public.partner_requests enable row level security;

-- Public lead capture: anyone can create a request, nobody can read/modify
-- through this policy alone.
create policy "public can submit partner requests" on public.partner_requests
  for insert
  with check (true);

-- NOTE — trust model: there is no service-role key configured for this
-- project and no Supabase-Auth-based admin role yet, so the /admin CRM's
-- read/update calls go through the anon key too (same pattern already
-- used by the existing /admin lot-creation form against `coffee_lots`).
-- The /admin UI itself is gated by HTTP Basic Auth at the edge
-- (middleware.ts), but that gate is invisible to Postgres RLS — anyone
-- who extracts the public anon key could, in principle, query this table
-- directly. Acceptable for now (this table holds basic contact info, not
-- secrets), but before handling anything more sensitive: add
-- SUPABASE_SERVICE_ROLE_KEY as a Render env var and move the admin
-- read/update calls to a server-only client that uses it instead of these
-- two policies.
create policy "anon can read partner requests" on public.partner_requests
  for select using (true);

create policy "anon can update partner requests" on public.partner_requests
  for update using (true);
