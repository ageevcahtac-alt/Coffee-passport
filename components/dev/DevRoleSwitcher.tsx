'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { signInAsPilotStaff } from '@/app/auth/actions';
import { PILOT_STAFF_ROLES } from '@/lib/auth/pilotStaff';

// Demo-stage convenience: jump straight into any cabinet without typing a
// login form by hand. Always visible (this whole deployment IS the demo),
// not gated behind NODE_ENV, since it's meant for testing the live Render
// site too, not just local dev.
//
// Энтузиаст/Админ are plain navigation — neither route needs a session
// (/journey works anonymously, /admin is HTTP-Basic-gated by
// middleware.ts). Кофейня/Обжарщик/Бариста are real staff dashboards now
// gated by requireStaffRole.ts, so a bare router.push would just bounce
// to /auth/login with no session behind it — those three submit
// signInAsPilotStaff instead, which signs in as that role's fixed pilot
// account (see app/auth/actions.ts) before landing on the dashboard.
const NAV_ROLES = [
  { label: 'Энтузиаст', href: '/journey', icon: '☕' },
  { label: 'Админ', href: '/admin', icon: '🛠️' },
] as const;

// w-full on mobile so each button fills (and wraps within) its grid
// column instead of forcing the column wider than the viewport; w-auto on
// sm+ screens restores the original content-sized pill in the flex row.
const buttonClasses = (active: boolean) =>
  `flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs
   font-body font-medium text-center transition-colors
   ${active ? 'bg-ink-900 text-parchment-100' : 'text-ink-700 hover:bg-parchment-300'}`;

export function DevRoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    // inset-x-0 + justify-center (rather than left-1/2 + -translate-x-1/2)
    // so the panel can never itself force horizontal overflow on a narrow
    // screen — its own px-4 gutter is the outer scroll boundary, not the
    // panel's content width. bottom-[...] adds the iOS home-indicator
    // safe-area inset on top of the normal 1rem gap, so the panel — and
    // whatever floating "scroll to top" control a page places in a bottom
    // corner — both clear the gesture bar instead of sitting under it.
    // Centering (instead of pinning to an edge) also means this panel
    // never claims a page's bottom corners, which is exactly where a
    // scroll-to-top button would live.
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      {!collapsed && (
        <div
          className="flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-ink-200
                     bg-parchment-100/95 backdrop-blur-sm px-3 py-2.5
                     shadow-[0_8px_20px_-8px_rgba(26,20,16,0.35)]
                     sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-1
                     sm:rounded-full sm:px-1.5 sm:py-1.5"
        >
          <div className="flex items-center justify-between sm:contents">
            <span className="text-[9px] uppercase tracking-widest2 text-ink-300 px-2 select-none">
              Dev
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Свернуть переключатель ролей"
              className="text-ink-300 hover:text-ink-600 px-2 text-sm leading-none sm:hidden"
            >
              ×
            </button>
          </div>

          {/* 2-column grid on mobile so five role buttons stay on-screen
              without a horizontal scrollbar; a plain flex row on sm+
              screens, matching the original single-row layout. */}
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-1">
            {NAV_ROLES.map((role) => {
              const active = pathname === role.href || pathname?.startsWith(`${role.href}/`);
              return (
                <button
                  key={role.href}
                  type="button"
                  onClick={() => router.push(role.href)}
                  className={buttonClasses(active)}
                >
                  <span aria-hidden="true">{role.icon}</span>
                  {role.label}
                </button>
              );
            })}
            {PILOT_STAFF_ROLES.map((role) => {
              const active =
                pathname === role.dashboardPath || pathname?.startsWith(`${role.dashboardPath}/`);
              return (
                <form key={role.role} action={signInAsPilotStaff} className="contents">
                  <input type="hidden" name="role" value={role.role} />
                  <button type="submit" className={buttonClasses(active)}>
                    <span aria-hidden="true">{role.icon}</span>
                    {role.label}
                  </button>
                </form>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Свернуть переключатель ролей"
            className="hidden text-ink-300 hover:text-ink-600 px-2 text-sm leading-none sm:block"
          >
            ×
          </button>
        </div>
      )}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Показать переключатель ролей"
          className="rounded-full border border-ink-200 bg-parchment-100/95 backdrop-blur-sm
                     w-9 h-9 flex items-center justify-center text-sm shadow-[0_8px_20px_-8px_rgba(26,20,16,0.35)]"
        >
          🛠️
        </button>
      )}
    </div>
  );
}
