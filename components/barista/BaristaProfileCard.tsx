import { BREWING_METHODS, type Barista } from '@/lib/types/coffee';

// The "Напиток приготовил(а) [Имя]" plaque — shown on the tasting Success
// Screen (see FarmerPinningModal) and reusable anywhere else a barista's
// identity needs a compact, guest-facing face (avatar + name + favorite
// origin/method). Renders nothing beyond the name when favoriteOrigin/
// favoriteBrewMethod haven't been set yet (see BaristaProfileForm).
export function BaristaProfileCard({ barista }: { barista: Barista }) {
  const methodLabel = barista.favoriteBrewMethod
    ? BREWING_METHODS.find((method) => method.id === barista.favoriteBrewMethod)?.label
    : null;
  const hasFavorite = Boolean(barista.favoriteOrigin || methodLabel);

  return (
    <div className="flex items-center gap-3 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-left">
      <BaristaAvatar barista={barista} />
      <div className="min-w-0">
        <p className="text-sm text-ink-900">
          Напиток приготовил(а) <strong className="font-medium">{barista.name}</strong>
        </p>
        {hasFavorite && (
          <p className="text-xs text-ink-500 mt-0.5">
            Любимый кофе бариста: {[barista.favoriteOrigin, methodLabel ? `в ${methodLabel}` : ''].filter(Boolean).join(' ')}
          </p>
        )}
      </div>
    </div>
  );
}

export function BaristaAvatar({ barista }: { barista: Barista }) {
  if (barista.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are
    // arbitrary staff-supplied links, not part of the app's own asset
    // pipeline, so next/image's remote-pattern allowlist doesn't fit here.
    return (
      <img
        src={barista.avatarUrl}
        alt={barista.name}
        className="h-10 w-10 shrink-0 rounded-full object-cover border border-ink-200"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-parchment-100 font-display text-sm"
    >
      {barista.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
