// ESLint with a frozen baseline: every finding (error or warning) that is
// not already listed in eslint-baseline.json fails the run. Existing
// findings are allowed per file + rule up to their recorded count, so they
// can only go down. `--update` rewrites the baseline from the current state
// (use it only after removing findings, never to admit new ones).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'eslint-baseline.json');
const TARGETS = ['app', 'components', 'lib', 'middleware.ts'];

// results: ESLint LintResult[] -> { "relative/file.tsx": { "rule-id": count } }
export function countFindings(results, root = ROOT) {
  const counts = {};
  for (const result of results) {
    if (result.messages.length === 0) continue;
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    for (const message of result.messages) {
      const rule = message.ruleId ?? 'parse-error';
      counts[file] ??= {};
      counts[file][rule] = (counts[file][rule] ?? 0) + 1;
    }
  }
  return counts;
}

// Returns findings above baseline (new) and baseline entries that shrank.
export function compareToBaseline(current, baseline) {
  const added = [];
  const reduced = [];
  for (const [file, rules] of Object.entries(current)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      if (count > allowed) added.push({ file, rule, count, allowed });
    }
  }
  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const count = current[file]?.[rule] ?? 0;
      if (count < allowed) reduced.push({ file, rule, count, allowed });
    }
  }
  return { added, reduced };
}

async function main() {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: ROOT, extensions: ['.js', '.jsx', '.ts', '.tsx'] });
  const results = await eslint.lintFiles(TARGETS);
  const current = countFindings(results);

  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
    console.log('eslint-baseline.json updated.');
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { added, reduced } = compareToBaseline(current, baseline);

  for (const r of reduced) {
    console.log(`baseline can shrink: ${r.file} ${r.rule} ${r.allowed} -> ${r.count} (run: npm run lint -- --update)`);
  }
  if (added.length > 0) {
    const formatter = await eslint.loadFormatter('stylish');
    const newFiles = new Set(added.map((a) => a.file));
    console.log(
      await formatter.format(
        results.filter((r) => newFiles.has(path.relative(ROOT, r.filePath).split(path.sep).join('/')))
      )
    );
    for (const a of added) {
      console.error(`NEW lint finding: ${a.file} ${a.rule} (${a.count}, baseline allows ${a.allowed})`);
    }
    process.exit(1);
  }
  const total = Object.values(current).reduce((s, rules) => s + Object.values(rules).reduce((a, b) => a + b, 0), 0);
  console.log(`lint ok: no new findings (${total} frozen in eslint-baseline.json).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
