import { describe, expect, it } from 'vitest';

import { loadTuiRuntime } from '@/cli/commands/tui';

describe('loadTuiRuntime', () => {
  it('loads ink and react when installed', async () => {
    const rt = await loadTuiRuntime();
    expect(typeof rt.render).toBe('function');
    expect(typeof rt.React.createElement).toBe('function');
  });

  it('explains how to fix a missing optional dependency', async () => {
    const missing = async () => {
      throw Object.assign(new Error("Cannot find package 'ink'"), { code: 'ERR_MODULE_NOT_FOUND' });
    };
    await expect(loadTuiRuntime(missing)).rejects.toThrow(/optional packages "ink" and "react"/);
  });

  it('rethrows unrelated load errors', async () => {
    await expect(loadTuiRuntime(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});
