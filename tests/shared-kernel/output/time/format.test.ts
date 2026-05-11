import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '@/shared-kernel/output/time/format.js';

const REF = new Date(Date.UTC(2026, 4, 12, 18, 0, 0)); // 12 May 2026 18:00 UTC

describe('time/format', () => {
  it('formats date in America/Bogota (UTC-5) in es-419', () => {
    expect(formatDate(REF, { tz: 'America/Bogota', locale: 'es-419', style: 'short' })).toMatch(
      /12.*may.*2026/i,
    );
  });

  it('formats datetime in America/Bogota', () => {
    const out = formatDateTime(REF, { tz: 'America/Bogota', locale: 'es-419' });
    expect(out).toMatch(/13:00|1:00\s?p/i);
  });

  it('formats time in en-US', () => {
    const out = formatTime(REF, { tz: 'America/New_York', locale: 'en-US' });
    expect(out).toMatch(/2:00\s?p/i);
  });

  it('returns em-dash for null', () => {
    expect(formatDate(null, { tz: 'UTC', locale: 'en-US' })).toBe('—');
  });
});
