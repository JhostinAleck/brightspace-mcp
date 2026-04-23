import { describe, it, expect } from 'vitest';
import { DueDate } from '@/contexts/assignments/domain/DueDate';

describe('DueDate', () => {
  it('isBefore returns true when this date is earlier', () => {
    const a = DueDate.at(new Date('2026-01-01'));
    const b = DueDate.at(new Date('2026-02-01'));
    expect(a.isBefore(b)).toBe(true);
    expect(b.isBefore(a)).toBe(false);
  });

  it('isWithin returns true only when in window', () => {
    const mid = DueDate.at(new Date('2026-02-15'));
    expect(mid.isWithin(new Date('2026-02-01'), new Date('2026-03-01'))).toBe(true);
    expect(mid.isWithin(new Date('2026-03-01'), new Date('2026-04-01'))).toBe(false);
  });

  it('isPast compared to a reference instant', () => {
    const past = DueDate.at(new Date('2025-01-01'));
    const ref = new Date('2026-01-01');
    expect(past.isPastAt(ref)).toBe(true);
  });

  it('null wraps a null Date gracefully', () => {
    const nd = DueDate.unspecified();
    expect(nd.toDate()).toBeNull();
    expect(nd.isWithin(new Date(), new Date())).toBe(false);
  });
});
