import type { Brand } from '@/shared-kernel/types/Brand.js';

export type AssignmentId = Brand<number, 'AssignmentId'>;

export const AssignmentId = {
  of(n: number): AssignmentId {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid AssignmentId: ${String(n)}`);
    }
    return n as AssignmentId;
  },
  toNumber(id: AssignmentId): number {
    const v = id as unknown;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`AssignmentId runtime invariant violated: expected positive integer, got ${typeof v} ${String(v)}`);
    }
    return v;
  },
};
