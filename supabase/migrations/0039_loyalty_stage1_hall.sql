-- =========================================================
-- LOYALTY — STAGE 1, контур «Зал» (пересборка программы XO COFFEE)
--
-- Stage 1 полностью заменяет модуль 0012 (ранги «визиты И сумма» со
-- скидкой у кассы + абонементы с фиксированным номиналом). База лояльности
-- пустая (0 гостей) — миграции гостевых данных не нужны, старая конфигурация
-- рангов (Bronze/Silver/Gold/Platinum) удаляется и заменяется лестницей из
-- 7 рангов контура «Зал».
--
-- Новая модель (бриф владельца):
--   Ранг  = сумма трат за СКОЛЬЗЯЩИЕ 30 дней (только сумма; критерий визитов
--           убран). Повышение — мгновенно в момент потребления (кэш
--           current_rank_id), понижение — read-time по фактическим тратам
--           за 30 дней (как раньше сгорание ранга: без cron, без перезаписи).
--   Зёрна = 1 зерно = 1 ₽. Кэшбэк зёрнами на КАЖДОЕ потребление по % ранга
--           (ранг на момент чека). Списание зёрен — до 50% чека; при нехватке
--           списываем доступное (clamp, не отказ — зафиксировано в отчёте
--           этапа 1). Сгорание read-time: всё, что старше 90 дней от последней
--           покупки, мертво (материализованных строк сгорания нет).
--   Карта-депозит = былой «абонемент»; баланс не сгорает никогда; покупка/
--           пополнение НЕ даёт ни прогресса ранга, ни зёрен; оплата с карты —
--           обычное потребление (полный прогресс + зёрна); частичное
--           списание с доплатой живыми разрешено (карта покрывает сколько
--           может, остаток — наличные).
--   Орден = ручное назначение ранга из кабинета кофейни; с флагом «навсегда»
--           ранг не скользит read-time (зёрна у орденоносца сгорают по общим
--           правилам).
--   Приветственные 300 зёрен — один раз, автоматически при первом
--           потреблении зарегистрированного гостя.
--
-- Контур: вся схема несёт circuit text ('hall' по умолчанию), чтобы контур
-- «Дом» со своими порогами добавился отдельной миграцией без перелома
-- схемы. Сам «Дом» в этом этапе НЕ реализуем.
--
-- Как всегда: применить можно только через Supabase SQL Editor /
-- `supabase db push` (см. заголовок 0012).
-- =========================================================

-- =========================================================
-- Убираем старое ядро 0012: RPC и таблицы (база пустая — данные не мигрируем)
-- =========================================================
drop function if exists public.loyalty_redeem(uuid, text, numeric, uuid);
drop function if exists public.loyalty_sell_subscription(uuid, text, numeric);
drop function if exists public.loyalty_rank_for(text, integer, numeric);

drop table if exists public.loyalty_transactions;
drop table if exists public.subscriptions;

-- =========================================================
-- SHOP_RANKS v2 — лестница рангов контура. Управляется данными: cafe_admin
-- правит названия/пороги/проценты/цвета из кабинета кофейни.
-- =========================================================
alter table public.shop_ranks
  add column if not exists circuit text not null default 'hall',
  add column if not exists color_hex text not null default '#6F4E37'
    check (color_hex ~ '^#[0-9A-Fa-f]{6}$');

-- Процент ранга теперь — КЭШБЭК ЗЁРНАМИ (не скидка у кассы: скидки в новой
-- модели нет, чек оплачивается полностью, рублёвый % возвращается зёрнами).
alter table public.shop_ranks rename column discount_percent to beans_percent;
alter table public.shop_ranks alter column beans_percent type integer;
alter table public.shop_ranks drop constraint if exists shop_ranks_discount_percent_check;
alter table public.shop_ranks add constraint shop_ranks_beans_percent_check
  check (beans_percent between 0 and 100);

-- Порог — сумма трат за скользящие 30 дней; критерий визитов и retention
-- (ранг больше не «сгорает» — он скользит read-time) уходят.
alter table public.shop_ranks rename column required_spend to required_spend_30d;
alter table public.shop_ranks drop column if exists required_visits;
alter table public.shop_ranks drop column if exists retention_days;

-- Уникальность ранга — внутри (кофейня, контур).
alter table public.shop_ranks drop constraint if exists shop_ranks_shop_id_rank_name_key;
alter table public.shop_ranks add constraint shop_ranks_shop_circuit_name_key
  unique (shop_id, circuit, rank_name);

create index if not exists idx_shop_ranks_shop_circuit on public.shop_ranks(shop_id, circuit);

