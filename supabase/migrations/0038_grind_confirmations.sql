-- =========================================================
-- GRIND CONFIRMATIONS — community sync (Grind Converter, phase 3)
--
-- Crowd-sourced grind-conversion data points ("brewed the source recipe's
-- grinder setting on MY grinder and it worked"), collected locally since
-- phase 2 (lib/data/grindConfirmationsStore.ts) and synced here so the
-- conversion hint (lib/utils/grindConvert.ts) can lean on community
-- experience across devices, not just one browser's localStorage.
--
-- Consent model — exactly the opt-in rule PR #86 established for checkins
-- (0026): a confirmation reaches this table ONLY when the tasting that
-- produced it was saved with is_public = true (sharedTastingIsPublic:
-- signed-in AND checkbox on). Anonymous or non-consented tastings never
-- push (the push call site checks the flag); RLS adds a second wall — an
-- insert naming someone else's owner_user_id is rejected.
--
-- Anonymity on read — same technique as 0026's checkins_community_view:
-- nobody reads the base table but its owner; the public tier is the
-- aggregate view below, which carries no user, lot or identity column at
-- all. Only conversion triples and a median survive.
--
-- Insert-only — same hardening as roast_batches (0023): an UPDATE/DELETE
-- trigger raises outright, on top of simply granting no such privileges.
-- =========================================================

create table if not exists public.grind_confirmations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  from_model text not null,
  to_model text not null,
  brewing_method text not null default '',
  from_setting text not null default '',
  to_setting text not null default '',
  -- Audit trail only, same text public_id convention as checkins.lot_id —
  -- never exposed through the aggregate view.
  lot_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_grind_confirmations_owner on public.grind_confirmations(owner_user_id);
create index if not exists idx_grind_confirmations_triple on public.grind_confirmations(from_model, to_model, brewing_method);

alter table public.grind_confirmations enable row level security;

-- INSERT and SELECT(own) only: no UPDATE/DELETE grant at all.
grant insert, select on public.grind_confirmations to authenticated;

create policy "owners insert own grind confirmations" on public.grind_confirmations
  for insert
  with check (auth.uid() = owner_user_id);

create policy "owners read own grind confirmations" on public.grind_confirmations
  for select
  using (auth.uid() = owner_user_id);

-- Immutable once written (0023's roast_batches pattern) — even the owner
-- cannot edit or delete a confirmation; corrections are new rows. One
-- deliberate divergence from 0023: owner_user_id cascades from auth.users
-- (0026's checkins convention), so the DELETE arm must let a cascade
-- through — an account deletion can never be held hostage by its own
-- data. PostgREST-originated requests always carry request.jwt.claims,
-- which is what distinguishes them from the cascade.
create or replace function public.prevent_grind_confirmation_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and nullif(current_setting('request.jwt.claims', true), '') is null then
    return old;
  end if;
  raise exception 'grind_confirmations rows are immutable once created (attempted % on id=%)', tg_op, coalesce(old.id, new.id);
end;
$$;

drop trigger if exists trg_grind_confirmations_immutable on public.grind_confirmations;
create trigger trg_grind_confirmations_immutable
  before update or delete on public.grind_confirmations
  for each row execute function public.prevent_grind_confirmation_mutation();

-- Public aggregate: the median confirmed target setting per conversion
-- triple. Free-text settings ("клик 24", "деление 4.5") are reduced to
-- their leading number — unparseable rows drop out of BOTH the median and
-- the count, so a junk confirmation can never skew or inflate an estimate.
-- No owner_user_id, no lot_id, no per-row text: aggregates only.
create or replace view public.grind_conversion_medians as
select
  from_model,
  to_model,
  brewing_method,
  count(*)::int as confirmations_count,
  percentile_cont(0.5) within group (
    order by substring(to_setting from '(-?[0-9]+(\.[0-9]+)?)')::numeric
  ) as median_to_setting
from public.grind_confirmations
where substring(to_setting from '(-?[0-9]+(\.[0-9]+)?)') is not null
group by from_model, to_model, brewing_method;

-- Same open read tier as checkins_community_view (0026): guests browsing a
-- recipe need no account to benefit from community conversions.
grant select on public.grind_conversion_medians to anon, authenticated;
