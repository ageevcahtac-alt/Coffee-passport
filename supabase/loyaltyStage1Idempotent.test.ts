import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 0040 — самодостаточная ИДЕМПОТЕНТНАЯ замена 0039 (0039 написана как ALTER
// поверх канонической схемы 0012 и падает на боевой базе с ERROR 42703,
// нигде не применена). 0040 обязана: дропнуть старый модуль 0012 (включая
// старую форму shop_ranks/guest_shop_statuses — признак по колонкам),
// пересоздать v2-объекты с нуля, пережить повторный прогон без данных
// гостей и дать тот же сид. Offline CI не поднимает Postgres — тест
// реплеит текст миграции и закрепляет маркеры идемпотентности; сам двойной
// прогон на чистой и «старая схема 0012» базе — локально (см. отчёт этапа).
const FILE = path.resolve(__dirname, 'migrations', '0040_loyalty_stage1_hall.sql');
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

describe('0040_loyalty_stage1_hall — идемпотентность', () => {
  it('дропает старый модуль 0012: таблицы всегда, старую форму ranks/statuses — по признаку колонок', () => {
    const text = sql();
    expect(text).toContain('drop table if exists public.loyalty_transactions');
    expect(text).toContain('drop table if exists public.subscriptions');
    // Условный дроп по СТАРОЙ форме: v2-таблицы с данными переживают повторный прогон.
    expect(text).toMatch(/if exists \([\s\S]*table_name = 'shop_ranks'[\s\S]*column_name in \('discount_percent', 'required_visits', 'retention_days'\)[\s\S]*drop table public\.shop_ranks cascade;/);
    expect(text).toMatch(/table_name = 'guest_shop_statuses'[\s\S]*column_name in \('visits_count', 'total_spent', 'rank_expires_at'\)[\s\S]*drop table public\.guest_shop_statuses cascade;/);
    // Старые RPC дропаются до таблиц (ссылаются на них).
    expect(text).toContain('drop function if exists public.loyalty_redeem(uuid, text, numeric, uuid)');
    expect(text).toContain('drop function if exists public.loyalty_sell_subscription(uuid, text, numeric)');
    expect(text).toContain('drop function if exists public.loyalty_rank_for(text, integer, numeric)');
  });

  it('не содержит неидемпотентных ALTER rename/change type поверх старых колонок', () => {
    const text = sql();
    expect(text).not.toMatch(/rename column discount_percent|rename column required_spend\b|alter column beans_percent type/);
  });

  it('новые таблицы — create table if not exists, функции — create or replace', () => {
    const text = sql();
    for (const table of ['shop_ranks', 'guest_shop_statuses', 'deposit_cards', 'deposit_card_ledger', 'loyalty_consumptions', 'beans_ledger']) {
      expect(text).toContain(`create table if not exists public.${table} (`);
    }
    for (const fn of ['loyalty_spend_30d', 'loyalty_rank_for_spend', 'loyalty_beans_alive', 'loyalty_beans_expire_at', 'loyalty_effective_rank_id', 'loyalty_purchase_card', 'loyalty_consume', 'loyalty_assign_orden']) {
      expect(text).toContain(`create or replace function public.${fn}(`);
    }
  });

  it('политики пересоздаются парой drop+create (у политик нет if not exists)', () => {
    const text = sql();
    for (const policy of ['authenticated reads shop ranks', 'cafe admin manages own shop ranks', 'guest reads own status', 'shop staff read own shop statuses', 'guest reads own deposit cards', 'shop staff read own shop deposit cards', 'guest reads own deposit card ledger', 'shop staff read own shop deposit card ledger', 'guest reads own beans ledger', 'shop staff read own shop beans ledger', 'guest reads own consumptions', 'shop staff read own shop consumptions']) {
      expect(text).toContain(`drop policy if exists "${policy}"`);
      expect(text).toContain(`create policy "${policy}"`);
    }
  });

  it('сид — delete контура + insert: повторный прогон даёт те же 7 рангов', () => {
    const text = sql();
    expect(text).toContain(`delete from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall'`);
    expect(text.match(/\('shop-xo-vsevolozhsk', 'hall',/g)).toHaveLength(7);
    const ladder: Array<[string, number, number, number, string]> = [
      ['первый глоток', 0, 2, 0, '#7fa650'],
      ['любитель', 1, 3, 1000, '#d2b48c'],
      ['дегустатор', 2, 4, 2000, '#b08968'],
      ['ценитель', 3, 5, 3000, '#8b6b4a'],
      ['знаток', 4, 6, 5000, '#6f4e37'],
      ['энтузиаст', 5, 8, 8000, '#4e3429'],
      ['хранитель вкуса', 6, 10, 10000, '#2d1e18'],
    ];
    for (const [name, order, percent, spend, color] of ladder) {
      expect(text).toMatch(
        new RegExp(`\\('shop-xo-vsevolozhsk', 'hall', '${name}', ${order}, '${color}', ${percent},\\s*${spend}\\)`)
      );
    }
  });

  it('бизнес-правила идентичны 0039 (зёрна/потолок 50%/welcome 300/орден/скольжение)', () => {
    const consume = functionBody('loyalty_consume');
    expect(consume).toMatch(/v_earned\s*:=\s*round\(p_gross_amount \* coalesce\(v_rank\.beans_percent, 0\) \/ 100\.0\)::integer/);
    expect(consume).toMatch(/least\(coalesce\(p_beans_redeem, 0\), floor\(p_gross_amount \/ 2\)::integer\)/);
    expect(consume).toMatch(/if v_beans > v_alive then\s*v_beans := v_alive;\s*end if/);
    expect(consume).toMatch(/v_cash\s*:=\s*p_gross_amount - v_beans - v_card_pay/);
    expect(consume).toMatch(/if v_card\.balance < v_card_pay then\s*v_card_pay := v_card\.balance;\s*end if/);
    expect(consume).toMatch(/then\s*v_welcome := 300;/);
    expect(consume).toContain('loyalty_effective_rank_id(p_guest_id, p_shop_id)');
    // Скольжение 30 дней и сгорание 90 дней — read-time, без cron.
    expect(functionBody('loyalty_spend_30d')).toContain(`interval '30 days'`);
    expect(functionBody('loyalty_beans_alive')).toContain(`interval '90 days'`);
    expect(functionBody('loyalty_effective_rank_id')).toMatch(/if v_orden is not null and coalesce\(v_pinned, false\) then\s*return v_orden;/);
    // Покупка карты не трогает ранг/зёрна/чеки.
    const purchase = functionBody('loyalty_purchase_card');
    expect(purchase).not.toMatch(/beans_ledger|loyalty_consumptions|guest_shop_statuses/);
    expect(sql()).not.toMatch(/pg_cron|cron\.schedule/);
  });

  it('доступ — прежние паттерны: SELECT-only таблицы, записи через security-definer RPC', () => {
    const text = sql();
    for (const table of ['deposit_cards', 'deposit_card_ledger', 'beans_ledger', 'loyalty_consumptions']) {
      expect(text).toContain(`grant select on public.${table} to authenticated;`);
      expect(text).toContain(`alter table public.${table} enable row level security`);
      expect(text).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*on public\\.${table}`));
    }
    expect(text).toContain('grant select, insert, update, delete on public.shop_ranks to authenticated;');
    for (const fn of ['loyalty_purchase_card', 'loyalty_consume', 'loyalty_assign_orden']) {
      expect(text).toContain('security definer');
      expect(text).toContain(`grant execute on function public.${fn}`);
    }
  });
});
