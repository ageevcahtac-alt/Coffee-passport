-- Проверки после наката 0052 (cafe_ratings). Каждая проверка — DO-блок,
-- падающий raise exception с понятным текстом; identity гостей берётся из
-- auth.users по email. Вывод '\echo' маркирует пройденные точки в логе.

\echo '== 0052: гость ставит оценку с отзывом, агрегат мгновенно на чтении =='
do $$
declare
  v_g1 uuid;
  v_result jsonb;
begin
  select id into v_g1 from auth.users where email = 'g1@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g1)::text, true);

  select public.cafe_rate('shop-a', 5, 'Отличный фильтр') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: первая оценка гостя отклонена: %', v_result;
  end if;

  v_result := public.cafe_rating_summary('shop-a');
  if (v_result ->> 'count')::integer <> 1 or (v_result ->> 'average')::numeric <> 5.0 then
    raise exception 'summary после одной оценки 5: %', v_result;
  end if;
end $$;

\echo '== 0052: второй активной оценки той же пары нет (переоценки нет) =='
do $$
declare
  v_g1 uuid;
  v_result jsonb;
begin
  select id into v_g1 from auth.users where email = 'g1@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g1)::text, true);

  select public.cafe_rate('shop-a', 3, 'Хуже не стало') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: вторая активная оценка той же пары прошла: %', v_result;
  end if;
  if v_result ->> 'error' is null then
    raise exception 'cafe_rate: нет понятного сообщения об отказе: %', v_result;
  end if;
end $$;

\echo '== 0052: без входа и не-enthusiast оценить не могут =='
do $$
declare
  v_staff uuid;
  v_g2 uuid;
  v_result jsonb;
begin
  -- Аноним: claims не выставлены.
  perform set_config('request.jwt.claims', '', true);
  select public.cafe_rate('shop-a', 5, null) into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: аноним поставил оценку: %', v_result;
  end if;

  -- Бариста (staff) той же кофейни.
  select id into v_staff from auth.users where email = 'staff-a@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff)::text, true);
  select public.cafe_rate('shop-a', 5, null) into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: бариста поставил оценку: %', v_result;
  end if;

  -- Второй гость БЕЗ текста — законно.
  select id into v_g2 from auth.users where email = 'g2@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g2)::text, true);
  select public.cafe_rate('shop-a', 4, null) into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: оценка без текста отклонена: %', v_result;
  end if;
end $$;

\echo '== 0052: непартнёрскую кофейню оценить нельзя =='
do $$
declare
  v_g2 uuid;
  v_result jsonb;
begin
  select id into v_g2 from auth.users where email = 'g2@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g2)::text, true);
  select public.cafe_rate('shop-zzz', 4, null) into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: непартнёрская кофейня оценена: %', v_result;
  end if;
end $$;

\echo '== 0052: границы ввода — score 1..5, отзыв до 1000 символов =='
do $$
declare
  v_g2 uuid;
  v_result jsonb;
begin
  select id into v_g2 from auth.users where email = 'g2@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g2)::text, true);

  select public.cafe_rate('shop-b', 0, null) into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'score 0 принят: %', v_result; end if;
  select public.cafe_rate('shop-b', 6, null) into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'score 6 принят: %', v_result; end if;
  select public.cafe_rate('shop-b', null, null) into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'score null принят: %', v_result; end if;
  select public.cafe_rate('shop-b', 4, repeat('а', 1001)) into v_result;
  if (v_result ->> 'ok')::boolean then raise exception 'отзыв 1001 символ принят: %', v_result; end if;
  select public.cafe_rate('shop-b', 4, repeat('а', 1000)) into v_result;
  if not (v_result ->> 'ok')::boolean then raise exception 'отзыв ровно 1000 символов отклонён: %', v_result; end if;

  -- Границы ввода проверены: активную оценку shop-b убираем, чтобы сценарий
  -- публичных отзывов стартовал с чистого shop-b.
  perform public.cafe_unrate('shop-b');
end $$;

\echo '== 0052: публичные отзывы — только с текстом, имя из профиля, пусто имя → «Гость без имени» =='
do $$
declare
  v_g2 uuid;
  v_count integer;
  v_author text;
