import { describe, expect, it } from 'vitest';
import { formatRelative } from '@/shared-kernel/output/time/relative.js';

const NOW = new Date('2026-05-11T12:00:00Z');

describe('time/relative', () => {
  it('in 3 days (en)', () => {
    const target = new Date('2026-05-14T12:00:00Z');
    expect(formatRelative(target, { locale: 'en-US', now: NOW })).toMatch(/in 3 days/i);
  });

  it('in 3 days (es)', () => {
    const target = new Date('2026-05-14T12:00:00Z');
    expect(formatRelative(target, { locale: 'es-419', now: NOW })).toMatch(/dentro de 3 d/i);
  });

  it('past tense', () => {
    const target = new Date('2026-05-08T12:00:00Z');
    expect(formatRelative(target, { locale: 'en-US', now: NOW })).toMatch(/3 days ago/i);
  });

  it('null returns em-dash', () => {
    expect(formatRelative(null, { locale: 'en-US', now: NOW })).toBe('—');
  });
});
