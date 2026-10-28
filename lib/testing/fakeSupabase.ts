// Chainable stand-in for the supabase-js query builder in route tests: every
// call is recorded as { table, op, filters, payload } and answered by the
// test's own handler. Awaiting the builder, .single() and .maybeSingle() all
// end the chain.
export interface FakeQuery {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns: string | null;
  filters: Record<string, unknown>;
  payload: unknown;
  single: boolean;
}

export type FakeResult = { data: unknown; error: { message: string; code?: string } | null };

export function fakeSupabase(handler: (query: FakeQuery) => FakeResult) {
  const calls: FakeQuery[] = [];
  const client = {
    from(table: string) {
      const query: FakeQuery = { table, op: 'select', columns: null, filters: {}, payload: null, single: false };
      const run = async () => {
        calls.push(query);
        return handler(query);
      };
      const builder = {
        select(columns?: string) {
          if (query.op === 'select') query.columns = columns ?? '*';
          return builder;
        },
        order: () => builder,
        eq(column: string, value: unknown) {
          query.filters[column] = value;
          return builder;
        },
        in(column: string, values: unknown) {
          query.filters[column] = values;
          return builder;
        },
        insert(payload: unknown) {
          query.op = 'insert';
          query.payload = payload;
          return builder;
        },
        upsert(payload: unknown) {
          query.op = 'upsert';
          query.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          query.op = 'update';
          query.payload = payload;
          return builder;
        },
        delete() {
          query.op = 'delete';
          return builder;
        },
        single() {
          query.single = true;
          return run();
        },
        maybeSingle() {
          query.single = true;
          return run();
        },
        then<T>(resolve: (value: FakeResult) => T, reject?: (reason: unknown) => T) {
          return run().then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, calls };
}
