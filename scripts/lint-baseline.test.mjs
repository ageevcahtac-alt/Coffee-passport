import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareToBaseline, countFindings } from './lint-baseline.mjs';

const root = path.resolve('/repo');
const result = (file, ...rules) => ({
  filePath: path.join(root, file),
  messages: rules.map((ruleId) => ({ ruleId })),
});

describe('countFindings', () => {
  it('groups findings per file and rule with posix paths', () => {
    const counts = countFindings(
      [result('app/a.tsx', 'r1', 'r1', 'r2'), result('lib/b.ts'), result('lib/c.ts', null)],
      root
    );
    expect(counts).toEqual({ 'app/a.tsx': { r1: 2, r2: 1 }, 'lib/c.ts': { 'parse-error': 1 } });
  });
});

describe('compareToBaseline', () => {
  const baseline = { 'app/a.tsx': { r1: 2 } };

  it('passes when findings match the baseline', () => {
    expect(compareToBaseline({ 'app/a.tsx': { r1: 2 } }, baseline)).toEqual({ added: [], reduced: [] });
  });

  it('flags a new rule in a frozen file, not only new files', () => {
    const { added } = compareToBaseline({ 'app/a.tsx': { r1: 2, r9: 1 } }, baseline);
    expect(added).toEqual([{ file: 'app/a.tsx', rule: 'r9', count: 1, allowed: 0 }]);
  });

  it('flags a frozen rule whose count grew', () => {
    const { added } = compareToBaseline({ 'app/a.tsx': { r1: 3 } }, baseline);
    expect(added).toEqual([{ file: 'app/a.tsx', rule: 'r1', count: 3, allowed: 2 }]);
  });

  it('flags findings in a file absent from the baseline', () => {
    const { added } = compareToBaseline({ 'lib/new.ts': { r1: 1 } }, baseline);
    expect(added).toEqual([{ file: 'lib/new.ts', rule: 'r1', count: 1, allowed: 0 }]);
  });

  it('reports fixed findings so the baseline can shrink', () => {
    const { added, reduced } = compareToBaseline({}, baseline);
    expect(added).toEqual([]);
    expect(reduced).toEqual([{ file: 'app/a.tsx', rule: 'r1', count: 0, allowed: 2 }]);
  });
});