begin
  -- g2 уже оценил shop-b без текста: в списке отзывов shop-b его быть не должно.
  select count(*) into v_count from public.cafe_rating_reviews('shop-b', 50);
  if v_count <> 0 then
    raise exception 'reviews: оценка без текста попала в публичный список: %', v_count;
  end if;

  -- У shop-a один отзыв (g1, «Анна»); оценка g2 без текста не публикуется.
  select count(*) into v_count from public.cafe_rating_reviews('shop-a', 50);
  if v_count <> 1 then
    raise exception 'reviews: ожидался ровно 1 публичный отзыв, получено %', v_count;
  end if;
  select author_name into v_author from public.cafe_rating_reviews('shop-a', 50) limit 1;
  if v_author <> 'Анна' then
    raise exception 'reviews: имя автора из профиля не подтянулось: %', v_author;
  end if;

  -- g2 добавляет текстовый отзыв в shop-b: display_name пуст → фолбэк.
  -- (активной оценки shop-b у g2 сейчас нет — предыдущий шаг её удалил)
  select id into v_g2 from auth.users where email = 'g2@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g2)::text, true);
  perform public.cafe_rate('shop-b', 2, 'Не моё');
  select author_name into v_author from public.cafe_rating_reviews('shop-b', 50) limit 1;
  if v_author <> 'Гость без имени' then
    raise exception 'reviews: фолбэк «Гость без имени» не сработал: %', v_author;
  end if;
end $$;

\echo '== 0052: удаление сносит оценку и отзыв, строка остаётся для аудита, повторная оценка — новая активная =='
do $$
declare
  v_g1 uuid;
  v_result jsonb;
  v_deleted integer;
begin
  select id into v_g1 from auth.users where email = 'g1@example.com';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g1)::text, true);

  -- unrate чужой/отсутствующей активной оценки — отказ.
  select public.cafe_unrate('shop-b') into v_result;
  if (v_result ->> 'ok')::boolean then
    raise exception 'cafe_unrate: удалил чужую оценку: %', v_result;
  end if;

  select public.cafe_unrate('shop-a') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'cafe_unrate: свою активную оценку не удалил: %', v_result;
  end if;

  -- Удалённых строк уже две: g2 сняла оценку shop-b на границах ввода,
  -- g1 только что снял свою оценку shop-a. Обе остаются в таблице для аудита.
  select count(*) into v_deleted from public.cafe_ratings where deleted_at is not null;
  if v_deleted <> 2 then
    raise exception 'аудит: удалённых строк ожидалось 2, есть %', v_deleted;
  end if;

  -- Агрегат сразу без удалённой строки: осталась только 4 (g2) на shop-a.
  v_result := public.cafe_rating_summary('shop-a');
  if (v_result ->> 'count')::integer <> 1 or (v_result ->> 'average')::numeric <> 4.0 then
    raise exception 'summary после удаления: %', v_result;
  end if;

  -- Повторная оценка после удаления — законна, новая строка активна.
  select public.cafe_rate('shop-a', 3, 'Так себе') into v_result;
  if not (v_result ->> 'ok')::boolean then
    raise exception 'cafe_rate: повторная оценка после удаления отклонена: %', v_result;
  end if;

  v_result := public.cafe_rating_summary('shop-a');
  if (v_result ->> 'count')::integer <> 2 or (v_result ->> 'average')::numeric <> 3.5 then
    raise exception 'summary после повторной оценки: %', v_result;
  end if;
  if (v_result -> 'distribution')::jsonb <> '[0,0,1,1,0]'::jsonb then
    raise exception 'гистограмма (распределение) после повторной оценки: %', v_result -> 'distribution';
  end if;
end $$;

\echo '== 0052: RLS — гость читает только свою строку, staff кофейни — все свои, anon — ничего =='
do $$
declare
  v_g1 uuid;
  v_staff uuid;
  v_seen integer;
begin
  select id into v_g1 from auth.users where email = 'g1@example.com';
  select id into v_staff from auth.users where email = 'staff-a@example.com';

  set role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_g1)::text, true);
  select count(*) into v_seen from public.cafe_ratings where cafe_id = 'shop-a';
  if v_seen <> 1 then
    raise exception 'RLS: гость увидел % строк shop-a вместо своей одной', v_seen;
  end if;
  select count(*) into v_seen from public.cafe_ratings;
  if v_seen <> 1 then
    raise exception 'RLS: гость увидел % строк всего вместо 1', v_seen;
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff)::text, true);
  select count(*) into v_seen from public.cafe_ratings where cafe_id = 'shop-a';
  if v_seen <> 2 then
    raise exception 'RLS: staff кофейни увидел % активных строк вместо 2', v_seen;
  end if;
  set role none;

  -- Прямой insert под authenticated — запрещён (записи только через RPC).
  set role authenticated;
  begin
    insert into public.cafe_ratings (cafe_id, user_id, score) values ('shop-a', v_g1, 5);
    raise exception 'RLS: прямой insert прошёл';
  exception
    when insufficient_privilege then
      null; -- ожидаемый отказ: grant/policies insert не дают
  end;
  set role none;
end $$;

\echo 'ASSERTIONS PASSED'
