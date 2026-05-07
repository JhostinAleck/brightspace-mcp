import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { sep } from 'node:path';

import { Paths } from '@/shared-kernel/config/paths.js';

describe('Paths', () => {
  it('rootDir is anchored under the user homedir', () => {
    const root = Paths.rootDir();
    expect(root.startsWith(homedir())).toBe(true);
    expect(root.endsWith(`${sep}.brightspace-mcp`)).toBe(true);
  });

  it('all artefact paths live under rootDir', () => {
    const root = Paths.rootDir();
    expect(Paths.configYaml().startsWith(root)).toBe(true);
    expect(Paths.credentialsEnc().startsWith(root)).toBe(true);
    expect(Paths.sessionsJson().startsWith(root)).toBe(true);
    expect(Paths.domainCacheJson().startsWith(root)).toBe(true);
    expect(Paths.idempotencyJson().startsWith(root)).toBe(true);
  });

  it('artefact paths use stable filenames the rest of the codebase relies on', () => {
    expect(Paths.configYaml()).toMatch(/config\.yaml$/);
    expect(Paths.credentialsEnc()).toMatch(/credentials\.enc$/);
    expect(Paths.sessionsJson()).toMatch(/sessions\.json$/);
    expect(Paths.domainCacheJson()).toMatch(/domain-cache\.json$/);
    expect(Paths.idempotencyJson()).toMatch(/idempotency\.json$/);
  });
});
