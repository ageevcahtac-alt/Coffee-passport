import type { Roaster } from '@/lib/types/coffee';
import { PartnerAutocomplete } from './PartnerAutocomplete';

// Search-driven picker over the accredited roaster partner list (see
// lib/data/roasters.ts — every entry there already passed the partner
// contract + admin-activation pipeline). Used alongside CoffeeShopSelector
// on the new "location" step of the tasting flow — pre-filled to the
// scanned lot's own roaster (see LocationStep), editable so staff can
// correct it for the rare mismatch.
export function RoasterAutocomplete({
  roasters,
  value,
  onChange,
  disabled = false,
  helperText,
}: {
  roasters: Roaster[];
  value: string | null;
  onChange: (roasterId: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <PartnerAutocomplete
      label="Обжарщик"
      emptyLabel="Найти аккредитованного обжарщика…"
      options={roasters.map((roaster) => ({ id: roaster.id, name: roaster.name, subtitle: roaster.city }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      helperText={helperText}
    />
  );
}
