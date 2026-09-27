import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTotpUsedCounterStore } from '@/contexts/authentication/infrastructure/mfa/FileTotpUsedCounterStore.js';

describe('FileTotpUsedCounterStore', () => {
  it('round-trips the last counter and shares it across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'totp-'));
    try {
      const path = join(dir, 'nested', 'totp-state.json');
      expect(await new FileTotpUsedCounterStore(path).last()).toBeNull();
      await new FileTotpUsedCounterStore(path).markUsed(12345);
      expect(await new FileTotpUsedCounterStore(path).last()).toBe(12345);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a corrupt file as no record', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'totp-'));
    try {
      const path = join(dir, 'totp-state.json');
      writeFileSync(path, 'not json');
      expect(await new FileTotpUsedCounterStore(path).last()).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
