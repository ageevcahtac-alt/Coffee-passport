-- Partner directory: coffee_shops / roasters become the source of truth for
-- what the admin "Активировать партнёра" / "Реестр партнёров" screens and
-- the public /map show (before this, those lived only in the admin's own
-- browser localStorage — lib/data/coffeeShops.ts, roasters.ts).
--
-- Profile columns are nullable on purpose: a null means "not set in the
-- database", and the app falls back to the built-in card with the same slug
-- (lib/data/partnerRows.ts). That keeps rows created earlier as thin
-- identity anchors (0022, scripts/migrate-canonical-lot.ts — e.g.
-- 'roaster-xo') showing their current city / philosophy unchanged.
--
-- brand_color / color go straight into the Leaflet pin's inline style
-- (components/map/CafeMapClient.tsx), so only #RRGGBB is allowed in.
--
-- Every write goes through server routes with service_role
-- (app/api/admin/partners/**, app/api/cafe/map-profile) which pick the row
-- from the session, never from the request. The staff update policies from
-- 0025 let a cafe/roaster account change its own status, colour or slug
-- directly over REST, so they are dropped and writes revoked. Reads stay
-- public (0025): guests without a session must see the map.
-- Guarded by supabase/partnerDirectory.test.ts.

alter table public.coffee_shops
  add column if not exists status text not null default 'active',
  add column if not exists brand_color text,
  add column if not exists city text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists instagram_url text,
  add column if not exists telegram_url text,
  add column if not exists vk_url text,
  add column if not exists description text,
  add column if not exists working_hours text,
  add column if not exists photos text[],
  add column if not exists partner_request_id uuid references public.partner_requests(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.coffee_shops
  add constraint coffee_shops_status_check check (status in ('active', 'paused')),
  add constraint coffee_shops_brand_color_check check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint coffee_shops_point_check check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  );

alter table public.roasters
  add column if not exists status text not null default 'active',
  add column if not exists color text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists philosophy text,
  add column if not exists partner_request_id uuid references public.partner_requests(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.roasters
  add constraint roasters_status_check check (status in ('active', 'paused')),
  add constraint roasters_color_check check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- One partner card per request.
create unique index if not exists coffee_shops_partner_request_uidx
  on public.coffee_shops(partner_request_id) where partner_request_id is not null;
create unique index if not exists roasters_partner_request_uidx
  on public.roasters(partner_request_id) where partner_request_id is not null;

drop policy if exists "cafe staff manage own shop row" on public.coffee_shops;
drop policy if exists "roaster staff manage own roaster row" on public.roasters;
revoke insert, update, delete on public.coffee_shops, public.roasters from anon, authenticated;
