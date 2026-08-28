// A display-only invite code the admin copies and sends to a newly
// activated partner manually (email/chat) — there's no real multi-tenant
// auth wired up in this demo (Supabase Auth here only covers the roaster-
// membership dashboard at /dashboard/(members)), so this does not create
// an account you can actually log in with yet. It's a readable, copyable
// placeholder for that future step.
export function generateInvitePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 4294967296);
  }
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) result += '-';
  }
  return result;
}
