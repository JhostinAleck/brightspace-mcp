import type { Brand } from './Brand.js';

export type OrgUnitId = Brand<number, 'OrgUnitId'>;

export const OrgUnitId = {
  of(n: number): OrgUnitId {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid OrgUnitId: ${n}`);
    return n as OrgUnitId;
  },
  toNumber(id: OrgUnitId): number {
    return id as unknown as number;
  },
};
