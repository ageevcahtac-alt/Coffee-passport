import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Minimal config, added for TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md's
// tests: lib/journey/store.ts (and its dependencies) import via the '@/*'
// alias tsconfig.json already declares, which vitest doesn't resolve on its
// own. lib/server/canonicalLot.test.ts never needed this — it only uses
// relative imports — so no config existed before this.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
