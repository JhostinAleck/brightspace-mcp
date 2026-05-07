import type { Brand } from './Brand.js';

export type OrgUnitId = Brand<number, 'OrgUnitId'>;

export const OrgUnitId = {
  of(n: number): OrgUnitId {
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid OrgUnitId: ${String(n)}`);
    }
    return n as OrgUnitId;
  },
  toNumber(id: OrgUnitId): number {
    const v = id as unknown;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`OrgUnitId runtime invariant violated: expected positive integer, got ${typeof v} ${String(v)}`);
    }
    return v;
  },
};

/**
 * Construct an OrgUnitId from a raw string identifier (e.g. when supplied as
 * user input on a write path). The input must be a positive-integer string —
 * anything else (empty, decimal, opaque token, leading zeros) throws.
 *
 * The OrgUnitId domain type is `Brand<number>`. Returning a string here would
 * silently break `OrgUnitId.toNumber()`, JSON serialization, and equality
 * comparisons. We parse-or-throw so the contract holds at runtime.
 */
export function createOrgUnitId(raw: string): OrgUnitId {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid OrgUnitId: ${String(raw)}`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(`Invalid OrgUnitId: ${raw}`);
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`Invalid OrgUnitId: ${raw}`);
  }
  return n as OrgUnitId;
}
