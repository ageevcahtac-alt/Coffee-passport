import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Loyalty stage 1 (0039, контур «Зал») — пересборка модуля 0012: ранг по
// тратам за скользящие 30 дней, зёрна-кэшбэк (1 зерно = 1 ₽, потолок 50%
// чека, сгорание read-time через 90 дней от последней покупки), карта-депозит
// (без сгорания, частичное списание с доплатой), орден (не скользит), welcome
// 300 при первом чеке. Offline CI не поднимает Postgres — как
// cronRpcGrants/lotActivationGuard тест реплеит текст миграции и закрепляет
// её семантику: правильные таблицы/функции, правильные константы, правило
// живёт в RPC (не в клиенте), старое ядро 0012 удалено.
const FILE = path.resolve(__dirname, 'migrations', '0039_loyalty_stage1_hall.sql');
const raw = fs.readFileSync(FILE, 'utf8');
const sql = () => raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

// Тело одной функции — чтобы проверки не протекали между функциями.
function functionBody(name: string): string {
  const text = sql();
  const start = text.indexOf(`function public.${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThanOrEqual(0);
  const tail = text.slice(start);
  const end = tail.indexOf('$$;');
  expect(end, `function ${name} closed`).toBeGreaterThan(0);
  return tail.slice(0, end);
}

describe('0039_loyalty_stage1_hall — сид рангов контура «Зал»', () => {
  it('семь рангов с точными порогами, процентами и hex-цветами', () => {
    const text = sql();
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
    expect(text.match(/\('shop-xo-vsevolozhsk', 'hall',/g)).toHaveLength(7);
  });

  it('старая лестница 0012 удаляется и конфигурация управляется данными', () => {
    const text = sql();
    expect(text).toContain(`delete from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk'`);
    expect(text).not.toMatch(/'bronze'|'silver'|'gold'|'platinum'/);
    // Схема допускает второй контур: уникальность и порог — внутри контура.
    expect(text).toContain('unique (shop_id, circuit, rank_name)');
    expect(text).toContain(`add column if not exists circuit text not null default 'hall'`);
  });
});

describe('0039 — начисление зёрен по рангам', () => {
  it('кэшбэк = round(gross × % ранга), ранг — effective на момент чека', () => {
    const body = functionBody('loyalty_consume');
    expect(body).toMatch(/v_earned\s*:=\s*round\(p_gross_amount \* coalesce\(v_rank\.beans_percent, 0\) \/ 100\.0\)::integer/);
    expect(body).toContain('loyalty_effective_rank_id(p_guest_id, p_shop_id)');
    // Процент ранга — единственный источник ставки; скидки у кассы нет.
    expect(body).not.toContain('discount');
  });

  it('ставка из таблицы рангов (beans_percent 0–100), не из клиента', () => {
    const text = sql();
    expect(text).toContain('rename column discount_percent to beans_percent');
    expect(text).toContain('check (beans_percent between 0 and 100)');
  });
});

describe('0039 — списание зёрен с потолком 50%', () => {
  it('потолок зашит и в CHECK таблицы, и в clamp RPC', () => {
    const text = sql();
    expect(text).toContain('check (beans_redeemed <= gross_amount / 2)');
    const body = functionBody('loyalty_consume');
    expect(body).toMatch(/least\(coalesce\(p_beans_redeem, 0\), floor\(p_gross_amount \/ 2\)::integer\)/);
  });

  it('при нехватке списываем доступное (clamp к живому балансу, не отказ)', () => {
    const body = functionBody('loyalty_consume');
    expect(body).toMatch(/v_alive\s*:=\s*public\.loyalty_beans_alive/);
    expect(body).toMatch(/if v_beans > v_alive then\s*v_beans := v_alive;\s*end if/);
    // Зёрна + карта не покрывают чек сверх суммы — остаток наличные.
    expect(sql()).toContain('check (beans_redeemed + card_amount <= gross_amount)');
    expect(body).toMatch(/v_cash\s*:=\s*p_gross_amount - v_beans - v_card_pay/);
  });
});

describe('0039 — сгорание зёрен 90 дней (read-time)', () => {
  it('живые зёрна — всё новее последней покупки минус 90 дней', () => {
    const body = functionBody('loyalty_beans_alive');
    expect(body).toContain(`interval '90 days'`);
    expect(body).toMatch(/select max\(c\.created_at\) - interval '90 days'/);
    expect(body).toMatch(/from public\.loyalty_consumptions c/);
    // Без покупок живых зёрен нет (welcome начисляется первой покупкой).
    expect(body).toContain('coalesce(sum(bl.delta), 0)::integer');
  });

  it('сгорание виртуальное: нет cron, нет UPDATE/DELETE по beans_ledger', () => {
    const text = sql();
    expect(text).not.toMatch(/pg_cron|cron\.schedule|net\.http/);
    expect(text).not.toMatch(/update public\.beans_ledger|delete from public\.beans_ledger/);
  });

  it('таймеру сгорания — отдельная read-time функция', () => {
    const body = functionBody('loyalty_beans_expire_at');
    expect(body).toContain(`+ interval '90 days'`);
  });
});

