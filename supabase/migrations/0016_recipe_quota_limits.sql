-- =========================================================
-- Anti-spam quotas for barista/enthusiast recipe authoring
-- =========================================================
-- Three hard limits, scoped to author_type in ('barista','enthusiast') only
-- (roaster/coffee_shop recipes stay catalog data with no draft/publish
-- concept, unaffected by anything below):
--   1. max_custom_methods = 5 custom brewing methods per owner.
--   2. max_drafts_per_method = 5 unpublished (is_public = false) recipes
--      per (author, brewing_method_id) — GLOBAL across all lots, not per
--      lot, since this is an anti-spam limit on the author, not a
--      per-catalog-entry limit.
--   3. max_public_interval_per_method = 1 publish per (author,
--      brewing_method_id) per 14 days.
--
-- Enforced here as BEFORE triggers rather than app-level checks or RLS
-- `with check` subqueries: this app's recipe writes go straight from the
-- browser to Supabase with the anon key (see lib/supabase/adminClient.ts's
-- own header note — there is no service-role key configured for this
-- project, and no Next.js API layer sits in front of public.recipes
-- today). A trigger is the one thing a client can't route around by
-- calling Supabase's REST API directly instead of going through this
-- app's own UI/store code.
--
-- As always: cannot apply this myself from this environment (see 0005's
-- header for why). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

-- =========================================================
-- Custom brewing methods — id/name/... is 'custom-<generateId()>' from the
-- client, same "plain text id" convention as everywhere else in this app.
-- Owner-private: no approval workflow (unlike public.custom_devices'
-- equivalent, that one promotes into a platform-wide preset list — this is
-- a different axis, "which brewing method", not "which physical device").
-- =========================================================
create table if not exists public.custom_brew_methods (
  id text primary key,
  owner_type text not null check (owner_type in ('barista', 'enthusiast')),
  owner_id text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_custom_brew_methods_owner on public.custom_brew_methods(owner_type, owner_id);

alter table public.custom_brew_methods enable row level security;

drop policy if exists "owner manages own custom methods" on public.custom_brew_methods;
create policy "owner manages own custom methods" on public.custom_brew_methods
  for all
  using (
    (owner_type = 'enthusiast' and auth.uid()::text = owner_id)
    or (owner_type = 'barista' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'barista' and p.barista_id = custom_brew_methods.owner_id
    ))
  )
  with check (
    (owner_type = 'enthusiast' and auth.uid()::text = owner_id)
    or (owner_type = 'barista' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'barista' and p.barista_id = custom_brew_methods.owner_id
    ))
  );

grant select, insert, update, delete on public.custom_brew_methods to authenticated;

create or replace function public.enforce_custom_method_limit()
returns trigger
language plpgsql
as $$
declare
  existing_count int;
begin
  select count(*) into existing_count
  from public.custom_brew_methods
  where owner_type = new.owner_type and owner_id = new.owner_id;

  if existing_count >= 5 then
    raise exception 'Лимит кастомных способов заваривания (5) исчерпан для этого пользователя.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_custom_method_limit on public.custom_brew_methods;
create trigger trg_enforce_custom_method_limit
  before insert on public.custom_brew_methods
  for each row execute function public.enforce_custom_method_limit();

-- =========================================================
-- Publish-event audit log — outlives the recipe row on purpose (deleting a
-- published recipe must NOT reset its method's 14-day cooldown, per spec:
-- "разрешить редактирование и удаление уже опубликованного рецепта" is
-- about the recipe's own lifecycle, not about resetting the anti-spam
-- clock). No INSERT/UPDATE/DELETE grant to authenticated/anon at all — the
-- only writer is enforce_recipe_quotas() below, security definer.
-- =========================================================
create table if not exists public.recipe_publish_events (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null,
  author_type text not null,
  author_id text not null,
  brewing_method_id text not null,
  published_at timestamptz not null default now()
);

