import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Тестовый сид владельца (0041) + его переезд на «Хранитель вкуса» (0045) +
// откат (0042). Offline CI не поднимает Postgres — тест реплеит текст
// миграций и закрепляет: (а) кэшбэк каждого чека сида равен round(gross ×
// beans_percent ранга, названного в той же строке) — регрессия против
// захардкоженных 10% (боевой алгоритм берёт % ранга на момент чека, и сид
// это отражает: 2/3/5/6/8/10% по разным чекам); (б) 0045 переносит орден
// только на топовый ранг, держит pinned и дублирует пометку в реестр батча
// без дублей, поэтому откат 0042 снимает весь батч целиком и идемпотентен;
// (в) сидовые балансы (зёрна 3 113, карта 2 000, welcome 300 один раз).
// Живое прогонивание (применение → проверки → 0042 → повтор) — на стенде.
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const readRaw = (file: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
const sqlOf = (file: string) => readRaw(file).replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const SEED = sqlOf('0041_owner_test_seed.sql');
const ROLLBACK = sqlOf('0042_owner_test_seed_rollback.sql');
const MOVE = sqlOf('0045_owner_seed_orden_to_keeper.sql');

// beans_percent лестницы «Зал» (0040) — эталон для сверки кэшбэка чеков сида.
const RANK_PERCENT: Record<string, number> = {
  'первый глоток': 2,
  'любитель': 3,
  'дегустатор': 4,
  'ценитель': 5,
  'знаток': 6,
  'энтузиаст': 8,
  'хранитель вкуса': 10,
};

// [ранг на момент чека, gross, beans_earned] — все 22 чека сида 0041.
const SEED_CHECKS: Array<[string, number, number]> = [
  ['первый глоток', 1800, 36],
  ['любитель', 2200, 66],
  ['ценитель', 1600, 80],
  ['знаток', 2500, 150],
  ['энтузиаст', 1900, 152],
  ['хранитель вкуса', 2300, 230],
  ['хранитель вкуса', 1700, 170],
  ['хранитель вкуса', 2100, 210],
  ['хранитель вкуса', 2600, 260],
  ['хранитель вкуса', 2000, 200],
  ['хранитель вкуса', 1800, 180],
  ['хранитель вкуса', 2400, 240],
  ['хранитель вкуса', 2200, 220],
  ['хранитель вкуса', 1600, 160],
  ['хранитель вкуса', 650, 65],
  ['хранитель вкуса', 480, 48],
  ['хранитель вкуса', 590, 59],
  ['хранитель вкуса', 620, 62],
  ['хранитель вкуса', 350, 35],
  ['хранитель вкуса', 640, 64],
  ['хранитель вкуса', 610, 61],
  ['хранитель вкуса', 650, 65],
];

describe('0041 — кэшбэк сида считается от ранга на момент чека (не фиксированные 10%)', () => {
  it('каждый чек: beans_earned = round(gross × % ранга той же строки)', () => {
    for (const [rank, gross, earned] of SEED_CHECKS) {
      const literal = `rank_name = '${rank}'), ${gross}, 0, 0, ${gross}, ${earned},`;
      expect(SEED, `чек ${rank} ${gross}₽ → +${earned}`).toContain(literal);
      expect(earned).toBe(Math.round((gross * RANK_PERCENT[rank]) / 100));
    }
    expect(SEED_CHECKS).toHaveLength(22);
    // Регрессия именно против «всем 10%»: в сиде есть чеки с 2%, 3%, 5%,
    // 6%, 8% — ставка различается по рангу на момент чека.
    const exercised = new Set(SEED_CHECKS.map(([rank]) => RANK_PERCENT[rank]));
    expect(exercised.size).toBeGreaterThanOrEqual(4);
    expect(exercised.has(10)).toBe(true);
    expect(exercised.has(2)).toBe(true);
    // Дегустатор (4%) в истории сида нет — все чеки лежат с нулевым
    // списанием зёрен/картой (наличные целиком): ровно 22 таких строки.
    expect(SEED.match(/, 0, 0, \d+, \d+,/g)).toHaveLength(22);
  });

  it('журнал зёрен сходится: welcome 300 ровно один раз, живых 3 113', () => {
    const movements = [...SEED.matchAll(/, (-?\d+), '(welcome|earn|redeem)',/g)];
    expect(movements.length).toBe(23); // 300 welcome + 22 earn, redeem нет
    const byReason = { welcome: [] as number[], earn: [] as number[], redeem: [] as number[] };
    for (const m of movements) byReason[m[2] as keyof typeof byReason].push(Number(m[1]));
    expect(byReason.welcome).toEqual([300]);
    expect(byReason.redeem).toHaveLength(0);
    const total = movements.reduce((sum, m) => sum + Number(m[1]), 0);
    expect(total).toBe(3113);
  });

  it('карта-депозит 2 000 ₽ с движением topup, чековый остаток — наличные', () => {
    expect(SEED).toContain(
      `values ('c20fdfab-9686-4136-acae-b2618d76b174', v_guest, 'shop-xo-vsevolozhsk', 2000)`
    );
    expect(SEED).toContain(`values ('0f82500a-8353-4cc3-95fb-6acfa9509e2f', 'c20fdfab-9686-4136-acae-b2618d76b174', 2000, 'topup')`);
  });

  it('батч защищён от повторного применения (raise «already applied»)', () => {
    expect(SEED).toContain(`raise exception 'test seed: batch % already applied', v_batch;`);
  });
});

describe('0045 — переезд ордена сида на «Хранитель вкуса»', () => {
  it('переносит orden_rank_id/current_rank_id на топовый ранг, pinned = true', () => {
    expect(MOVE).toContain(`v_batch text := 'owner-xocoffee-2026-11-11'`);
    // Топовый ранг ищется, а не хардкодится по имени: max rank_order «Зала».
    expect(MOVE).toMatch(
      /select id into v_top_rank_id\s+from public\.shop_ranks\s+where shop_id = v_shop and circuit = 'hall'\s+order by rank_order desc\s+limit 1;/
    );
    expect(MOVE).toMatch(
      /update public\.guest_shop_statuses\s+set orden_rank_id = v_top_rank_id,\s+current_rank_id = v_top_rank_id,\s+orden_pinned = true,/
    );
    expect(MOVE).toContain(`where guest_id = v_guest and shop_id = v_shop`);
    // История (чеки/зёрна/карта) в 0045 не трогается.
    expect(MOVE).not.toMatch(/loyalty_consumptions|beans_ledger|deposit_card/);
  });

  it('пометка в реестр — та же batch-метка, дублей нет, без жёстких исключений', () => {
    expect(MOVE).toMatch(
      /if not exists \(\s+select 1 from public\.loyalty_test_seeds\s+where batch = v_batch and table_name = 'guest_shop_statuses' and row_id = v_status_id/
    );
    expect(MOVE).toContain(
      `insert into public.loyalty_test_seeds (batch, table_name, row_id) values (v_batch, 'guest_shop_statuses', v_status_id)`
    );
    // Отсутствие учётки/статуса в свежем окружении — notice и выход, а не
    // падение миграции.
    expect(MOVE).not.toContain('raise exception');
    expect(MOVE).toContain('raise notice');
  });

  it('идемпотентна: одна вставка (реестр), удалений нет', () => {
    expect(MOVE.match(/insert into/g)).toHaveLength(1);
    expect(MOVE).not.toMatch(/delete from/);
  });
});

describe('0042 — откат снимает весь батч целиком, включая строку статуса из 0045', () => {
  it('удаляет ровно зарегистрированные строки батча, затем сам реестр', () => {
    expect(ROLLBACK).toMatch(
      /for r in select table_name, row_id from public\.loyalty_test_seeds where batch = 'owner-xocoffee-2026-11-11' loop\s+execute format\('delete from public\.%i where id = \$1', r\.table_name\) using r\.row_id;/
    );
    expect(ROLLBACK).toContain(
      `delete from public.loyalty_test_seeds where batch = 'owner-xocoffee-2026-11-11';`
    );
    // Повторный прогон отката: в реестре 0 строк цикла — чистый no-op.
    expect(ROLLBACK).not.toContain('raise exception');
  });
});
