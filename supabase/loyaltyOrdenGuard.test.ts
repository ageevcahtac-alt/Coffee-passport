import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 0043 — правило ордена: орден существует ТОЛЬКО на высшем ранге лестницы
// контура «Зал» («Хранитель вкуса», топ по rank_order). Привилегия ручного
// назначения из кабинета кофейни; закреплённый орден — блок от скольжения
// вниз (effective-ранг не ниже топового при любых тратах за 30 дней),
// открепление — обычное скольжение по фактическим тратам. Offline CI не
// поднимает Postgres — тест реплеит текст миграции и закрепляет гард;
// живое поведение (ошибка на не-топ ранг, pinned не скользит при 0 трат,
// открепление → скольжение) прогоняется на стенде, см. отчёт этапа.
const FILE = path.resolve(__dirname, 'migrations', '0043_loyalty_orden_top_rank_guard.sql');
const raw = fs.readFileSync(FILE, 'utf8');
const sql = () => raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

function functionBody(name: string): string {
  const text = sql();
  const start = text.indexOf(`function public.${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThanOrEqual(0);
  const tail = text.slice(start);
  const end = tail.indexOf('$$;');
  expect(end, `function ${name} closed`).toBeGreaterThan(0);
  return tail.slice(0, end);
}

describe('0043_loyalty_orden_top_rank_guard — орден только на топовом ранге', () => {
  it('пересоздаёт loyalty_assign_orden с прежней сигнатурой и правом cafe_admin', () => {
    const text = sql();
    expect(text).toContain('create or replace function public.loyalty_assign_orden(');
    expect(text).toContain('p_guest_id uuid');
    expect(text).toContain('p_rank_id uuid');
    expect(text).toContain('p_pinned boolean default true');
    expect(text).toContain('security definer');
    const body = functionBody('loyalty_assign_orden');
    expect(body).toContain("p.role = 'cafe_admin'");
    expect(body).toContain('not authorized to assign orden for this shop');
    expect(text).toContain(
      'grant execute on function public.loyalty_assign_orden(uuid, text, uuid, boolean) to authenticated;'
    );
  });

  it('уровень зафиксирован на топовом ранге лестницы «Зал» (max rank_order)', () => {
    const body = functionBody('loyalty_assign_orden');
    expect(body).toMatch(
      /select id into v_top_rank_id\s+from public\.shop_ranks\s+where shop_id = p_shop_id and circuit = 'hall'\s+order by rank_order desc\s+limit 1;/
    );
    // Попытка назначить орден на НЕтоповый ранг — ошибка.
    expect(body).toMatch(
      /if p_rank_id is not null and \(v_top_rank_id is null or p_rank_id <> v_top_rank_id\) then\s+raise exception 'orden can only be pinned to the top hall rank';/
    );
  });

  it('p_rank_id null по-прежнему открепляет орден (ранг снова скользит)', () => {
    const body = functionBody('loyalty_assign_orden');
    // Гард не отвергает null: ветка ошибки только для not-null, дальше —
    // прежний upsert с orden_rank_id = p_rank_id.
    expect(body).toMatch(/if p_rank_id is not null and/);
    expect(body).toContain('orden_rank_id = excluded.orden_rank_id');
    expect(body).toContain('orden_pinned = excluded.orden_pinned');
  });

  it('скольжение и сгорание read-time не трогаем (правило 0040 сохранено)', () => {
    const text = sql();
    // 0043 — только замена функции + грант: никаких DDL по таблицам и
    // никакого крона; понижение по фактическим тратам живёт в
    // loyalty_effective_rank_id из 0040.
    expect(text).not.toMatch(/create table|alter table|drop table|pg_cron|cron\.schedule/);
    expect(text).not.toContain('loyalty_effective_rank_id');
  });
});
