-- Проверка идемпотентности: workflow накатил 0050 и 0051 ПОВТОРНО после
-- снапшота public._codes_before_reapply — коды не должны были ротироваться,
-- новых сирот быть не должно, новые регистрации между снимком и повтором
-- (их нет — снапшот сразу перед повтором) не учитываем.

\echo '== идемпотентность: повторный накат 0050/0051 ничего не меняет =='
do $$
declare
  v_changed integer;
  v_missing integer;
begin
  select count(*) into v_changed
  from public.profiles p
  join public._codes_before_reapply b on b.id = p.id
  where p.guest_code is distinct from b.guest_code;
  if v_changed <> 0 then
    raise exception 'идемпотентность: % кодов изменились при повторе', v_changed;
  end if;
  select count(*) into v_missing
  from auth.users u left join public.profiles p on p.id = u.id
  where p.id is null;
  if v_missing <> 0 then
    raise exception 'идемпотентность: % auth.users без profiles после повтора', v_missing;
  end if;
end $$;

\echo 'IDEMPOTENCY PASSED'
