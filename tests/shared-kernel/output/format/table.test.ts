import { describe, expect, it } from 'vitest';
import { table } from '@/shared-kernel/output/format/table.js';

describe('table', () => {
  it('renders headers + rows', () => {
    expect(table(['A', 'B'], [['1', '2'], ['3', '4']])).toBe(
      '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |',
    );
  });

  it('escapes pipes in cells', () => {
    expect(table(['A'], [['x|y']])).toBe('| A |\n|---|\n| x\\|y |');
  });

  it('returns empty string for no rows and no headers', () => {
    expect(table([], [])).toBe('');
  });

  it('returns just header when rows are empty', () => {
    expect(table(['A'], [])).toBe('| A |\n|---|');
  });
});
