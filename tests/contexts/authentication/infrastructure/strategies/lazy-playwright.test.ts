import { describe, it, expect } from 'vitest';
import { createPlaywrightLoader } from '@/contexts/authentication/infrastructure/strategies/lazy-playwright';

describe('createPlaywrightLoader', () => {
  it('resolves the fake module when provided via injection', async () => {
    const fake = { chromium: { launch: async () => ({ fake: true }) } };
    const loader = createPlaywrightLoader(async () => fake as never);
    const mod = await loader();
    expect(mod).toBe(fake);
  });

  it('surfaces a helpful error when module cannot be loaded', async () => {
    const loader = createPlaywrightLoader(async () => { throw new Error('nope'); });
    await expect(loader()).rejects.toThrow(/playwright/i);
  });
});
