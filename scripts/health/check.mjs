#!/usr/bin/env node
// Проверка страниц и внутренних ссылок. Node 18+, без зависимостей.
// node scripts/health/check.mjs [--base URL] [--config path]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
for (const k of ['base', 'config']) if (k in args && (!args[k] || args[k].startsWith('--'))) {
  console.error(`--${k} без значения`); process.exit(2);
}
const cfg = JSON.parse(await readFile(args.config || '.agents/health.config.json', 'utf8'));
const base = (args.base || cfg.baseUrl).replace(/\/$/, '');
const maxMs = cfg.maxMs ?? 3000;
const maxLinks = cfg.maxLinks ?? 300;
const timeoutMs = cfg.timeoutMs ?? 15000;

async function hit(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const type = r.headers.get('content-type') || '';
    const body = /text\/html|json/.test(type) ? await r.text() : (await r.arrayBuffer(), '');
    return { url, status: r.status, ms: Date.now() - t, body };
  } catch (e) {
    return { url, status: 0, ms: Date.now() - t, error: e.cause?.code || e.name || String(e), body: '' };
  }
}

function internalLinks(html, pageUrl) {
  const out = new Set();
  for (const m of html.matchAll(/(?:href|src)=["']([^"'#]+)["']/g)) {
    const raw = m[1].replace(/&amp;/g, '&');  // атрибуты в HTML экранированы: &amp; → &
    if (/^(mailto:|tel:|javascript:|data:)/.test(raw)) continue;
    let u; try { u = new URL(raw, pageUrl); } catch { continue; }
    if (u.origin === new URL(base).origin) out.add(u.href.split('#')[0]);
  }
  return out;
}

const fails = [], pages = [];
const specs = cfg.pages.map(p => typeof p === 'string' ? { path: p } : p);
// Страницы из конфига проверяются по своей спецификации (например, /admin → 401), а не как ссылки.
const seen = new Set(specs.map(s => base + s.path));
for (const spec of specs) {
  const url = base + spec.path;
  const r = await hit(url);
  const problems = [];
  // spec.status — ожидаемый код для закрытых страниц (например, страница за Basic Auth → 401).
  if (r.status === 0) problems.push(`network ${r.error}`);
  else if (spec.status ? r.status !== spec.status : r.status >= 400)
    problems.push(`HTTP ${r.status}${spec.status ? `, ждали ${spec.status}` : ''}`);
  if (r.ms > maxMs) problems.push(`slow ${r.ms}ms > ${maxMs}ms`);
  for (const text of spec.mustContain || []) if (!r.body.includes(text)) problems.push(`missing text "${text}"`);
  pages.push({ url, status: r.status, ms: r.ms, problems });
  if (problems.length) fails.push({ url, kind: 'page', problems });
  if (cfg.checkLinks !== false && r.status > 0 && r.status < 400 && r.body) for (const l of internalLinks(r.body, url)) {
    if (seen.has(l) || seen.size >= maxLinks) continue;
    seen.add(l);
    const lr = await hit(l);
    if (lr.status === 0 || lr.status >= 400)
      fails.push({ url: l, kind: 'link', from: url, problems: [lr.status ? `HTTP ${lr.status}` : `network ${lr.error}`] });
  }
}

const report = { at: new Date().toISOString(), base, checked: seen.size, pages: pages.length, fails };
await mkdir('.agents/health', { recursive: true });
await writeFile('.agents/health/last.json', JSON.stringify(report, null, 2));
for (const p of pages) console.log(`${p.problems.length ? 'FAIL' : 'ok  '} ${p.status} ${p.ms}ms ${p.url}${p.problems.length ? ' — ' + p.problems.join('; ') : ''}`);
for (const f of fails.filter(f => f.kind === 'link')) console.log(`FAIL link ${f.url} (from ${f.from}) — ${f.problems.join('; ')}`);
console.log(`checked ${seen.size} urls, pages ${pages.length}, fails ${fails.length}`);
// exitCode вместо process.exit: на Windows exit при открытых fetch-сокетах роняет Node (UV_HANDLE_CLOSING).
process.exitCode = fails.length ? 1 : 0;
