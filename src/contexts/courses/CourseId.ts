import type { Brand } from '@/shared-kernel/types/Brand.js';

export type CourseId = Brand<number, 'CourseId'>;

export const CourseId = {
  of(n: number): CourseId {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid CourseId: ${n}`);
    return n as CourseId;
  },
  toNumber(id: CourseId): number {
    return id as unknown as number;
  },
};