-- =========================================================
-- GUEST_SHOP_STATUSES v2 — состояние гостя в кофейне. current_rank_id —
-- КЭШ ранга на момент последнего потребления (мгновенное повышение);
-- effective-ранг read-time считает loyalty_effective_rank_id() и может быть
-- НИЖЕ кэша, когда траты за 30 дней просели. orden_* — ручное назначение.
-- =========================================================
alter table public.guest_shop_statuses drop column if exists visits_count;
alter table public.guest_shop_statuses drop column if exists total_spent;
alter table public.guest_shop_statuses drop column if exists last_visit_at;
alter table public.guest_shop_statuses drop column if exists rank_expires_at;

alter table public.guest_shop_statuses
  add column if not exists orden_rank_id uuid references public.shop_ranks(id) on delete set null,
  add column if not exists orden_pinned boolean not null default false,
  add column if not exists last_purchase_at timestamptz;

-- =========================================================
-- DEPOSIT_CARDS — карта-депозит (бывшие «абонементы»). Одна карта на пару
-- (гость, кофейня): пополнение увеличивает баланс той же строки. Баланс не
-- сгорает никогда — срока действия у карты нет намеренно.
-- =========================================================
create table if not exists public.deposit_cards (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  balance numeric not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guest_id, shop_id)
);

create index if not exists idx_deposit_cards_shop on public.deposit_cards(shop_id);

-- Движения по карте: topup (покупка/пополнение бариста) и spend (часть чека,
-- покрытая картой). Сумма = gross чека целиком — поэтому spend здесь только
-- движение баланса, а само потребление живёт в loyalty_consumptions.
create table if not exists public.deposit_card_ledger (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.deposit_cards(id) on delete cascade,
  delta numeric not null check (delta <> 0),
  reason text not null check (reason in ('topup', 'spend')),
  consumption_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_deposit_card_ledger_card on public.deposit_card_ledger(card_id);

-- =========================================================
-- LOYALTY_CONSUMPTIONS — единый журнал потребления (чек). Любой исход оплаты
-- (наличные, зёрна, карта, смесь) — это потребление: полный gross идёт в
-- прогресс ранга и в базу кэшбэка. barista_id — кто провёл чек.
-- =========================================================
create table if not exists public.loyalty_consumptions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  barista_id uuid references auth.users(id) on delete set null,
  rank_id uuid references public.shop_ranks(id) on delete set null,
  gross_amount numeric not null check (gross_amount > 0),
  beans_redeemed integer not null default 0 check (beans_redeemed >= 0),
  card_amount numeric not null default 0 check (card_amount >= 0),
  cash_amount numeric not null default 0 check (cash_amount >= 0),
  beans_earned integer not null default 0 check (beans_earned >= 0),
  welcome_granted integer not null default 0 check (welcome_granted >= 0),
  created_at timestamptz not null default now(),
  -- Потолок зёрен: не больше половины чека; зёрна + карта не покрывают чек
  -- сверх его суммы (остаток — наличные, cash_amount >= 0 из баланса уравнения).
  constraint loyalty_consumptions_beans_half_check check (beans_redeemed <= gross_amount / 2),
  constraint loyalty_consumptions_cover_check check (beans_redeemed + card_amount <= gross_amount)
);

create index if not exists idx_loyalty_consumptions_guest on public.loyalty_consumptions(guest_id);
create index if not exists idx_loyalty_consumptions_shop on public.loyalty_consumptions(shop_id);
create index if not exists idx_loyalty_consumptions_guest_created on public.loyalty_consumptions(guest_id, created_at);

alter table public.deposit_card_ledger
  add constraint deposit_card_ledger_consumption_fk
  foreign key (consumption_id) references public.loyalty_consumptions(id) on delete set null;

-- =========================================================
-- BEANS_LEDGER — движения зёрен. Начисления/списания материализованы,
-- сгорание — НЕТ: мёртвым считается всё, что старше 90 дней от последней
-- покупки (read-time, см. loyalty_beans_alive). delta integer: 1 зерно = 1 ₽.
-- =========================================================
create table if not exists public.beans_ledger (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('welcome', 'earn', 'redeem')),
  consumption_id uuid references public.loyalty_consumptions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_beans_ledger_guest on public.beans_ledger(guest_id);
create index if not exists idx_beans_ledger_guest_created on public.beans_ledger(guest_id, created_at);
create index if not exists idx_beans_ledger_shop on public.beans_ledger(shop_id);

-- =========================================================
-- Read-time функции (stable, не мутируют ничего)
-- =========================================================

