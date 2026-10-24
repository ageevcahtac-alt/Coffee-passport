import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prod run 40112929720: a barista created from the cafe cabinet opened a blank
// /dashboard/barista. Dashboards sit outside app/(site)/layout.tsx, so
// CurrentUserProvider's app-wide barista_profiles sync never ran there and a
// barista missing from the static seed was never found.
const mocks = vi.hoisted(() => ({ profiles: vi.fn(), menu: vi.fn() }));
vi.mock('./baristaProfileStore', () => ({ syncBaristaProfilesFromSupabase: mocks.profiles }));
vi.mock('./cafeMenuStore', () => ({ syncCafeMenuFromSupabase: mocks.menu }));

import { syncBaristaDashboard } from './baristaDashboardSync';

describe('syncBaristaDashboard', () => {
  beforeEach(() => {
    mocks.profiles.mockReset().mockResolvedValue(undefined);
    mocks.menu.mockReset().mockResolvedValue(undefined);
  });

  it('loads barista profiles and the cafe menu for the dashboard', async () => {
    await syncBaristaDashboard('shop-xo-vsevolozhsk');
    expect(mocks.profiles).toHaveBeenCalledTimes(1);
    expect(mocks.menu).toHaveBeenCalledWith('shop-xo-vsevolozhsk');
  });

  it('still loads profiles when the menu sync fails', async () => {
    mocks.menu.mockRejectedValue(new Error('offline'));
    await syncBaristaDashboard('shop-xo-vsevolozhsk');
    expect(mocks.profiles).toHaveBeenCalledTimes(1);
  });
});
