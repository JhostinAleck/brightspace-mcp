import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '@/cli/commands/upgrade.js';

describe('version comparison (reused helper)', () => {
  it('1.0.1 is newer than 1.0.0', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
  });

  it('same version is not newer', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('checkForUpdate export', async () => {
  const mod = await import('@/cli/commands/serve.js');
  it('exports checkForUpdate function', () => {
    expect(typeof mod.checkForUpdate).toBe('function');
  });
});
