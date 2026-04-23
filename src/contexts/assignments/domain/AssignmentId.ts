import type { Brand } from '@/shared-kernel/types/Brand.js';

export type AssignmentId = Brand<number, 'AssignmentId'>;

export const AssignmentId = {
  of(n: number): AssignmentId {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid AssignmentId: ${n}`);
    return n as AssignmentId;
  },
  toNumber(id: AssignmentId): number {
    return id as unknown as number;
  },
};
