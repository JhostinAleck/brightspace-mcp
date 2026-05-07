import { afterEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

const BASE = 'https://x.com';

afterEach(() => nock.cleanAll());

describe('D2lContentRepository.findModules — depth guard', () => {
  it('stops descending past the configured depth limit', async () => {
    // Build a pathological tree where every module contains another module
    // of the same shape. The fix caps at depth=12.
    nock(BASE)
      .get('/d2l/api/le/1.91/100/content/root/')
      .reply(200, [{ Id: 1, Title: 'M1' }])
      .get(/\/d2l\/api\/le\/1\.91\/100\/content\/modules\/\d+\/structure\//)
      .times(13) // depths 0..12
      .reply(200, function (uri) {
        const m = /\/modules\/(\d+)\//.exec(uri);
        const id = m ? Number(m[1]) : 1;
        // Each module returns one nested module so the tree is unbounded
        // unless the depth cap kicks in.
        return [{ Id: id + 1, Title: `M${id + 1}`, Type: 0 }];
      });

    const client = new D2lApiClient({
      baseUrl: BASE,
      getToken: async () => AccessToken.bearer('t'),
    });
    const repo = new D2lContentRepository(client, { le: '1.91' });
    const modules = await repo.findModules(OrgUnitId.of(100));

    expect(modules).toHaveLength(1);

    // Walk the chain and count actual depth — the cap should have stopped
    // recursion before it became infinite.
    let m = modules[0];
    let depth = 0;
    while (m && m.submodules.length > 0) {
      m = m.submodules[0];
      depth++;
      if (depth > 50) break; // safety net for the test itself
    }
    expect(depth).toBeLessThanOrEqual(13);
  });
});