-- Траты за скользящие 30 дней — база скольжения ранга.
create or replace function public.loyalty_spend_30d(p_guest_id uuid, p_shop_id text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(gross_amount), 0)
  from public.loyalty_consumptions
  where guest_id = p_guest_id
    and shop_id = p_shop_id
    and created_at > now() - interval '30 days';
$$;

-- Высший ранг контура, чей порог трат за 30 дней достигнут.
create or replace function public.loyalty_rank_for_spend(p_shop_id text, p_circuit text, p_spend numeric)
returns uuid
language sql
stable
as $$
  select id from public.shop_ranks
  where shop_id = p_shop_id
    and circuit = p_circuit
    and required_spend_30d <= p_spend
  order by rank_order desc
  limit 1;
$$;

-- Живые зёрна: всё, начисленное не раньше (последняя покупка − 90 дней).
-- Покупок не было — живых зёрен нет (приветственные начисляются первой же
-- покупкой, так что «зёрен без покупок» не существует).
create or replace function public.loyalty_beans_alive(p_guest_id uuid, p_shop_id text)
returns integer
language sql
stable
as $$
  select coalesce(sum(bl.delta), 0)::integer
  from public.beans_ledger bl
  where bl.guest_id = p_guest_id
    and bl.shop_id = p_shop_id
    and bl.created_at >= (
      select max(c.created_at) - interval '90 days'
      from public.loyalty_consumptions c
      where c.guest_id = p_guest_id and c.shop_id = p_shop_id
    );
$$;

-- Момент сгорания: последняя покупка + 90 дней (для таймера в ЛК).
create or replace function public.loyalty_beans_expire_at(p_guest_id uuid, p_shop_id text)
returns timestamptz
language sql
stable
as $$
  select max(created_at) + interval '90 days'
  from public.loyalty_consumptions
  where guest_id = p_guest_id and shop_id = p_shop_id;
$$;

-- Effective-ранг read-time: орден «навсегда» побеждает всегда; иначе — ранг
-- по фактическим тратам за 30 дней (понижение без cron и без записи).
create or replace function public.loyalty_effective_rank_id(p_guest_id uuid, p_shop_id text, p_circuit text default 'hall')
returns uuid
language plpgsql
stable
as $$
declare
  v_orden uuid;
  v_pinned boolean;
begin
  select orden_rank_id, orden_pinned into v_orden, v_pinned
  from public.guest_shop_statuses
  where guest_id = p_guest_id and shop_id = p_shop_id;
  if v_orden is not null and coalesce(v_pinned, false) then
    return v_orden;
  end if;
  return public.loyalty_rank_for_spend(p_shop_id, p_circuit, public.loyalty_spend_30d(p_guest_id, p_shop_id));
end;
$$;

-- =========================================================
-- Записывающие RPC — security definer, как в 0012: клиенту SELECT-only,
-- все многостоловые записи только здесь, одна транзакция на операцию.
-- =========================================================

-- Покупка/пополнение карты-депозита. НИКАКОГО влияния на ранг и зёрна:
-- функция не трогает ни guest_shop_statuses, ни beans_ledger,
-- ни loyalty_consumptions — только карта и её журнал.
create or replace function public.loyalty_purchase_card(
  p_guest_id uuid,
  p_shop_id text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.deposit_cards;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('barista', 'cafe_admin')
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to sell a card for this shop';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.deposit_cards (guest_id, shop_id, balance)
  values (p_guest_id, p_shop_id, p_amount)
  on conflict (guest_id, shop_id)
    do update set balance = public.deposit_cards.balance + excluded.balance,
                  updated_at = now()
  returning * into v_card;

  insert into public.deposit_card_ledger (card_id, delta, reason)
  values (v_card.id, p_amount, 'topup');

  return jsonb_build_object('card', to_jsonb(v_card));
end;
$$;

-- Потребление (чек). Единственная точка начисления прогресса и зёрен.
-- Правила состава оплаты: gross = зёрна + карта + наличные.
--   зёрна  — clamp к половине чека и к живому балансу (при нехватке
--            списываем доступное — решение этапа 1, зафиксировано в отчёте);
--   карта  — clamp к балансу карты (частичное списание + доплата наличными);
--   наличные — остаток.
-- Кэшбэк: round(gross × % ранга на момент чека). Первое потребление гостя
-- в этой кофейне — +300 приветственных зёрен (одноразово, флаг в чеке).
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
  v_earned := round(p_gross_amount * coalesce(v_rank.beans_percent, 0) / 100.0)::integer;

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

-- Орден: ручное назначение ранга гостю. Только cafe_admin своей кофейни.
-- p_rank_id null — снять орден (ранг снова скользит). p_pinned true —
-- «навсегда»: ранг не скользит read-time.
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
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'cafe_admin'
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to assign orden for this shop';
  end if;

  if p_rank_id is not null and not exists (
    select 1 from public.shop_ranks
    where id = p_rank_id and shop_id = p_shop_id and circuit = 'hall'
  ) then
    raise exception 'Rank does not belong to this shop hall ladder';
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

-- =========================================================
-- RLS — те же паттерны, что 0012: клиент SELECT-only своего/своей кофейни,
-- все записи — через RPC выше. guest_shop_statuses/shop_ranks — прежние
-- политики 0012 остаются в силе (они не опираются на удалённые колонки).
-- =========================================================
alter table public.deposit_cards enable row level security;
alter table public.deposit_card_ledger enable row level security;
alter table public.beans_ledger enable row level security;
alter table public.loyalty_consumptions enable row level security;

-- deposit_cards: гость — своя карта, персонал — карты своей кофейни.
create policy "guest reads own deposit cards" on public.deposit_cards
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop deposit cards" on public.deposit_cards
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = deposit_cards.shop_id)
  );

