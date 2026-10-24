-- Roaster checkins: expose whether the profile was seen before tasting.
-- Append the flag to preserve existing view columns and access restrictions.
-- Guarded by supabase/checkinsRoasterViewProfileSeen.test.ts.

create or replace view public.checkins_roaster_view as
select
  c.id,
  c.lot_id,
  c.roaster_id,
  c.brewing_method,
  c.rating,
  c.acidity,
  c.sweetness,
  c.body,
  c.bitterness,
  c.sensory_tags,
  c.sub_descriptors,
  c.defects,
  c.liked,
  c.disliked,
  c.note,
  c.drink_category,
  c.drink_type,
  c.custom_drink_name,
  c.milk_base_type,
  c.cow_milk_type,
  c.is_lactose_free,
  c.fat_content_percent,
  c.plant_milk_type,
  c.milk_balance,
  c.coffee_readability,
  c.creaminess,
  c.aftertaste,
  c.created_at,
  c.profile_seen_before_tasting
from public.checkins c
join public.profiles p
  on p.id = auth.uid()
  and p.role = 'roaster_admin'
  and p.roaster_id = c.roaster_id;

grant select on public.checkins_roaster_view to authenticated;

notify pgrst, 'reload schema';
