-- =========================================================
-- Постоянный 5-значный код гостя — человекочитаемый фолбэк к QR
-- =========================================================
-- Принцип владельца: «километровый код под QR никто диктовать не будет».
-- Если QR не считывается (блики, разбитый экран, телефон забыт), гость
-- называет бариста 5 цифр, бариста вбивает их вручную — по коду открывается
-- та же карточка (имя + любимый напиток), что и по QR; сверка личности
-- голосом — перед любым списанием (UI-поток баристы).
--
-- Устройство:
--   * profiles.guest_code — TEXT (char(5)-по-смыслу), не число: код '00123'
--     валиден и хранится с ведущими нулями. Уникален — отдельный unique
--     index (NULL'и не конфликтуют: staff-строки код не получают).
--   * Генерация — в базе, триггером регистрации (handle_new_user_profile,
--     тот же security definer, что и раньше): lpad(floor(random()*100000),
--     5, '0'). Гонка двух одновременных регистраций: уникальный индекс не
--     пускает дубликат — проигравший получает unique_violation, триггер
--     перегенерирует код и повторяет вставку (retry), до 100 попыток, дальше
--     строка важнее кода (код остаётся NULL, гость пользуется QR — такая
--     вероятность астрономически мала).
--   * Backfill существующим гостям (role='enthusiast' без кода) — тот же
--     retry-цикл в DO-блоке. Идемпотентно: повторный прогон заполняет только
--     NULL'ы. Код НЕ ротируется и никогда не меняется: ни миграция, ни
--     триггер не перезаписывают уже выданный код.
--   * QR-код НЕ тронут: формат токена прежний (coffeepassport-guest:{id}),
--     5-значный код — только ручной фолбэк. Поиск по коду — staff-SELECT по
--     той же политике «staff read enthusiast display names» (0013): читаются
--     id/display_name/favorite_drink гостя; угадать 5 цифр можно, поэтому
--     бариста обязан сверить личность голосом до списания.
--
-- Идемпотентность: add column if not exists, create unique index if not
-- exists, create or replace function, DO-блок заполняет только NULL'ы.
--
-- Проверка после наката:
--   select count(*) as total, count(guest_code) as with_code,
--          count(distinct guest_code) as unique_codes
--     from public.profiles where role = 'enthusiast';
--   -- ожидается total = with_code = unique_codes
-- =========================================================

alter table public.profiles
  add column if not exists guest_code text;

create unique index if not exists profiles_guest_code_key
  on public.profiles (guest_code);

-- Триггер регистрации: строка profiles + постоянный код (генерация + retry
-- на коллизию уникального индекса). Тело — security definer (как и раньше):
-- строка создаётся в обход RLS независимо от политик.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := lpad(floor(random() * 100000)::integer::text, 5, '0');
    begin
      insert into public.profiles (id, role, email, guest_code)
      values (new.id, 'enthusiast', new.email, v_code)
      on conflict (id) do nothing;
      exit;  -- строка вставлена (или уже существовала) — код лёг с первой попытки
    exception
      when unique_violation then
        -- Коллизия guest_code (гонка регистраций): перегенерация и повтор.
        -- Другой конфликт (не индекс кода) тоже сюда — retry безопасен.
        v_attempts := v_attempts + 1;
        if v_attempts >= 100 then
          insert into public.profiles (id, role, email)
          values (new.id, 'enthusiast', new.email)
          on conflict (id) do nothing;
          exit;  -- 100 коллизий подряд: строка важнее кода
        end if;
    end;
  end loop;
  return new;
end;
$$;

-- Backfill: каждому существующему гостю без кода — свой код (retry-цикл).
do $$
declare
  r record;
  v_code text;
  v_attempts integer;
begin
  for r in
    select id from public.profiles
    where guest_code is null and role = 'enthusiast'
    order by created_at, id
  loop
    v_attempts := 0;
    while v_attempts < 100 loop
      v_attempts := v_attempts + 1;
      v_code := lpad(floor(random() * 100000)::integer::text, 5, '0');
      begin
        update public.profiles set guest_code = v_code where id = r.id;
        exit;  -- код лёг
      exception
        when unique_violation then
          null;  -- коллизия — перегенерация
      end;
    end loop;
  end loop;
end $$;
