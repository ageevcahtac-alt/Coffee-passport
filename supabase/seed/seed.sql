-- =========================================================
-- Seed data — demo values only, NOT real certified Q-scores.
-- =========================================================

-- ---------- Flavor tags ----------
insert into public.flavor_tags (slug, label, emoji, category) values
  ('floral', 'Floral', '🌸', 'floral'),
  ('jasmine', 'Jasmine', '🌸', 'floral'),
  ('fruity', 'Fruity', '🍑', 'fruity'),
  ('citrus', 'Citrus', '🍋', 'fruity'),
  ('bergamot', 'Bergamot', '🍋', 'fruity'),
  ('berry', 'Berry', '🍓', 'fruity'),
  ('stone_fruit', 'Stone fruit', '🍑', 'fruity'),
  ('peach', 'Peach', '🍑', 'fruity'),
  ('tropical', 'Tropical', '🥭', 'fruity'),
  ('sweet', 'Sweet', '🍯', 'sweet'),
  ('caramel', 'Caramel', '🍮', 'sweet'),
  ('chocolate', 'Chocolate', '🍫', 'sweet'),
  ('nutty', 'Nutty', '🥜', 'nutty'),
  ('spicy', 'Spicy', '🌶️', 'spicy'),
  ('tea', 'Tea-like', '🍵', 'other'),
  ('winey', 'Winey', '🍷', 'other');

-- ---------- Roasters (XO Coffee = real pilot; others = demo) ----------
insert into public.roasters (id, slug, name, description, city, country, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'xo-coffee', 'XO Coffee', 'Specialty coffee roaster and pilot partner.', null, null, true),
  ('00000000-0000-0000-0000-000000000002', 'demo-roaster-1', 'Demo Roaster One', 'Demo data for testing multi-roaster support.', null, null, true),
  ('00000000-0000-0000-0000-000000000003', 'demo-roaster-2', 'Demo Roaster Two', 'Demo data for testing multi-roaster support.', null, null, true);

-- ---------- Coffee shops ----------
insert into public.coffee_shops (id, slug, name, description, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'xo-coffee-shop', 'XO Coffee', 'XO Coffee''s own bar.', true),
  ('10000000-0000-0000-0000-000000000002', 'demo-shop-1', 'Demo Coffee Shop One', 'Demo data.', true),
  ('10000000-0000-0000-0000-000000000003', 'demo-shop-2', 'Demo Coffee Shop Two', 'Demo data.', true);

-- ---------- XO Coffee: coffees ----------
insert into public.coffees
  (id, roaster_id, slug, name, country, region, farm, variety, process, altitude_min, altitude_max, roast_level, tasting_notes, is_demo)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'ethiopia-guji', 'Ethiopia Guji', 'Ethiopia', 'Guji', 'Hambela', 'Heirloom', 'Washed', 1950, 2100, 'Light', 'Peach, jasmine, bergamot, sweet', true),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'ethiopia-yirgacheffe', 'Ethiopia Yirgacheffe', 'Ethiopia', 'Yirgacheffe', null, 'Heirloom', 'Washed', 1900, 2200, 'Light', 'Floral, lemon, honey', true),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'kenya-nyeri', 'Kenya Nyeri', 'Kenya', 'Nyeri', null, 'SL28 / SL34', 'Washed', 1700, 1900, 'Light-Medium', 'Blackcurrant, tomato, winey acidity', true),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'colombia-huila', 'Colombia Huila', 'Colombia', 'Huila', null, 'Caturra', 'Washed', 1600, 1900, 'Medium', 'Caramel, red apple, chocolate', true),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'brazil-cerrado', 'Brazil Cerrado', 'Brazil', 'Cerrado', null, 'Mundo Novo', 'Natural', 900, 1200, 'Medium', 'Nutty, chocolate, low acidity', true),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'rwanda', 'Rwanda', 'Rwanda', null, null, 'Bourbon', 'Washed', 1700, 2000, 'Light-Medium', 'Red berry, brown sugar', true),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'panama', 'Panama', 'Panama', 'Boquete', null, 'Geisha', 'Washed', 1500, 1700, 'Light', 'Jasmine, tropical fruit, tea-like', true);

-- ---------- XO Coffee: one demo lot per coffee ----------
insert into public.lots
  (id, coffee_id, lot_number, harvest_year, crop_year, roast_date, q_score, q_score_system, q_grader, q_grading_date, is_demo)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Lot 24', 2026, 2026, current_date - 5, 87.0, 'Q Arabica', 'Demo Grader', current_date - 20, true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Lot 11', 2026, 2026, current_date - 3, 88.5, 'Q Arabica', 'Demo Grader', current_date - 18, true),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Lot 7', 2025, 2025, current_date - 10, 86.25, 'Q Arabica', 'Demo Grader', current_date - 40, true),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'Lot 3', 2025, 2025, current_date - 7, 85.0, 'Q Arabica', 'Demo Grader', current_date - 30, true),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'Lot 9', 2025, 2025, current_date - 15, 83.5, 'Q Arabica', 'Demo Grader', current_date - 60, true),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', 'Lot 2', 2026, 2026, current_date - 4, 86.75, 'Q Arabica', 'Demo Grader', current_date - 25, true),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000007', 'Lot 1', 2026, 2026, current_date - 2, 90.0, 'Q Arabica', 'Demo Grader', current_date - 14, true);

-- ---------- QR codes ----------
insert into public.qr_codes (lot_id, unique_code) values
  ('30000000-0000-0000-0000-000000000001', 'XO-GUJI-2026-LOT24'),
  ('30000000-0000-0000-0000-000000000002', 'XO-YIRG-2026-LOT11'),
  ('30000000-0000-0000-0000-000000000003', 'XO-NYERI-2025-LOT7'),
  ('30000000-0000-0000-0000-000000000004', 'XO-HUILA-2025-LOT3'),
  ('30000000-0000-0000-0000-000000000005', 'XO-CERRADO-2025-LOT9'),
  ('30000000-0000-0000-0000-000000000006', 'XO-RWANDA-2026-LOT2'),
  ('30000000-0000-0000-0000-000000000007', 'XO-PANAMA-2026-LOT1');

-- ---------- Coffee <-> flavor tags ----------
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000001', id from public.flavor_tags where slug in ('peach', 'jasmine', 'bergamot', 'sweet');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000002', id from public.flavor_tags where slug in ('floral', 'citrus', 'sweet');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000003', id from public.flavor_tags where slug in ('berry', 'winey');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000004', id from public.flavor_tags where slug in ('caramel', 'chocolate');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000005', id from public.flavor_tags where slug in ('nutty', 'chocolate');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000006', id from public.flavor_tags where slug in ('berry', 'caramel');
insert into public.coffee_flavors (coffee_id, flavor_tag_id)
select '20000000-0000-0000-0000-000000000007', id from public.flavor_tags where slug in ('jasmine', 'tropical', 'tea');

-- ---------- Coffee shop availability ----------
insert into public.coffee_shop_lots (coffee_shop_id, lot_id)
select '10000000-0000-0000-0000-000000000001', id from public.lots where is_demo = true;

-- NOTE: demo users/reviews are intentionally left out of this static seed —
-- they depend on auth.users rows created via Supabase Auth. Create them with
-- the companion script `supabase/seed/run.ts` (step 14 of the build order)
-- once Supabase Auth is wired up, so reviews can reference real auth user ids.