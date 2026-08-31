// Shared id generator for every locally-created record that may also get
// written through to Supabase (recipes, checkins, equipment) — using a
// real UUID means the client-generated id IS the row's primary key once
// synced, so there's no separate "reconcile the optimistic id with the
// server id" step after a successful write.
export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Not a valid UUID — only reached in environments without crypto.randomUUID.
  // A Supabase write with this id will fail type-checking on the uuid
  // column and fall back to local-only, same as any other offline write.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
