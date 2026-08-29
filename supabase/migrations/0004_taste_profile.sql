-- =========================================================
-- Вкусовой Паспорт (Enthusiast Journal) + B2B guest-taste widget
-- =========================================================
-- `public.reviews` (0001) is a lightweight rating+notes table with no
-- flavor axes and predates the guided tasting flow the frontend actually
-- ships (see lib/types/coffee.ts TastingRecord / components/coffee/
-- TastingForm.tsx): per-cup acidity/sweetness/body/bitterness sliders,
-- sensory tags, body texture, defects. `tasting_notes` here is the real
-- backing table for that flow — richer than `reviews`, not a replacement
-- for it. `public.users` is this schema's "profiles" table (see 0001).

-- =========================================================
-- TASTING NOTES (one row per guided tasting — never overwritten, same
-- history-preserving model as `reviews`)
-- =========================================================
create table public.tasting_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  coffee_shop_id uuid references public.coffee_shops(id) on delete set null,
  brewing_method text,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  -- guest's own blind-cupping read, 0-5 per axis — same shape as
  -- lots-adjacent roaster_flavor_profile so the two compare directly.
  acidity numeric(2,1) not null default 0 check (acidity between 0 and 5),
  sweetness numeric(2,1) not null default 0 check (sweetness between 0 and 5),
  body numeric(2,1) not null default 0 check (body between 0 and 5),
  bitterness numeric(2,1) not null default 0 check (bitterness between 0 and 5),
  body_texture text,
  sensory_tags jsonb not null default '[]'::jsonb,
  sub_descriptors jsonb not null default '{}'::jsonb,
  defects jsonb not null default '[]'::jsonb,
  liked text,
  disliked text,
  note text,
  barista_id uuid,
  barista_rating numeric(2,1) not null default 0,
  barista_note text,
  tasted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_tasting_notes_user on public.tasting_notes(user_id);
create index idx_tasting_notes_lot on public.tasting_notes(lot_id);
create index idx_tasting_notes_shop on public.tasting_notes(coffee_shop_id);

-- =========================================================
-- REPLIES — coffee shop / roaster response to a guest's tasting note
-- =========================================================
create table public.tasting_note_replies (
  id uuid primary key default uuid_generate_v4(),
  tasting_note_id uuid not null references public.tasting_notes(id) on delete cascade,
  responder_type text not null check (responder_type in ('coffee_shop', 'roaster')),
  coffee_shop_id uuid references public.coffee_shops(id) on delete cascade,
  roaster_id uuid references public.roasters(id) on delete cascade,
  author_user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasting_note_replies_responder_ref_check check (
    (responder_type = 'coffee_shop' and coffee_shop_id is not null and roaster_id is null) or
    (responder_type = 'roaster' and roaster_id is not null and coffee_shop_id is null)
  )
);

create index idx_tnr_tasting_note on public.tasting_note_replies(tasting_note_id);

