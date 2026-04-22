import type { Brand } from './Brand.js';

export type UserId = Brand<number, 'UserId'>;

export const UserId = {
  of(n: number): UserId {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid UserId: ${n}`);
    return n as UserId;
  },
  toNumber(id: UserId): number {
    return id as unknown as number;
  },
};
