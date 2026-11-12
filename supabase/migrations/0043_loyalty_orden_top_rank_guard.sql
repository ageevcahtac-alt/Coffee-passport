-- =========================================================
-- Орден — уточнение владельца (после 0040/0041, правило владельца)
--
-- Орден существует ТОЛЬКО на высшем ранге лестницы контура «Зал»
-- («Хранитель вкуса», топ по rank_order). Привилегия ручного назначения из
-- кабинета кофейни; семантика — блок от скольжения вниз: пока орден
-- закреплён, effective-ранг не опускается ниже топового ранга, даже при
-- тратах < 1000 ₽ за 30 дней. Открепили орден — обычное скольжение по
-- фактическим тратам (Хранитель без ордена скользит наравне со всеми,
-- зёрна сгорают по общим правилам — 90 дней).
--
-- Идемпотентна: create or replace поверх функции 0040 (сигнатуру и гранты
-- не трогаем). p_rank_id, не совпадающий с топовым рангом кофейни, —
-- ошибка; p_rank_id null по-прежнему открепляет орден.
-- =========================================================

create or replace function public.loyalty_assign_orden(
  p_guest_id uuid,
  p_shop_id text,
  p_rank_id uuid,
  p_pinned boolean default true
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status public.guest_shop_statuses;
  v_top_rank_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'cafe_admin'
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to assign orden for this shop';
  end if;

  -- Высший ранг лестницы «Зал» этой кофейни — единственный допустимый
  -- носитель ордена. Уровень по-прежнему параметризуется p_rank_id, но
  -- зафиксирован на топовом ранге: любой другой уровень — ошибка.
  select id into v_top_rank_id
  from public.shop_ranks
  where shop_id = p_shop_id and circuit = 'hall'
  order by rank_order desc
  limit 1;

  if p_rank_id is not null and (v_top_rank_id is null or p_rank_id <> v_top_rank_id) then
    raise exception 'Orden can only be pinned to the top hall rank';
  end if;

  insert into public.guest_shop_statuses (guest_id, shop_id, orden_rank_id, orden_pinned)
  values (p_guest_id, p_shop_id, p_rank_id, coalesce(p_pinned, true))
  on conflict (guest_id, shop_id)
    do update set orden_rank_id = excluded.orden_rank_id,
                  orden_pinned = excluded.orden_pinned,
                  updated_at = now()
  returning * into v_status;

  return jsonb_build_object('status', to_jsonb(v_status));
end;
$$;

grant execute on function public.loyalty_assign_orden(uuid, text, uuid, boolean) to authenticated;
