import { describe, it, expect } from 'vitest';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';

describe('AssignmentId', () => {
  it('accepts positive integers', () => {
    expect(AssignmentId.toNumber(AssignmentId.of(42))).toBe(42);
  });
  it('rejects non-positive', () => {
    expect(() => AssignmentId.of(0)).toThrow();
  });
  it('rejects non-integer', () => {
    expect(() => AssignmentId.of(1.5)).toThrow();
  });
});
