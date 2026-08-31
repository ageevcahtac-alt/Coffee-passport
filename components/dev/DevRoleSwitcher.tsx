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
// account (see app/auth/actions.ts for the one-time setup that account
// needs) before landing on the dashboard.
const NAV_ROLES = [
  { label: 'Энтузиаст', href: '/journey', icon: '☕' },
  { label: 'Админ', href: '/admin', icon: '🛠️' },
] as const;

export function DevRoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5">
      {!collapsed && (
        <div
          className="flex items-center gap-1 rounded-full border border-ink-200 bg-parchment-100/95
                     backdrop-blur-sm px-1.5 py-1.5 shadow-[0_8px_20px_-8px_rgba(26,20,16,0.35)]"
        >
          <span className="text-[9px] uppercase tracking-widest2 text-ink-300 px-2 select-none">
            Dev
          </span>
          {NAV_ROLES.map((role) => {
            const active = pathname === role.href || pathname?.startsWith(`${role.href}/`);
            return (
              <button
                key={role.href}
                type="button"
                onClick={() => router.push(role.href)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs
                            font-body font-medium transition-colors
                            ${active
                              ? 'bg-ink-900 text-parchment-100'
                              : 'text-ink-700 hover:bg-parchment-300'}`}
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
                <button
                  type="submit"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs
                              font-body font-medium transition-colors
                              ${active
                                ? 'bg-ink-900 text-parchment-100'
                                : 'text-ink-700 hover:bg-parchment-300'}`}
                >
                  <span aria-hidden="true">{role.icon}</span>
                  {role.label}
                </button>
              </form>
            );
          })}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Свернуть переключатель ролей"
            className="text-ink-300 hover:text-ink-600 px-2 text-sm leading-none"
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
