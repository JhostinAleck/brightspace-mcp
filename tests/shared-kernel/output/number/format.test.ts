import { describe, expect, it } from 'vitest';
import {
  formatPercent,
  formatPoints,
  formatDecimal,
} from '@/shared-kernel/output/number/format.js';

describe('number/format', () => {
  it('formatPercent en-US with 1 digit', () => {
    expect(formatPercent(85.5, { locale: 'en-US' })).toBe('85.5%');
  });

  it('formatPercent pt-BR uses comma', () => {
    expect(formatPercent(85.5, { locale: 'pt-BR' })).toBe('85,5%');
  });

  it('formatPercent rounds to digits opt', () => {
    expect(formatPercent(85.456, { locale: 'en-US', digits: 2 })).toBe('85.46%');
  });

  it('formatPoints earned/max', () => {
    expect(formatPoints(8, 10, { locale: 'en-US' })).toBe('8/10');
    expect(formatPoints(null, 10, { locale: 'en-US' })).toBe('—/10');
  });

  it('formatDecimal respects locale', () => {
    expect(formatDecimal(1234.5, { locale: 'en-US' })).toBe('1,234.5');
    expect(formatDecimal(1234.5, { locale: 'pt-BR' })).toBe('1.234,5');
  });
});
