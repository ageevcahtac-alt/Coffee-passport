-- Проверка идемпотентности 0052: workflow накатил миграцию ПОВТОРНО.
-- Снапшот public._ratings_before_reapply снят сразу перед повтором — строки,
-- функции и политики не должны измениться.

\echo '== идемпотентность: повторный накат 0052 ничего не меняет =='
do $$
declare
  v_changed integer;
begin
  select count(*) into v_changed
  from public.cafe_ratings r
  full join public._ratings_before_reapply b
    on b.id = r.id and b.cafe_id is not distinct from r.cafe_id
    and b.user_id is not distinct from r.user_id and b.score is not distinct from r.score
    and b.review is not distinct from r.review
    and b.created_at is not distinct from r.created_at and b.deleted_at is not distinct from r.deleted_at
  where r.id is null or b.id is null;
  if v_changed <> 0 then
    raise exception 'идемпотентность: % строк cafe_ratings изменились при повторе', v_changed;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cafe_ratings') <> 2 then
    raise exception 'идемпотентность: политик cafe_ratings ожидалось 2';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('cafe_rate', 'cafe_unrate', 'cafe_rating_summary', 'cafe_rating_reviews')) <> 4 then
    raise exception 'идемпотентность: RPC 0052 не на месте после повтора';
  end if;
end $$;

-- Агрегаты после повторного наката всё ещё считаются по активным строкам.
do $$
declare
  v_summary jsonb;
begin
  v_summary := public.cafe_rating_summary('shop-a');
  if (v_summary ->> 'count')::integer <> 2 or (v_summary ->> 'average')::numeric <> 3.5 then
    raise exception 'идемпотентность: summary после повтора: %', v_summary;
  end if;
end $$;

\echo 'IDEMPOTENCY PASSED'
