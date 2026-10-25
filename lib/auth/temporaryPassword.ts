// A login the cafe creates (or re-issues) for a barista carries a temporary
// password. Until its owner sets their own password the account is a plain
// 'enthusiast' profile: every RLS policy and loyalty RPC checks
// profiles.role, so nothing a barista can do in the database is open to it.
// Which cafe and barista card the login belongs to waits in app_metadata
// (writable only with the service-role key) and becomes profiles.role =
// 'barista' at the password change — app/auth/change-password/actions.ts.

export const TEMPORARY_PASSWORD_TTL_MS = 72 * 60 * 60 * 1000;
export const TEMPORARY_PASSWORD_MIN = 12;
export const TEMPORARY_PASSWORD_MAX = 128;

export const TEMPORARY_PASSWORD_EXPIRED_MESSAGE =
  'Срок временного пароля (72 часа) истёк. Попросите кофейню выдать новый.';

export type TemporaryPasswordState = 'none' | 'active' | 'expired';

type AuthUserLike = {
  created_at?: string;
  app_metadata?: Record<string, unknown> | null;
};

export function pendingBaristaMetadata(cafeId: string, baristaId: string, now = Date.now()) {
  return {
    must_change_password: true,
    temporary_password_expires_at: new Date(now + TEMPORARY_PASSWORD_TTL_MS).toISOString(),
    cafe_id: cafeId,
    barista_id: baristaId,
  };
}

// No recorded expiry (logins created before it existed) counts from the
// account's creation, so an old temporary password does not live forever.
export function temporaryPasswordExpiresAt(user: AuthUserLike): number | null {
  const recorded = user.app_metadata?.temporary_password_expires_at;
  const at = typeof recorded === 'string' ? Date.parse(recorded) : NaN;
  if (!Number.isNaN(at)) return at;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isNaN(created) ? null : created + TEMPORARY_PASSWORD_TTL_MS;
}

export function temporaryPasswordState(user: AuthUserLike | null | undefined, now = Date.now()): TemporaryPasswordState {
  if (!user || user.app_metadata?.must_change_password !== true) return 'none';
  const expiresAt = temporaryPasswordExpiresAt(user);
  return expiresAt === null || expiresAt <= now ? 'expired' : 'active';
}

export function pendingBaristaBinding(user: AuthUserLike): { cafeId: string; baristaId: string } | null {
  const cafeId = user.app_metadata?.cafe_id;
  const baristaId = user.app_metadata?.barista_id;
  return typeof cafeId === 'string' && cafeId && typeof baristaId === 'string' && baristaId
    ? { cafeId, baristaId }
    : null;
}