-- deposit_card_ledger: чтение через карту (карта уже ограничена политикой выше).
create policy "guest reads own deposit card ledger" on public.deposit_card_ledger
  for select
  using (
    exists (select 1 from public.deposit_cards c where c.id = deposit_card_ledger.card_id and c.guest_id = auth.uid())
  );

create policy "shop staff read own shop deposit card ledger" on public.deposit_card_ledger
  for select
  using (
    exists (
      select 1 from public.deposit_cards c
      where c.id = deposit_card_ledger.card_id and c.shop_id in (
        select p.cafe_id from public.profiles p
        where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id is not null
      )
    )
  );

create policy "guest reads own beans ledger" on public.beans_ledger
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop beans ledger" on public.beans_ledger
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = beans_ledger.shop_id)
  );

create policy "guest reads own consumptions" on public.loyalty_consumptions
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop consumptions" on public.loyalty_consumptions
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = loyalty_consumptions.shop_id)
  );

-- GRANT: SELECT только — записи идут через security-definer функции.
grant select on public.deposit_cards to authenticated;
grant select on public.deposit_card_ledger to authenticated;
grant select on public.beans_ledger to authenticated;
grant select on public.loyalty_consumptions to authenticated;

grant execute on function public.loyalty_spend_30d(uuid, text) to authenticated;
grant execute on function public.loyalty_rank_for_spend(text, text, numeric) to authenticated;
grant execute on function public.loyalty_beans_alive(uuid, text) to authenticated;
grant execute on function public.loyalty_beans_expire_at(uuid, text) to authenticated;
grant execute on function public.loyalty_effective_rank_id(uuid, text, text) to authenticated;
grant execute on function public.loyalty_purchase_card(uuid, text, numeric) to authenticated;
grant execute on function public.loyalty_consume(uuid, text, numeric, integer, numeric) to authenticated;
grant execute on function public.loyalty_assign_orden(uuid, text, uuid, boolean) to authenticated;

-- =========================================================
-- Seed: лестница контура «Зал» для пилотной кофейни — замена старой
-- (Bronze/Silver/Gold/Platinum) полностью. Цвета — шкала обжарки
-- (зелёное зерно → глубокая тёмная). Пороги — сумма трат за 30 дней,
-- процент — кэшбэк зёрнами на чек.
-- =========================================================
delete from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk';

insert into public.shop_ranks
  (shop_id, circuit, rank_name, rank_order, color_hex, beans_percent, required_spend_30d)
values
  ('shop-xo-vsevolozhsk', 'hall', 'Первый глоток',    0, '#7FA650', 2,  0),
  ('shop-xo-vsevolozhsk', 'hall', 'Любитель',         1, '#D2B48C', 3,  1000),
  ('shop-xo-vsevolozhsk', 'hall', 'Дегустатор',       2, '#B08968', 4,  2000),
  ('shop-xo-vsevolozhsk', 'hall', 'Ценитель',         3, '#8B6B4A', 5,  3000),
  ('shop-xo-vsevolozhsk', 'hall', 'Знаток',           4, '#6F4E37', 6,  5000),
  ('shop-xo-vsevolozhsk', 'hall', 'Энтузиаст',        5, '#4E3429', 8,  8000),
  ('shop-xo-vsevolozhsk', 'hall', 'Хранитель вкуса',  6, '#2D1E18', 10, 10000)
on conflict (shop_id, circuit, rank_name) do nothing;
