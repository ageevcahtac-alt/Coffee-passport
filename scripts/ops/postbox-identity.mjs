#!/usr/bin/env node
// Адрес (домен) в Yandex Cloud Postbox для workflow postbox. Node 22, без зависимостей.
//   node scripts/ops/postbox-identity.mjs create|status|roles <домен>
// Ключ сервисного аккаунта (authorized key JSON) — в env YC_SA_KEY. Печатает ответ Postbox дословно:
// в нём нет секретов (DKIM — Easy DKIM, ключи держит Postbox), только статусы и имена DNS-записей.
import { createSign, constants } from 'node:crypto';

const API = 'https://postbox.cloud.yandex.net/v2/email/identities';
const IAM = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
const [mode, domain] = process.argv.slice(2);
if (!['create', 'status', 'roles'].includes(mode) || !domain) {
  console.error('usage: postbox-identity.mjs create|status|roles <домен>');
  process.exit(2);
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

// JWT PS256 → IAM-токен (https://yandex.cloud/ru/docs/iam/operations/iam-token/create-for-sa).
async function iamToken() {
  const key = JSON.parse(process.env.YC_SA_KEY || '{}');
  if (!key.id || !key.service_account_id || !key.private_key) throw new Error('YC_SA_KEY не задан или неполный');
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'PS256', kid: key.id }));
  const body = b64url(JSON.stringify({ aud: IAM, iss: key.service_account_id, iat: now, exp: now + 600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  const signature = signer.sign({
    key: key.private_key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  });
  const response = await fetch(IAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt: `${head}.${body}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`IAM HTTP ${response.status}`);
  const { iamToken: token } = await response.json();
  console.log(`::add-mask::${token}`);
  return token;
}

async function postbox(token, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { 'X-YaCloud-SubjectToken': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, text: await response.text() };
}

const token = await iamToken();
if (mode === 'roles') {
  // Роли сервисного аккаунта на его каталоге — только id ролей, без секретов.
  const sa = JSON.parse(process.env.YC_SA_KEY).service_account_id;
  const auth = { Authorization: `Bearer ${token}` };
  const info = await fetch(`https://iam.api.cloud.yandex.net/iam/v1/serviceAccounts/${sa}`, { headers: auth });
  const { folderId } = await info.json().catch(() => ({}));
  console.log(`serviceAccounts.get HTTP ${info.status}, folderId ${folderId || '?'}`);
  if (folderId) {
    const list = await fetch(
      `https://resource-manager.api.cloud.yandex.net/resource-manager/v1/folders/${folderId}:listAccessBindings`,
      { headers: auth });
    const body = await list.json().catch(() => ({}));
    const mine = (body.accessBindings || []).filter((b) => b.subject?.id === sa).map((b) => b.roleId);
    console.log(`listAccessBindings HTTP ${list.status}, роли аккаунта: ${mine.join(', ') || '(нет)'}`);
  }
  process.exit(0);
}
const url = `${API}/${encodeURIComponent(domain)}`;
let found = await postbox(token, 'GET', url);
if (found.status === 404 && mode === 'create') {
  const created = await postbox(token, 'POST', API, { EmailIdentity: domain });
  console.log(`CreateEmailIdentity HTTP ${created.status}`);
  console.log(created.text);
  if (created.status >= 300) process.exit(1);
  found = await postbox(token, 'GET', url);
}
console.log(`GetEmailIdentity HTTP ${found.status}`);
console.log(found.text);
if (found.status !== 200) process.exit(1);

const identity = JSON.parse(found.text);
const dkim = identity.DkimAttributes || {};
console.log('\n## DNS-записи DKIM (Easy DKIM, из ответа Postbox)');
for (const record of dkim.Tokens || []) console.log(record);
console.log(`\nVerifiedForSendingStatus: ${identity.VerifiedForSendingStatus}`);
console.log(`DkimAttributes.Status: ${dkim.Status}`);
