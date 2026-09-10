// Contextual Taste visual polish pass — replaces the 🔒/🔓 emoji used around
// the blind-tasting gate (BlindTastingLock, and the unlock moment on the
// passport reveal) with a small line-art glyph matching the editorial,
// single-stroke SVG language already established by FarmerRevealCard's
// engraving illustration (currentColor, no fill, restrained stroke width).
export function LockIcon({
  open = false,
  className = 'w-5 h-5',
}: {
  open?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" />
      {open ? (
        <path
          d="M8 11V8a4 4 0 0 1 7.2-2.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M8 11V8a4 4 0 0 1 8 0v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
