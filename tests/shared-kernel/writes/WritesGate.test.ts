import { describe, expect, it } from 'vitest';

import { WritesGate } from '@/shared-kernel/writes/WritesGate.js';

describe('WritesGate', () => {
  it('is closed when config false and flag false', () => {
    const gate = new WritesGate({ configEnabled: false, cliFlag: false });
    expect(gate.allowsWrites).toBe(false);
  });

  it('is closed when config true but flag false', () => {
    const gate = new WritesGate({ configEnabled: true, cliFlag: false });
    expect(gate.allowsWrites).toBe(false);
  });

  it('is closed when config false but flag true', () => {
    const gate = new WritesGate({ configEnabled: false, cliFlag: true });
    expect(gate.allowsWrites).toBe(false);
  });

  it('is open only when both config and flag are true', () => {
    const gate = new WritesGate({ configEnabled: true, cliFlag: true });
    expect(gate.allowsWrites).toBe(true);
  });

  it('reports dryRun flag independently', () => {
    const gate = new WritesGate({ configEnabled: true, cliFlag: true, configDryRun: true });
    expect(gate.allowsWrites).toBe(true);
    expect(gate.isDryRun).toBe(true);
  });
});
