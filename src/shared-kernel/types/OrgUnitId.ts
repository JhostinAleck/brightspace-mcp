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

/**
 * Construct an OrgUnitId from a raw string identifier (e.g. when supplied as
 * user input on a write path). Accepts numeric strings ("101") and opaque
 * tokens ("c1") that are forwarded verbatim to downstream systems. Calls
 * `.toString()` on the resulting value yield the original raw string.
 *
 * Validates the input is a non-empty trimmed string.
 */
export function createOrgUnitId(raw: string): OrgUnitId {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`Invalid OrgUnitId: ${raw}`);
  }
  return raw as unknown as OrgUnitId;
}
