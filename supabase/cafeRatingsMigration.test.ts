import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Offline-семантика миграции 0052_cafe_ratings.sql: структура таблицы,
// частичный unique index на активную пару, отсутствие write-политик
// (записи — только через RPC), публичные чтения через security definer.
// Поведение под нагрузкой (постановка/удаление/повтор, гонка вторая
// активная) покрыто интеграционным прогоном supabase/tests/cafeRatings
// (workflow migration-test) — здесь то, что можно проверить без Postgres.

const FILE = path.resolve(__dirname, 'migrations', '0052_cafe_ratings.sql');
const sql = () => fs.readFileSync(FILE, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('0052_cafe_ratings', () => {
  it('exists', () => {
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it('creates the table with the owner’s shape: score 1–5, review nullable, soft delete', () => {
    const text = sql();
    expect(text).toMatch(/create table if not exists public\.cafe_ratings \(/);
    expect(text).toMatch(/cafe_id text not null references public\.coffee_shops\(slug\) on delete restrict/);
    // SET NULL (не cascade): удаление учётки обезличивывает оценки, но не стирает историю для аудита/премии.
    expect(text).toMatch(/user_id uuid references auth\.users\(id\) on delete set null/);
    expect(text).toMatch(/score smallint not null check \(score between 1 and 5\)/);
    expect(text).toMatch(/review text/);
    expect(text).toMatch(/deleted_at timestamptz/);
  });

  it('enforces one ACTIVE rating per guest+cafe pair via a partial unique index', () => {
    const text = sql();
    expect(text).toMatch(
      /create unique index if not exists cafe_ratings_active_pair_uidx on public\.cafe_ratings \(cafe_id, user_id\) where deleted_at is null/
    );
    // …и отдельный индекс для чтений агрегатов по кофейне.
    expect(text).toMatch(/create index if not exists cafe_ratings_cafe_active_idx on public\.cafe_ratings \(cafe_id\) where deleted_at is null/);
  });

  it('keeps table writes server-side: no insert/update/delete grants or policies', () => {
    const text = sql();
    expect(text).toMatch(/revoke insert, update, delete on public\.cafe_ratings from anon, authenticated/);
    expect(text).not.toMatch(/create policy[^;]*for insert/);
    expect(text).not.toMatch(/create policy[^;]*for update/);
    expect(text).not.toMatch(/create policy[^;]*for delete/);
    // Чтение таблицы: своя строка гостем и своя кофейня staff — не шире.
    expect(text).toMatch(/create policy "guest reads own active cafe rating"[^;]*auth\.uid\(\) = user_id and deleted_at is null/);
    expect(text).toMatch(/create policy "shop staff read own shop cafe ratings"/);
  });

  it('exposes public aggregates/reviews and guest writes as security definer RPCs', () => {
    const text = sql();
    for (const fn of ['cafe_rating_summary(text)', 'cafe_rating_reviews(text, integer)', 'cafe_rate(text, integer, text)', 'cafe_unrate(text)']) {
      expect(text).toContain(`function public.${fn}`);
      expect(text).toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to anon, authenticated`));
    }
    // Агрегаты считаются на чтении и только по активным строкам; отзывы —
    // только с текстом, имя из профиля с фолбэком «Гость без имени».
    expect(text).toContain("'гость без имени'");
    expect(text).toMatch(/where r\.cafe_id = p_cafe_id and r\.deleted_at is null/);
    expect(text).toMatch(/and r\.review is not null and btrim\(r\.review\) <> ''/);
  });

  it('locks the rules in the RPC body: enthusiast only, partner cafe only, no second active rating', () => {
    const text = sql();
    expect(text).toContain("p.role = 'enthusiast'");
    expect(text).toContain('from public.coffee_shops s where s.slug = p_cafe_id');
    expect(text).toMatch(/when unique_violation then/);
    // Мягкое удаление: только своя активная строка, found — иначе отказ.
    expect(text).toMatch(/update public\.cafe_ratings set deleted_at = now\(\) where cafe_id = p_cafe_id and user_id = v_uid and deleted_at is null/);
  });
});
