import { describe, it, expect } from 'vitest';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { UserId } from '@/shared-kernel/types/UserId';
import { TimeWindow } from '@/shared-kernel/types/TimeWindow';

describe('OrgUnitId', () => {
  it('creates from positive integer', () => {
    const id = OrgUnitId.of(12345);
    expect(OrgUnitId.toNumber(id)).toBe(12345);
  });
  it('throws on non-positive', () => {
    expect(() => OrgUnitId.of(0)).toThrow();
    expect(() => OrgUnitId.of(-1)).toThrow();
  });
  it('throws on non-integer', () => {
    expect(() => OrgUnitId.of(1.5)).toThrow();
  });
});

describe('UserId', () => {
  it('creates from positive integer', () => {
    expect(UserId.toNumber(UserId.of(7))).toBe(7);
  });
});

describe('TimeWindow', () => {
  it('from/to stored as Date', () => {
    const w = TimeWindow.of(new Date('2026-01-01'), new Date('2026-02-01'));
    expect(w.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('throws when from > to', () => {
    expect(() => TimeWindow.of(new Date('2026-02-01'), new Date('2026-01-01'))).toThrow();
  });
});