describe('0039 — скользящий ранг: повышение мгновенно, понижение read-time', () => {
  it('окно ранга — траты за 30 дней, только сумма (визиты убраны)', () => {
    const text = sql();
    expect(functionBody('loyalty_spend_30d')).toContain(`interval '30 days'`);
    expect(text).toContain('drop column if exists required_visits');
    expect(text).toContain('drop column if exists retention_days');
    expect(text).toContain('drop column if exists rank_expires_at');
    expect(text).toContain('rename column required_spend to required_spend_30d');
  });

  it('потребление сразу пересчитывает кэш ранга по тратам ВКЛЮЧАЯ чек', () => {
    const body = functionBody('loyalty_consume');
    // Кэш = ранг по тратам после вставки чека (spend_30d читает таблицу чеков).
    expect(body).toMatch(/v_spend_before\s*:=\s*public\.loyalty_spend_30d\(p_guest_id, p_shop_id\)/);
    expect(body).toMatch(/v_new_rank_id\s*:=\s*public\.loyalty_rank_for_spend\(p_shop_id, 'hall', v_spend_before\)/);
    expect(body).toMatch(/insert into public\.guest_shop_statuses[\s\S]*on conflict \(guest_id, shop_id\)/);
    // Траты — только из чеков: покупка карты в окно не входит.
    expect(functionBody('loyalty_spend_30d')).toContain('from public.loyalty_consumptions');
  });

  it('read-time понижение: effective-ранг пересчитывается из фактических трат, без записи', () => {
    const body = functionBody('loyalty_effective_rank_id');
    expect(body).toContain('public.loyalty_rank_for_spend(p_shop_id, p_circuit, public.loyalty_spend_30d(p_guest_id, p_shop_id))');
    expect(body).not.toMatch(/insert|update|delete/);
    expect(raw.toLowerCase()).toContain('stable');
  });
});

describe('0039 — карта-депозит: частичное списание + доплата; покупка не влияет', () => {
  it('оплата картой clamp\'ится к балансу, остаток — наличные', () => {
    const body = functionBody('loyalty_consume');
    expect(body).toMatch(/from public\.deposit_cards\s+where guest_id = p_guest_id and shop_id = p_shop_id\s+for update/);
    expect(body).toMatch(/if v_card\.balance < v_card_pay then\s*v_card_pay := v_card\.balance;\s*end if/);
    expect(body).toMatch(/v_cash\s*:=\s*p_gross_amount - v_beans - v_card_pay/);
    // Списание с карты фиксируется в журнале карты и уменьшает баланс.
    expect(body).toMatch(/update public\.deposit_cards\s+set balance = v_card\.balance - v_card_pay/);
    expect(body).toContain(`values (v_card.id, -v_card_pay, 'spend', v_consumption.id)`);
  });

  it('покупка/пополнение карты не трогает ранг, зёрна и чеки', () => {
    const body = functionBody('loyalty_purchase_card');
    expect(body).toContain('on conflict (guest_id, shop_id)');
    expect(body).toContain(`values (v_card.id, p_amount, 'topup')`);
    expect(body).not.toMatch(/beans_ledger|loyalty_consumptions|guest_shop_statuses|loyalty_spend_30d/);
  });

  it('у карты нет срока действия (баланс не сгорает никогда)', () => {
    const text = sql();
    expect(text).toMatch(/create table if not exists public\.deposit_cards \([\s\S]*balance numeric not null default 0 check \(balance >= 0\)/);
    const blockStart = text.indexOf('create table if not exists public.deposit_cards (');
    const block = text.slice(blockStart, text.indexOf(');', blockStart));
    expect(block).not.toMatch(/expir/);
  });
});

describe('0039 — приветственные 300 зёрен один раз', () => {
  it('начисляются только при отсутствии прежних чеков гостя в этой кофейне', () => {
    const body = functionBody('loyalty_consume');
    expect(body).toMatch(/if not exists \([\s\S]*from public\.loyalty_consumptions\s+where guest_id = p_guest_id and shop_id = p_shop_id\s*\) then\s*v_welcome := 300;/);
    expect(body).toMatch(/values \(p_guest_id, p_shop_id, v_welcome, 'welcome', v_consumption\.id\)/);
  });
});

describe('0039 — орден не скользит', () => {
  it('pinned-орден побеждает read-time пересчёт', () => {
    const body = functionBody('loyalty_effective_rank_id');
    expect(body).toMatch(/if v_orden is not null and coalesce\(v_pinned, false\) then\s*return v_orden;/);
  });

  it('назначает только cafe_admin своей кофейни; ранг — из лестницы «Зала»', () => {
    const body = functionBody('loyalty_assign_orden');
    expect(body).toContain(`p.role = 'cafe_admin'`);
    expect(body).toMatch(/where id = p_rank_id and shop_id = p_shop_id and circuit = 'hall'/);
    // Снятие ордена — rank_id null, ранг снова скользит.
    expect(body).toContain('p_rank_id is not null and not exists');
  });
});

describe('0039 — старое ядро 0012 удалено, доступ по прежним паттернам', () => {
  it('старые RPC и таблицы дропаются', () => {
    const text = sql();
    expect(text).toContain('drop function if exists public.loyalty_redeem(uuid, text, numeric, uuid)');
    expect(text).toContain('drop function if exists public.loyalty_sell_subscription(uuid, text, numeric)');
    expect(text).toContain('drop table if exists public.loyalty_transactions');
    expect(text).toContain('drop table if exists public.subscriptions');
  });

  it('новые таблицы: SELECT-only для authenticated, записи — через RPC', () => {
    const text = sql();
    for (const table of ['deposit_cards', 'deposit_card_ledger', 'beans_ledger', 'loyalty_consumptions']) {
      expect(text).toContain(`grant select on public.${table} to authenticated;`);
      expect(text).toContain(`alter table public.${table} enable row level security`);
      expect(text).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*on public\\.${table}`));
    }
    for (const fn of ['loyalty_consume', 'loyalty_purchase_card', 'loyalty_assign_orden']) {
      expect(text).toContain(`security definer`);
      expect(text).toContain(`grant execute on function public.${fn}`);
    }
  });
});
