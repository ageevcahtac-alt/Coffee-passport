-- =========================================================
-- Этап 1.5 — мини-профиль гостя + кэшбэк на денежную часть чека
--
-- Две независимые доработки одним файлом:
--
-- 1. PROFILES: три self-editable колонки мини-профиля (phone, city,
--    favorite_drink) — по образцу display_name из 0012 (column-level grant
--    решает, что правит сам гость; row-level политика 0012 «user updates own
--    display name» уже разрешает update своей строки любой роли). phone —
--    только отображаемая маска +7, без SMS-верификации (решение владельца).
--    Бариста читает favorite_drink через ту же staff-политику 0012 — колонку
--    просто добавляем в select на клиенте.
--
-- 2. LOYALTY_CONSUME: база кэшбэка — только денежная часть чека
--    (gross − списанные зёрна). Раньше кэшбэк начислялся от полного gross,
--    включая оплаченное зёрнами — теперь зёрнами оплаченная половина чека
--    кэшбэк не приносит (стандартное правило «зёрна ≤ 50% чека»). Оплата
--    картой-депозитом — деньги, кэшбэк на неё идёт по-прежнему на полную
--    сумму чека. Прогресс ранга не меняется: полный gross, как и раньше.
--    Дроп+create — та же сигнатура и return jsonb, что и в 0040 (паттерн
--    идемпотентности 0040: return type не меняется молча).
--
-- Идемпотентность: add column if not exists, grant (идемпотентен сам),
-- drop function if exists + create. Повторный прогон на любом состоянии
-- даёт тот же результат и не трогает данные гостей.
--
-- Применение: workflow db-migrate (ручной запуск) — см. CLAUDE.md.
-- Проверка:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='profiles'
--       and column_name in ('phone','city','favorite_drink');
--   select proname from pg_proc where proname='loyalty_consume';
-- =========================================================

alter table public.profiles
  add column if not exists phone text;
alter table public.profiles
  add column if not exists city text;
alter table public.profiles
  add column if not exists favorite_drink text;

-- Тот же column-grant, что display_name в 0012 — теперь на все четыре
-- self-editable колонки (grant перечисляет полный набор, повторный — noop).
grant update (display_name, phone, city, favorite_drink) on public.profiles to authenticated;

-- Кэшбэк зёрнами — только с денежной части чека (gross − зёрна).
-- Остальное поведение loyalty_consume (0040) не меняется: clamp зёрен к
-- 50% чека и живому балансу, clamp карты к балансу карты, welcome 300
-- однократно, прогресс ранга по полному gross, мгновенное повышение кэшем.
drop function if exists public.loyalty_consume(uuid, text, numeric, integer, numeric);

