import type { PartnerRequestInput } from '@/lib/types/partnerRequest';

// Notifies the manager by email that a new partner lead came in. No SDK
// dependency — Resend's HTTP API is one POST. No-ops (logs and returns)
// until both RESEND_API_KEY and PARTNER_NOTIFY_EMAIL are set as env vars
// (e.g. on Render) — the lead is still saved either way, this is only the
// notification step.
export async function sendPartnerRequestNotification(input: PartnerRequestInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.PARTNER_NOTIFY_EMAIL;

  if (!apiKey || !notifyEmail) {
    console.info(
      '[partner-requests] Email notification skipped — set RESEND_API_KEY and ' +
        'PARTNER_NOTIFY_EMAIL to enable it. Lead was still saved.'
    );
    return;
  }

  const roleLabel = input.role_requested === 'roaster' ? 'Обжарщик' : 'Кофейня';
  const html = `
    <h2>Новая партнёрская заявка — ${escapeHtml(input.company_name)}</h2>
    <table cellpadding="6" cellspacing="0">
      <tr><td><strong>Роль</strong></td><td>${escapeHtml(roleLabel)}</td></tr>
      <tr><td><strong>Компания</strong></td><td>${escapeHtml(input.company_name)}</td></tr>
      <tr><td><strong>Город</strong></td><td>${escapeHtml(input.city || '—')}</td></tr>
      <tr><td><strong>Контакт</strong></td><td>${escapeHtml(input.contact_name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(input.email)}</td></tr>
      <tr><td><strong>Телефон</strong></td><td>${escapeHtml(input.phone || '—')}</td></tr>
      <tr><td><strong>Комментарий</strong></td><td>${escapeHtml(input.comment || '—')}</td></tr>
    </table>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.PARTNER_NOTIFY_FROM || 'Coffee Passport <onboarding@resend.dev>',
        to: notifyEmail,
        subject: `Новая заявка партнёра: ${input.company_name}`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[partner-requests] Resend request failed', response.status, body);
    }
  } catch (error) {
    // Never let a notification failure fail the lead submission itself.
    console.error('[partner-requests] Resend request threw', error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
