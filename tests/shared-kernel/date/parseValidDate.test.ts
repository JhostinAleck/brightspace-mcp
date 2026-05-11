import { describe, it, expect } from 'vitest';
import { parseValidDate } from '@/shared-kernel/date/parseValidDate';

describe('parseValidDate', () => {
  it('parses a valid ISO-8601 string', () => {
    const d = parseValidDate('2026-05-11T03:36:38.470Z');
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe('2026-05-11T03:36:38.470Z');
  });

  it('returns null for unparseable string', () => {
    expect(parseValidDate('not-a-date')).toBeNull();
    expect(parseValidDate('2026-13-99')).toBeNull();
  });

  it('returns null for empty / null / undefined', () => {
    expect(parseValidDate('')).toBeNull();
    expect(parseValidDate(null)).toBeNull();
    expect(parseValidDate(undefined)).toBeNull();
  });

  it('result can be safely passed to toISOString without throwing', () => {
    const d = parseValidDate('2026-05-11T03:36:38Z')!;
    expect(() => d.toISOString()).not.toThrow();
  });
});
