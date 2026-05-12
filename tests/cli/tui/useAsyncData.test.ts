import { describe, it, expect, vi } from 'vitest';
import { resolveAsyncData } from '@/cli/commands/tui/shared/useAsyncData.js';

describe('resolveAsyncData', () => {
  it('returns data on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(['course-a']);
    const result = await resolveAsyncData(fetcher);
    expect(result).toEqual({ data: ['course-a'], error: null });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns error string on failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await resolveAsyncData(fetcher);
    expect(result).toEqual({ data: null, error: 'Network error' });
  });

  it('returns generic string for non-Error throws', async () => {
    const fetcher = vi.fn().mockRejectedValue('plain string error');
    const result = await resolveAsyncData(fetcher);
    expect(result.error).toBe('plain string error');
    expect(result.data).toBeNull();
  });
});
