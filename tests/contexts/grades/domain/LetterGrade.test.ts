import { describe, it, expect } from 'vitest';
import { LetterGrade } from '@/contexts/grades/domain/LetterGrade';

describe('LetterGrade', () => {
  it('classifies 95 as A', () => {
    expect(LetterGrade.fromPercent(95).letter).toBe('A');
  });
  it('classifies 85 as B', () => {
    expect(LetterGrade.fromPercent(85).letter).toBe('B');
  });
  it('classifies 75 as C', () => {
    expect(LetterGrade.fromPercent(75).letter).toBe('C');
  });
  it('classifies 65 as D', () => {
    expect(LetterGrade.fromPercent(65).letter).toBe('D');
  });
  it('classifies 50 as F', () => {
    expect(LetterGrade.fromPercent(50).letter).toBe('F');
  });
  it('isPassing() is true for A-D, false for F', () => {
    expect(LetterGrade.fromPercent(95).isPassing).toBe(true);
    expect(LetterGrade.fromPercent(65).isPassing).toBe(true);
    expect(LetterGrade.fromPercent(50).isPassing).toBe(false);
  });
  it('throws on negative percent', () => {
    expect(() => LetterGrade.fromPercent(-1)).toThrow();
  });
  it('clamps percent > 100 to A (bonus points)', () => {
    expect(LetterGrade.fromPercent(102).letter).toBe('A');
    expect(LetterGrade.fromPercent(102).percent).toBe(102);
  });
});
