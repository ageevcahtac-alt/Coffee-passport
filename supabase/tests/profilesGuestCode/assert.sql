-- Проверки после наката 0050 (backfill + lockdown) и 0051 (guest_code).
-- Каждая проверка — DO-блок, падающий raise exception с понятным текстом.
-- Вывод '\echo' маркирует пройденные точки в логе workflow.

\echo '== 0050: backfill досылает profiles-сиротам =='
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from auth.users u left join public.profiles p on p.id = u.id
  where p.id is null;
  if v_missing <> 0 then
    raise exception 'backfill: без profiles-строки осталось % auth.users', v_missing;
  end if;
end $$;

do $$
declare
  v_bad integer;
begin
  -- Досланные сироты — ровно enthusiast, email перенесён из auth.users.
  select count(*) into v_bad
  from auth.users u
  where u.email like 'orphan-%@example.com'
    and not exists (
      select 1 from public.profiles p
      where p.id = u.id and p.role = 'enthusiast' and p.email = u.email
    );
  if v_bad <> 0 then
    raise exception 'backfill: % сирот получили неверную роль/email', v_bad;
  end if;
end $$;

\echo '== 0050: триггер регистрации на месте =='
do $$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'on_auth_user_created_profile' and c.relname = 'users' and not t.tgisinternal
  ) then
    raise exception 'триггер on_auth_user_created_profile отсутствует на auth.users';
  end if;
end $$;

\echo '== 0050: lockdown грантов — у authenticated только SELECT + 4 колонки UPDATE =='
do $$
declare
  v_table_update integer;
  v_table_insert integer;
  v_col_update integer;
begin
  select count(*) into v_table_update
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if v_table_update <> 0 then
    raise exception 'lockdown: table-level UPDATE у authenticated остался';
  end if;
  select count(*) into v_table_insert
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee = 'authenticated' and privilege_type = 'INSERT';
  if v_table_insert <> 0 then
    raise exception 'lockdown: table-level INSERT у authenticated остался';
  end if;
  -- Column-level UPDATE — ровно на четыре self-editable колонки.
  select count(*) into v_col_update
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee = 'authenticated' and privilege_type = 'UPDATE'
    and column_name in ('display_name', 'phone', 'city', 'favorite_drink');
  if v_col_update <> 4 then
    raise exception 'lockdown: column-level UPDATE на % колонок вместо 4', v_col_update;
  end if;
end $$;

\echo '== 0051: колонка text + уникальный индекс =='
do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'guest_code';
  if v_type is distinct from 'text' then
    raise exception 'guest_code: тип % вместо text', v_type;
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profiles' and indexname = 'profiles_guest_code_key'
  ) then
    raise exception 'guest_code: уникальный индекс profiles_guest_code_key отсутствует';
  end if;
end $$;

-- staff-аккаунт (один из сирот) получил роль бариста ДО 0050 (шаг workflow
-- между миграциями): backfill кода 0051 его не должен затронуть — коды
-- только у enthusiast. Если конвертированный из гостя staff код и сохранил,
-- lookup по коду всё равно отфильтрует его по role='enthusiast' — здесь
-- фиксируем инвариант «коды выдаются гостям».

\echo '== 0051: backfill кода — все enthusiast с кодом, коды уникальны и по 5 цифр =='
do $$
declare
  v_total integer;
  v_with_code integer;
  v_unique integer;
  v_bad_format integer;
  v_staff_with_code integer;
begin
  select count(*) into v_total from public.profiles where role = 'enthusiast';
  select count(guest_code) into v_with_code from public.profiles where role = 'enthusiast';
  select count(distinct guest_code) into v_unique from public.profiles where role = 'enthusiast';
  if v_total = 0 or v_total <> v_with_code or v_with_code <> v_unique then
    raise exception 'backfill кода: total=% with_code=% unique=%', v_total, v_with_code, v_unique;
  end if;
  select count(*) into v_bad_format
  from public.profiles where role = 'enthusiast' and guest_code !~ '^\d{5}$';
  if v_bad_format <> 0 then
    raise exception 'backfill кода: % кодов не по формату \d{5}', v_bad_format;
  end if;
  select count(*) into v_staff_with_code from public.profiles where role <> 'enthusiast' and guest_code is not null;
  if v_staff_with_code <> 0 then
    raise exception 'backfill кода: staff-строк получили код';
  end if;
end $$;

\echo '== 0051: ведущие нули — код текстовый =='
do $$
declare
  v_id uuid;
  v_readback text;
begin
  select id into v_id from public.profiles where role = 'enthusiast' order by created_at, id limit 1;
  update public.profiles set guest_code = '00007' where id = v_id;
  select guest_code into v_readback from public.profiles where id = v_id;
  if v_readback is distinct from '00007' then
    raise exception 'guest_code: ведущие нули потерялись (readback=%)', v_readback;
  end if;
end $$;

\echo '== 0051: уникальный индекс не пускает дубликат =='
-- Детерминированно и без гонки: у существующего гостя код меняем на уже
-- занятый '00007' (занят форсированной строкой выше) — unique index
-- profiles_guest_code_key обязан отклонить. Прямой insert не подходит:
-- вставка в auth.users сама создаёт строку триггером (конфликт PK, а не
-- проверяемого индекса).
do $$
declare
  v_other uuid;
  v_raised boolean := false;
  v_msg text;
begin
  select id into v_other from public.profiles
  where role = 'enthusiast' and guest_code <> '00007'
  order by created_at, id limit 1;
  begin
    update public.profiles set guest_code = '00007' where id = v_other;
  exception
    when unique_violation then
      v_raised := true;
      get stacked diagnostics v_msg = message_text;
  end;
  if not v_raised then
    raise exception 'guest_code: дубликат 00007 прошёл — уникальный индекс не сработал';
  end if;
  if v_msg not like '%profiles_guest_code_key%' then
    raise exception 'guest_code: unique_violation от «%», ожидался индекс profiles_guest_code_key', v_msg;
  end if;
  -- Попытка откатилась: код гостя прежний, не 00007.
  if exists (select 1 from public.profiles where id = v_other and guest_code = '00007') then
    raise exception 'guest_code: отклонённый дубликат остался в строке';
  end if;
end $$;

\echo '== ALL PRE-REPEAT ASSERTIONS PASSED =='
-- Снапшот кодов для проверки идемпотентности: workflow накатит 0050/0051 ещё
-- раз и сверит с этой таблицей (idempotentCheck.sql).
create table public._codes_before_reapply as
select id, guest_code from public.profiles;