-- =========================================================
-- PROFILE aggregates (on `public.users`, this schema's profiles table)
-- =========================================================
alter table public.users
  add column if not exists taste_profile jsonb not null default '{}'::jsonb,
  add column if not exists favorite_regions jsonb not null default '[]'::jsonb,
  add column if not exists favorite_processes jsonb not null default '[]'::jsonb;

comment on column public.users.taste_profile is
  'Average acidity/sweetness/body/bitterness (0-5) across this user''s highly-rated (>=4) tasting_notes. Recomputed by trg_tasting_notes_update_taste_profile.';
comment on column public.users.favorite_regions is
  'Top countries by tasting_notes count, [{"region": "...", "count": n}], desc.';
comment on column public.users.favorite_processes is
  'Top processing methods by tasting_notes count, [{"process": "...", "count": n}], desc.';

-- =========================================================
-- Recompute + trigger: keep users.taste_profile/favorite_* in sync with
-- tasting_notes on every insert/update/delete (server-side, not app code,
-- so it can never drift regardless of which client wrote the note).
-- =========================================================
create or replace function public.recompute_taste_profile(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_taste jsonb;
  v_regions jsonb;
  v_processes jsonb;
begin
  select jsonb_build_object(
    'acidity', round(coalesce(avg(acidity), 0)::numeric, 2),
    'sweetness', round(coalesce(avg(sweetness), 0)::numeric, 2),
    'body', round(coalesce(avg(body), 0)::numeric, 2),
    'bitterness', round(coalesce(avg(bitterness), 0)::numeric, 2),
    'sample_size', count(*)
  )
  into v_taste
  from public.tasting_notes
  where user_id = p_user_id and rating >= 4;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_regions
  from (
    select c.country as region, count(*) as count
    from public.tasting_notes tn
    join public.lots l on l.id = tn.lot_id
    join public.coffees c on c.id = l.coffee_id
    where tn.user_id = p_user_id and c.country is not null
    group by c.country
    order by count(*) desc, c.country asc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_processes
  from (
    select c.process as process, count(*) as count
    from public.tasting_notes tn
    join public.lots l on l.id = tn.lot_id
    join public.coffees c on c.id = l.coffee_id
    where tn.user_id = p_user_id and c.process is not null
    group by c.process
    order by count(*) desc, c.process asc
    limit 5
  ) t;

  update public.users
  set taste_profile = coalesce(v_taste, '{}'::jsonb),
      favorite_regions = v_regions,
      favorite_processes = v_processes,
      updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.trg_tasting_notes_update_taste_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_taste_profile(old.user_id);
    return old;
  end if;

  perform public.recompute_taste_profile(new.user_id);
  if tg_op = 'UPDATE' and old.user_id <> new.user_id then
    perform public.recompute_taste_profile(old.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_tasting_notes_change on public.tasting_notes;
create trigger on_tasting_notes_change
  after insert or update or delete on public.tasting_notes
  for each row execute function public.trg_tasting_notes_update_taste_profile();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.tasting_notes enable row level security;
alter table public.tasting_note_replies enable row level security;

-- Guest: owner-only CRUD on their own tasting notes (same shape as `reviews`).
create policy "user manages own tasting_notes" on public.tasting_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- B2B: shop staff read tasting notes left at their shop; roaster staff read
-- tasting notes on their own lots — this is what feeds GuestFeedback / lot
-- analytics on the partner dashboards.
create policy "shop staff read shop tasting_notes" on public.tasting_notes
  for select using (
    exists (
      select 1 from public.coffee_shop_members m
      where m.coffee_shop_id = tasting_notes.coffee_shop_id and m.user_id = auth.uid()
    )
  );

create policy "roaster staff read their lot tasting_notes" on public.tasting_notes
  for select using (
    exists (
      select 1 from public.lots l
      join public.coffees c on c.id = l.coffee_id
      join public.roaster_members m on m.roaster_id = c.roaster_id
      where l.id = tasting_notes.lot_id and m.user_id = auth.uid()
    )
  );

-- Replies: the guest reads replies to their own notes; partner staff manage
-- replies authored under their own org.
create policy "guest reads replies to own tasting_notes" on public.tasting_note_replies
  for select using (
    exists (select 1 from public.tasting_notes tn where tn.id = tasting_note_id and tn.user_id = auth.uid())
  );

create policy "shop staff manage own shop replies" on public.tasting_note_replies
  for all using (
    responder_type = 'coffee_shop' and exists (
      select 1 from public.coffee_shop_members m
      where m.coffee_shop_id = tasting_note_replies.coffee_shop_id and m.user_id = auth.uid()
    )
  ) with check (
    responder_type = 'coffee_shop' and author_user_id = auth.uid() and exists (
      select 1 from public.coffee_shop_members m
      where m.coffee_shop_id = tasting_note_replies.coffee_shop_id and m.user_id = auth.uid()
    )
  );

create policy "roaster staff manage own roaster replies" on public.tasting_note_replies
  for all using (
    responder_type = 'roaster' and exists (
      select 1 from public.roaster_members m
      where m.roaster_id = tasting_note_replies.roaster_id and m.user_id = auth.uid()
    )
  ) with check (
    responder_type = 'roaster' and author_user_id = auth.uid() and exists (
      select 1 from public.roaster_members m
      where m.roaster_id = tasting_note_replies.roaster_id and m.user_id = auth.uid()
    )
  );

-- Partner staff need to see the *aggregate* taste profile of a guest who
-- tasted at their shop/lot (the "Вкусовой профиль гостя" widget), not just
-- the one note — extend `users` SELECT (OR'd with the existing "own
-- profile" policy from 0001) rather than a view, since a plain view does
-- not bypass the underlying table's RLS in Postgres.
create policy "partner staff read taste profile of their guests" on public.users
  for select using (
    exists (
      select 1 from public.tasting_notes tn
      where tn.user_id = users.id
      and (
        exists (
          select 1 from public.coffee_shop_members m
          where m.coffee_shop_id = tn.coffee_shop_id and m.user_id = auth.uid()
        )
        or exists (
          select 1 from public.lots l
          join public.coffees c on c.id = l.coffee_id
          join public.roaster_members m on m.roaster_id = c.roaster_id
          where l.id = tn.lot_id and m.user_id = auth.uid()
        )
      )
    )
  );
