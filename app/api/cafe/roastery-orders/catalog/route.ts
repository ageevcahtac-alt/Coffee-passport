import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { xoAdmin } from '@/lib/integrations/xoAdmin';
import { adminJson } from '@/lib/orders/respond';

// What a coffee shop can order: XO COFFEE's published products and packaging
// variants — the same catalog XO Store sells from (Admin), each tied to its
// Canonical Lot by passport_public_id. No second catalog in Passport.
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;
  return adminJson(await xoAdmin.catalog());
}