create index if not exists idx_recipe_publish_events_lookup
  on public.recipe_publish_events(author_type, author_id, brewing_method_id, published_at desc);

alter table public.recipe_publish_events enable row level security;

-- Readable by the same "owner or this shop's staff" audience as recipes
-- itself — needed client-side to render "next eligible date" (see
-- components/coffee/RecipeQuotaPanel.tsx).
drop policy if exists "owner reads own publish events" on public.recipe_publish_events;
create policy "owner reads own publish events" on public.recipe_publish_events
  for select
  using (
    (author_type = 'enthusiast' and auth.uid()::text = author_id)
    or (author_type = 'barista' and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'barista' and p.barista_id = recipe_publish_events.author_id)
          -- cafe_admin sees only THIS shop's baristas' events, not every
          -- shop's — joined through barista_profiles rather than trusting
          -- role alone (a bare `p.role = 'cafe_admin'` here would have let
          -- any cafe_admin, at any shop, read every barista's publish
          -- history platform-wide).
          or (p.role = 'cafe_admin' and exists (
            select 1 from public.barista_profiles bp
            where bp.id = recipe_publish_events.author_id and bp.coffee_shop_id = p.cafe_id
          ))
        )
    ))
  );

grant select on public.recipe_publish_events to authenticated;

-- =========================================================
-- The quota trigger on public.recipes itself.
-- =========================================================
create or replace function public.enforce_recipe_quotas()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  draft_count int;
  cooldown_active boolean;
begin
  -- Only barista/enthusiast recipes are quota-scoped — roaster/coffee_shop
  -- rows (always is_public = true, see ProRecipeForm) never hit either
  -- branch below.
  if new.author_type not in ('barista', 'enthusiast') then
    return new;
  end if;

  -- Draft-slot cap: 5 open drafts per (author, method), globally across
  -- every lot — an anti-spam limit on the author, not the catalog entry.
  -- Checked whenever a row newly BECOMES a draft — a fresh INSERT, or an
  -- UPDATE where old.is_public was true (un-publishing back to draft) —
  -- not on a plain content edit that leaves an already-draft row as a
  -- draft (old.is_public = false -> new.is_public = false), which doesn't
  -- claim a new slot. `id <> new.id` is a no-op on INSERT (the row doesn't
  -- exist yet) but is what makes the UPDATE branch correct: without it, a
  -- client could flip a published recipe back to draft with no cap check
  -- at all, silently exceeding 5 drafts for that method.
  if new.is_public = false and (tg_op = 'INSERT' or old.is_public = true) then
    select count(*) into draft_count
    from public.recipes
    where author_type = new.author_type
      and author_id = new.author_id
      and brewing_method_id = new.brewing_method_id
      and is_public = false
      and id <> new.id;

    if draft_count >= 5 then
      raise exception 'Лимит черновиков (5) для этого способа заваривания исчерпан. Удалите один из старых черновиков.';
    end if;
  end if;

  -- Publishing: either created straight as public, or an existing draft
  -- flips false -> true. Editing/deleting an already-public recipe (is_public
  -- staying true, or the DELETE itself) never reaches here.
  if (tg_op = 'INSERT' and new.is_public = true)
     or (tg_op = 'UPDATE' and old.is_public = false and new.is_public = true) then

    select exists (
      select 1 from public.recipe_publish_events e
      where e.author_type = new.author_type
        and e.author_id = new.author_id
        and e.brewing_method_id = new.brewing_method_id
        and e.published_at > now() - interval '14 days'
    ) into cooldown_active;

    if cooldown_active then
      raise exception 'Публикация для этого способа заваривания доступна не чаще раза в 14 дней.';
    end if;

    insert into public.recipe_publish_events (recipe_id, author_type, author_id, brewing_method_id)
    values (new.id, new.author_type, new.author_id, new.brewing_method_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_recipe_quotas on public.recipes;
create trigger trg_enforce_recipe_quotas
  before insert or update on public.recipes
  for each row execute function public.enforce_recipe_quotas();
