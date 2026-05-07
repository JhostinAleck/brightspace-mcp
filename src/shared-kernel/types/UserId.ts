import type { Brand } from './Brand.js';

export type UserId = Brand<number, 'UserId'>;

export const UserId = {
  of(n: number): UserId {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid UserId: ${String(n)}`);
    }
    return n as UserId;
  },
  toNumber(id: UserId): number {
    const v = id as unknown;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`UserId runtime invariant violated: expected positive integer, got ${typeof v} ${String(v)}`);
    }
    return v;
  },
};
