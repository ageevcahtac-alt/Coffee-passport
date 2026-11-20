-- Проверка гонки: N параллельных регистраций (вставки в auth.users,
-- workflow гоняет 320 psql-процессов через xargs -P 32) — у каждого нового
-- юзера строка profiles, у каждого enthusiast-кода 5 цифр, дубликатов нет.
-- Уникальность держит индекс, триггер перегенерирует на коллизии: если бы
-- retry не сработал, хоть одна вставка упала бы (ON_ERROR_STOP в workflow)
-- либо дубликат проскочил — ловим его здесь.

\echo '== гонка: все race-юзеры с уникальными кодами по 5 цифр =='
do $$
declare
  v_users integer;
  v_profiles integer;
  v_missing integer;
  v_bad_format integer;
  v_dupes integer;
begin
  select count(*) into v_users from auth.users where email like 'race-%@example.com';
  select count(*) into v_profiles
  from auth.users u join public.profiles p on p.id = u.id
  where u.email like 'race-%@example.com';
  if v_users = 0 or v_users <> v_profiles then
    raise exception 'гонка: юзеров %, profiles-строк %', v_users, v_profiles;
  end if;

  select count(*) into v_missing
  from public.profiles where guest_code is null and role = 'enthusiast';
  if v_missing <> 0 then
    raise exception 'гонка: % enthusiast без кода', v_missing;
  end if;

  select count(*) into v_bad_format
  from public.profiles where guest_code !~ '^\d{5}$';
  if v_bad_format <> 0 then
    raise exception 'гонка: % кодов не \d{5}', v_bad_format;
  end if;

  select count(*) - count(distinct guest_code) into v_dupes
  from public.profiles where guest_code is not null;
  if v_dupes <> 0 then
    raise exception 'гонка: % дубликатов guest_code', v_dupes;
  end if;
end $$;

\echo 'RACE PASSED'