create or replace function public.loyalty_consume(
  p_guest_id uuid,
  p_shop_id text,
  p_gross_amount numeric,
  p_beans_redeem integer default 0,
  p_card_pay numeric default 0
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status public.guest_shop_statuses;
  v_rank public.shop_ranks;
  v_card public.deposit_cards;
  v_consumption public.loyalty_consumptions;
  v_spend_before numeric;
  v_beans integer;
  v_alive integer;
  v_card_pay numeric;
  v_cash numeric;
  v_money numeric;
  v_earned integer;
  v_welcome integer;
  v_new_rank_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('barista', 'cafe_admin')
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to consume for this shop';
  end if;

  if not exists (select 1 from public.profiles where id = p_guest_id and role = 'enthusiast') then
    raise exception 'Guest profile not found';
  end if;

  if p_gross_amount <= 0 then
    raise exception 'Gross amount must be positive';
  end if;

  -- Ранг на момент чека: effective-ранг ДО этого чека (орден «навсегда» или
  -- скользящий по тратам) — чек не кэшбэкает сам себя новым рангом.
  select * into v_rank
  from public.shop_ranks
  where id = public.loyalty_effective_rank_id(p_guest_id, p_shop_id);

  -- Приветственные зёрна: только если потреблений ещё не было.
  v_welcome := 0;
  if not exists (
    select 1 from public.loyalty_consumptions
    where guest_id = p_guest_id and shop_id = p_shop_id
  ) then
    v_welcome := 300;
  end if;

  -- Зёрна: половина чека — потолок, живой баланс — вторая граница.
  v_beans := greatest(0, least(coalesce(p_beans_redeem, 0), floor(p_gross_amount / 2)::integer));
  v_alive := public.loyalty_beans_alive(p_guest_id, p_shop_id);
  if v_beans > v_alive then
    v_beans := v_alive;
  end if;

  -- Карта: clamp к балансу карты и к остатку чека после зёрен.
  v_card_pay := greatest(0, least(coalesce(p_card_pay, 0), p_gross_amount - v_beans));
  if v_card_pay > 0 then
    select * into v_card from public.deposit_cards
    where guest_id = p_guest_id and shop_id = p_shop_id
    for update;
    if not found then
      raise exception 'Deposit card not found for this guest at this shop';
    end if;
    if v_card.balance < v_card_pay then
      v_card_pay := v_card.balance;
    end if;
  end if;

  v_cash := p_gross_amount - v_beans - v_card_pay;
  -- Кэшбэк (0046): база — денежная часть чека. Зёрнами оплаченная часть
  -- кэшбэк не приносит; карта и наличные — деньги, идут в базу целиком.
  v_money := p_gross_amount - v_beans;
  v_earned := round(v_money * coalesce(v_rank.beans_percent, 0) / 100.0)::integer;

  insert into public.loyalty_consumptions (
    guest_id, shop_id, barista_id, rank_id,
    gross_amount, beans_redeemed, card_amount, cash_amount,
    beans_earned, welcome_granted
  ) values (
    p_guest_id, p_shop_id, auth.uid(), v_rank.id,
    p_gross_amount, v_beans, v_card_pay, v_cash,
    v_earned, v_welcome
  ) returning * into v_consumption;

  if v_welcome > 0 then
    insert into public.beans_ledger (guest_id, shop_id, delta, reason, consumption_id)
    values (p_guest_id, p_shop_id, v_welcome, 'welcome', v_consumption.id);
  end if;
  if v_earned > 0 then
    insert into public.beans_ledger (guest_id, shop_id, delta, reason, consumption_id)
    values (p_guest_id, p_shop_id, v_earned, 'earn', v_consumption.id);
  end if;
  if v_beans > 0 then
    insert into public.beans_ledger (guest_id, shop_id, delta, reason, consumption_id)
    values (p_guest_id, p_shop_id, -v_beans, 'redeem', v_consumption.id);
  end if;

  if v_card_pay > 0 then
    update public.deposit_cards
    set balance = v_card.balance - v_card_pay, updated_at = now()
    where id = v_card.id;
    insert into public.deposit_card_ledger (card_id, delta, reason, consumption_id)
    values (v_card.id, -v_card_pay, 'spend', v_consumption.id);
  end if;

  -- Мгновенное повышение: кэш ранга = ранг по тратам ВКЛЮЧАЯ этот чек;
  -- заодно точка отсчёта таймера зёрен. Орден «навсегда» кэш не сдвигает.
  v_spend_before := public.loyalty_spend_30d(p_guest_id, p_shop_id);
  select orden_rank_id, orden_pinned into v_status.orden_rank_id, v_status.orden_pinned
  from public.guest_shop_statuses
  where guest_id = p_guest_id and shop_id = p_shop_id;

  if v_status.orden_rank_id is not null and coalesce(v_status.orden_pinned, false) then
    v_new_rank_id := v_status.orden_rank_id;
  else
    v_new_rank_id := public.loyalty_rank_for_spend(p_shop_id, 'hall', v_spend_before);
  end if;

  insert into public.guest_shop_statuses (guest_id, shop_id, current_rank_id, last_purchase_at)
  values (p_guest_id, p_shop_id, v_new_rank_id, now())
  on conflict (guest_id, shop_id)
    do update set current_rank_id = excluded.current_rank_id,
                  last_purchase_at = excluded.last_purchase_at,
                  updated_at = now();

  return jsonb_build_object(
    'consumption', to_jsonb(v_consumption),
    'card', to_jsonb(v_card),
    'rank', to_jsonb(v_rank),
    'beans_balance_after', public.loyalty_beans_alive(p_guest_id, p_shop_id),
    'beans_expire_at', public.loyalty_beans_expire_at(p_guest_id, p_shop_id)
  );
end;
$$;

-- DROP FUNCTION выше снёс и гранты — возвращаем EXECUTE authenticated'у
-- (тот же грант, что и в 0040; клиенту SELECT-only, запись только через RPC).
grant execute on function public.loyalty_consume(uuid, text, numeric, integer, numeric) to authenticated;
