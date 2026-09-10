// Notification Center trigger icon — same restrained, single-stroke SVG
// language as components/coffee/LockIcon.tsx and FarmerRevealCard's
// engraving illustration (currentColor, no fill). Not an emoji: section 17
// of the Notification/Event Center brief explicitly rules emoji out for
// this surface.
export function BellIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M6 10.5a6 6 0 0 1 12 0c0 3.2.9 5.1 1.7 6.2.4.5 0 1.3-.6 1.3H4.9c-.6 0-1-.8-.6-1.3.8-1.1 1.7-3 1.7-6.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
