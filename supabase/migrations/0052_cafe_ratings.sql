-- =========================================================
-- Рейтинг партнёрских кофеен «зёрнами» (1–5) + текстовые отзывы гостей
-- =========================================================
-- Механика Яндекс-карт в стилистике паспорта: гость после посещения
-- оценивает кофейну зёрнами (1–5), может приложить текст. Оцениваются
-- ТОЛЬКО партнёрские кофейни (строка в coffee_shops = участник программы),
-- ставить оценку может ТОЛЬКО залогиненный гость (profiles.role='enthusiast')
-- — страховка от накруток. Оценка публично анонимна: наружу через RPC
-- уходят только агрегаты и отзывы (score + текст + имя автора из профиля,
-- display_name; пусто — «Гость без имени»). user_id наружу не уходит.
--
-- Правила владельца (зафиксированы в коде функций):
--   * одна АКТИВНАЯ оценка на пару гость+кофейня — частичный unique index
--     (where deleted_at is null). Переоценки нет: пока оценка активна,
--     повторный вызов cafe_rate отклоняется;
--   * удалить свою оценку можно (cafe_unrate) — soft delete, deleted_at.
--     Удаление сносит и оценку, и отзыв (одна сущность). После удаления
--     гость может оценить заново — новая строка становится активной;
--   * полная история (включая удалённые строки) хранится в базе для аудита
--     и будущей ежегодной премии «Лучшая спешелти-кофейня» (считается по
--     активным оценкам года; удалённые в агрегаты не попадают);
--   * срок жизни оценки — бессрочно, пока не удалена;
--   * отзыв без оценки невозможен: текст живёт в той же строке, что score.
--
-- Агрегаты (средний балл, шаг 0,1; число оценок; распределение 1–5)
-- считаются на чтении (cafe_rating_summary) — без триггеров и материализо-
-- ванных колонок: менее инвазивно, мгновенно актуально после каждой
-- записи/удаления. Значок «Хорошее место — кофейное место» (средний ≥ 4,5
-- И минимум 3 активные оценки) считается в приложении из этого же summary
-- — пороги вынесены константами в lib/types/cafeRatings.ts.
--
-- Доступ (как в 0012/0039 — записи ходят только через security definer RPC,
-- у таблицы нет insert/update/delete-политик):
--   * select: гость читает СВОЮ активную оценку (состояние «уже оценил»);
--     staff кофейни (barista/cafe_admin с profiles.cafe_id = cafe_id) читает
--     все активные строки своей кофейни — для кабинета с гистограммой.
--     Строка для staff включает user_id — осознанно: опубликованный отзыв
--     и так идёт с именем автора, а staff уже работает с персональными
--     данными гостей в лояльности (та же политика «shop staff read own
--     shop», 0012/0039). Публичный путь (RPC ниже) user_id не возвращает
--     никогда — анонимность оценки наружу сохраняется полностью.
--   * cafe_rating_summary / cafe_rating_reviews: execute для anon +
--     authenticated — публичная карточка кофейни на /map читает агрегаты
--     и список отзывов без входа;
--   * cafe_rate / cafe_unrate: execute для anon + authenticated, но
--     внутри — auth.uid() обязателен и role='enthusiast'.
--
-- Идемпотентность: create table/index if not exists, create or replace
-- function, drop policy if exists + create policy, revoke/grant идемпотентны.
--
-- Проверка после наката:
--   select public.cafe_rating_summary('shop-xo-vsevolozhsk');
--   select * from public.cafe_rating_reviews('shop-xo-vsevolozhsk', 10);
--   select indexname from pg_indexes where tablename = 'cafe_ratings';
--     -- cafe_ratings_active_pair_uidx (partial), cafe_ratings_cafe_active_idx
-- =========================================================

create table if not exists public.cafe_ratings (
  id uuid primary key default gen_random_uuid(),
  -- slug партнёра (coffee_shops.slug = app id кофейни). RESTRICT: удаление
  -- партнёра не должно стирать историю оценок для аудита/премии — строка
  -- в каталоге удаляется только осознанным DBA-действием.
  cafe_id text not null references public.coffee_shops(slug) on delete restrict,
  -- NULL после удаления аккаунта гостя (SET NULL): оценки остаются в базе
  -- для аудита/премии, но теряют привязку к личности — удаление учётки
  -- обезличивывает, а не стирает. RPC всегда вставляет auth.uid().
  user_id uuid references auth.users(id) on delete set null,
  score smallint not null check (score between 1 and 5),
  -- NULL = оценка без текста (законно); текст без оценки невозможен в принципе.
  review text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Одна активная оценка на пару гость+кофейня (правило владельца №5).
-- Частичный индекс: удалённые строки (deleted_at is not null) не мешают
-- новой оценке той же пары, но остаются в таблице для аудита/премии.
create unique index if not exists cafe_ratings_active_pair_uidx
  on public.cafe_ratings (cafe_id, user_id)
  where deleted_at is null;

-- Агрегаты/гистограмма читаются по активным строкам кофейни.
create index if not exists cafe_ratings_cafe_active_idx
  on public.cafe_ratings (cafe_id)
  where deleted_at is null;

alter table public.cafe_ratings enable row level security;

-- Записи — только через RPC ниже (конвенция лояльности 0012/0039).
revoke insert, update, delete on public.cafe_ratings from anon, authenticated;
grant select on public.cafe_ratings to authenticated;

drop policy if exists "guest reads own active cafe rating" on public.cafe_ratings;
create policy "guest reads own active cafe rating" on public.cafe_ratings
  for select to authenticated
  using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "shop staff read own shop cafe ratings" on public.cafe_ratings;
create policy "shop staff read own shop cafe ratings" on public.cafe_ratings
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_ratings.cafe_id
    )
  );

