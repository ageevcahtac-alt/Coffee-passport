#!/usr/bin/env node
// Маскирует секреты в логах сервера до вывода в GitHub Actions: GitHub прячет только свои secrets,
// а серверные (.env.local, ключи Supabase) в логе сборки и journalctl он не знает.
// Одна функция на все workflow (deploy, server-ops). Строки не удаляются — маскируются значения,
// поэтому отфильтрованный лог не превращается в пустой вывод и exit 1.
// Использование: <команда> | node scripts/ops/redact.mjs
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const NAMES = 'pass(?:word|wd)?|secret|token|api[_-]?key|apikey|key|authorization|cookie|dsn';
const RULES = [
  // JWT (ключи Supabase anon/service_role, сессии)
  [/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, '***jwt***'],
  // логин:пароль в URL
  [/(\w+:\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***:***@'],
  // Bearer / Basic
  [/\b(bearer|basic)\s+[\w.~+/=-]{8,}/gi, '$1 ***'],
  // "name": "value" — до закрывающей кавычки (внутри бывают пробелы, запятые, \")
  [new RegExp(String.raw`((?:[\w-]*(?:${NAMES}))["']?\s*[:=]\s*)(["'])(?:\\.|(?!\2).)*\2`, 'gi'), '$1$2***$2'],
  // name=value, name: value без кавычек (SUPABASE_SERVICE_ROLE_KEY=…, Cookie: a=1; b=2) — до конца
  // строки или `&` (query string): в значении бывают пробелы и `;`, лишнее скрыть лучше, чем недоскрыть
  [new RegExp(String.raw`((?:[\w-]*(?:${NAMES}))["']?\s*[:=]\s*)(?!["'\s])[^&\n]+`, 'gi'), '$1***'],
];

export function redact(line) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), line);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) process.stdout.write(redact(line) + '\n');
}
