#!/usr/bin/env node
// Маскирует секреты, email и телефоны в логах сервера до вывода в GitHub Actions: GitHub прячет только
// свои secrets, а серверные (.env.local, ключи Supabase) в логе сборки и journalctl он не знает;
// персональные данные посетителей не должны покидать Россию (CLAUDE.md, «Данные только в России»).
// Одна функция на все workflow (deploy, server-ops). Строки не удаляются — маскируются значения,
// поэтому отфильтрованный лог не превращается в пустой вывод и exit 1.
// Использование: <команда> | node scripts/ops/redact.mjs
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const NAMES = 'pass(?:word|wd)?|secret|token|api[_-]?key|apikey|key|authorization|cookie|dsn';
// Типы unit-файлов, которые не являются доменами верхнего уровня (.target — бренд-домен, его не исключаем);
// только с буквальным `@`: url-кодированный %40 бывает лишь в адресах из запросов.
const SYSTEMD_UNIT = /^[^%]*@[^%]*\.(?:service|socket|device|mount|automount|swap|path|timer|slice|scope)$/i;
const SEP = String.raw`(?:[\s.()+-]|%20|%28|%29|%2B)*`;
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
  // Персональные данные: логи уходят в GitHub (США), а данные посетителей — только в России.
  // email, в том числе кириллический и url-кодированный (fake%40mail.ru в query string)
  // (кроме systemd-юнитов вида getty@tty1.service — в выводе df и journalctl они не персональные данные)
  [/[\p{L}\p{N}._%+-]+(?:@|%40)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/giu,
    (m) => (SYSTEMD_UNIT.test(m) ? m : '***@***')],
  // телефон РФ: +7 / 8 / 7 и 10 цифр; между группами пробелы, скобки, дефисы, точки, `+` и их
  // url-коды (%2B79…, +7+912+…, 8%20912…); не часть более длинного числа или хеша
  [new RegExp(String.raw`(?<![\p{L}\p{N}_+%])(?:(?:\+|%2B)7|8|7)${SEP}\d{3}${SEP}\d{3}${SEP}\d{2}${SEP}\d{2}(?![\p{L}\p{N}_])`, 'giu'),
    '+7***'],
];

export function redact(line) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), line);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) process.stdout.write(redact(line) + '\n');
}
