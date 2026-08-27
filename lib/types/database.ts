// Placeholder — replace by running, once the Supabase project exists:
//
//   npx supabase gen types typescript --project-id <project-ref> > lib/types/database.ts
//
// Keeping this stub for now so imports across the app type-check during
// scaffolding (step 2). Swap it in before wiring real data (step 6).

export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
  };
};