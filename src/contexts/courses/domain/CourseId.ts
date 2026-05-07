import type { Brand } from '@/shared-kernel/types/Brand.js';

export type CourseId = Brand<number, 'CourseId'>;

export const CourseId = {
  of(n: number): CourseId {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid CourseId: ${String(n)}`);
    }
    return n as CourseId;
  },
  toNumber(id: CourseId): number {
    const v = id as unknown;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`CourseId runtime invariant violated: expected positive integer, got ${typeof v} ${String(v)}`);
    }
    return v;
  },
};
