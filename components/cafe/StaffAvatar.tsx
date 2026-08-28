// Generated initials avatar — no photo upload pipeline exists yet, so every
// staff member gets a deterministic, on-brand seal instead. Same name always
// yields the same color, so a person's avatar stays stable across renders.
const AVATAR_PALETTE = [
  'var(--color-gold-500)',
  'var(--color-ink-500)',
  'var(--color-rating)',
  'var(--color-gold-400)',
  'var(--color-ink-400)',
];

const SIZE_CLASSES = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-14 h-14 text-base',
  lg: 'w-20 h-20 text-2xl',
} as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function StaffAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const color = AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center
                  font-display text-parchment-100 shrink-0`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
