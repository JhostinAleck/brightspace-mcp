import { describe, it, expect } from 'vitest';
import { GradeItem } from '@/contexts/grades/domain/GradeItem.js';

describe('GradeItem', () => {
  it('exposes all props via getters', () => {
    const item = new GradeItem({ id: 1, name: 'Midterm', kind: 'numeric', maxPoints: 100, weight: 0.4 });
    expect(item.id).toBe(1);
    expect(item.name).toBe('Midterm');
    expect(item.kind).toBe('numeric');
    expect(item.maxPoints).toBe(100);
    expect(item.weight).toBe(0.4);
  });

  it('weight is undefined when not provided', () => {
    const item = new GradeItem({ id: 2, name: 'Quiz', kind: 'passfail', maxPoints: 10 });
    expect(item.weight).toBeUndefined();
  });
});
