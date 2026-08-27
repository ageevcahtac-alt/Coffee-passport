import type { CoffeeShop } from '@/lib/types/coffee';

export function CoffeeShopSelector({
  shops,
  value,
  onChange,
  name = 'coffee-shop',
}: {
  shops: CoffeeShop[];
  value: string | null;
  onChange: (shopId: string) => void;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Кофейня" className="flex flex-col gap-3">
      {shops.map((shop) => {
        const checked = value === shop.id;
        return (
          <label
            key={shop.id}
            className={`flex items-center justify-between rounded-md border px-4 py-4
                        cursor-pointer transition-colors
                        ${checked ? 'border-gold-400 bg-gold-400/10' : 'border-ink-200 bg-parchment-100'}`}
          >
            <span>
              <span className="block text-sm font-medium text-ink-900">{shop.name}</span>
              <span className="block text-xs text-ink-400">{shop.city}</span>
            </span>
            <input
              type="radio"
              name={name}
              value={shop.id}
              checked={checked}
              onChange={() => onChange(shop.id)}
              className="h-4 w-4 accent-current text-gold-500"
            />
          </label>
        );
      })}
    </div>
  );
}