-- =========================================================
-- Публичные чтения (anon + authenticated) — security definer:
-- агрегаты без user_id и отзывы с именем автора. RLS таблицы не мешает,
-- функция работает от владельца (postgres) и сама фильтрует deleted_at.
-- =========================================================

-- Средний балл (шаг 0,1), число активных оценок и распределение [1..5].
-- Считается на чтении — всегда актуально после постановки/удаления.
create or replace function public.cafe_rating_summary(p_cafe_id text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'average', round(avg(r.score)::numeric, 1),
    'count', count(*),
    'distribution', jsonb_build_array(
      count(*) filter (where r.score = 1),
      count(*) filter (where r.score = 2),
      count(*) filter (where r.score = 3),
      count(*) filter (where r.score = 4),
      count(*) filter (where r.score = 5)
    )
  )
  from public.cafe_ratings r
  where r.cafe_id = p_cafe_id and r.deleted_at is null;
$$;

-- Публичный список отзывов: только строки с текстом (оценки без текста
-- учитываются в агрегатах, но публиковать нечего). Имя — живое из профиля:
-- display_name, пусто — «Гость без имени». Автор оценки не разглашается.
create or replace function public.cafe_rating_reviews(p_cafe_id text, p_limit integer default 50)
returns table(score smallint, review text, author_name text, created_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select r.score, r.review,
         coalesce(nullif(trim(p.display_name), ''), 'Гость без имени') as author_name,
         r.created_at
  from public.cafe_ratings r
  left join public.profiles p on p.id = r.user_id
  where r.cafe_id = p_cafe_id
    and r.deleted_at is null
    and r.review is not null
    and btrim(r.review) <> ''
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- =========================================================
-- Записи. Возвращают jsonb {ok, error?} — клиент показывает error как есть
-- (конвенция loyalty_* из 0039/0046). Все проверки — в теле функции:
-- лимиты и роль можно читать из одного места, а unique-индекс остаётся
-- последним рубежом на гонку двух параллельных оценок.
-- =========================================================

create or replace function public.cafe_rate(p_cafe_id text, p_score integer, p_review text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_review text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Войдите, чтобы оценить кофейню.');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'enthusiast') then
    return jsonb_build_object('ok', false, 'error', 'Оценивать кофейни могут только гости.');
  end if;
  if p_score is null or p_score < 1 or p_score > 5 then
    return jsonb_build_object('ok', false, 'error', 'Оценка — от 1 до 5 зёрен.');
  end if;
  v_review := case when p_review is null then null else btrim(p_review) end;
  if v_review = '' then
    v_review := null;  -- пустая строка = оценка без текста
  end if;
  if v_review is not null and length(v_review) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'Отзыв слишком длинный: максимум 1000 символов.');
  end if;
  -- Только партнёрские кофейни (строка в каталоге 0036 = участник программы).
  if not exists (select 1 from public.coffee_shops s where s.slug = p_cafe_id) then
    return jsonb_build_object('ok', false, 'error', 'Эта кофейня не участвует в программе.');
  end if;
  -- Переоценки нет: пока активная оценка на пару есть — отказ.
  if exists (select 1 from public.cafe_ratings r where r.cafe_id = p_cafe_id and r.user_id = v_uid and r.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Вы уже оценили эту кофейню. Оценку можно удалить и поставить заново.');
  end if;
  begin
    insert into public.cafe_ratings (cafe_id, user_id, score, review)
    values (p_cafe_id, v_uid, p_score::smallint, v_review);
  exception
    when unique_violation then
      -- Гонка двух одновременных оценок той же пары: индекс решил раньше.
      return jsonb_build_object('ok', false, 'error', 'Вы уже оценили эту кофейню.');
  end;
  return jsonb_build_object('ok', true);
end;
$$;

-- Мягкое удаление своей активной оценки (правило владельца №5: удаление
-- сносит и оценку, и отзыв; повторная оценка после удаления — новая строка).
create or replace function public.cafe_unrate(p_cafe_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Войдите, чтобы управлять оценкой.');
  end if;
  update public.cafe_ratings
  set deleted_at = now()
  where cafe_id = p_cafe_id and user_id = v_uid and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Активная оценка не найдена.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Публичные чтения — всем; записи — вызывать может любой, отсечка внутри.
revoke all on function public.cafe_rating_summary(text) from public;
grant execute on function public.cafe_rating_summary(text) to anon, authenticated;

revoke all on function public.cafe_rating_reviews(text, integer) from public;
grant execute on function public.cafe_rating_reviews(text, integer) to anon, authenticated;

revoke all on function public.cafe_rate(text, integer, text) from public;
grant execute on function public.cafe_rate(text, integer, text) to anon, authenticated;

revoke all on function public.cafe_unrate(text) from public;
grant execute on function public.cafe_unrate(text) to anon, authenticated;
