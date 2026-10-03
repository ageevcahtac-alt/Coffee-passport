import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const rows = [
  { id: 'published', author_type: 'barista', author_id: 'test-barista', is_public: true },
  { id: 'draft', author_type: 'barista', author_id: 'test-barista', is_public: false },
  { id: 'other-author', author_type: 'barista', author_id: 'other', is_public: true },
];
vi.mock('@/lib/supabase/adminClient', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: { id: 'test-barista', name: 'Test', coffee_shop_id: 'shop' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: table === 'recipes' ? rows.filter(row => filters.every(([key, value]) => row[key as keyof typeof row] === value)) : [],
          error: null,
        }).then(resolve),
      };
      return query;
    },
  }),
}));

describe('public barista recipes', () => {
  it('returns published recipes only, even with a service-role client', async () => {
    const response = await GET(new Request('http://localhost/api/barista/test-barista'), { params: { id: 'test-barista' } });
    expect(response.status).toBe(200);
    expect((await response.json()).recipes.map((recipe: { id: string }) => recipe.id)).toEqual(['published']);
  });
});
