import { describe, expect, it, vi } from 'vitest';

import { runCacheClear } from '@/cli/commands/cache.js';

describe('runCacheClear', () => {
  it('clears without throwing when no config file exists (uses in-memory only)', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(
      runCacheClear({ config: '/nonexistent/path.yaml', profile: 'default' }),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
