import { describe, it, expect } from 'vitest';
import { EnvVarCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EnvVarCredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

describe('EnvVarCredentialStore', () => {
  it('resolves env: refs from provided env', async () => {
    const s = new EnvVarCredentialStore({ MY_TOK: 'abc' });
    const v = await s.get('env:MY_TOK');
    expect(v?.reveal()).toBe('abc');
  });
  it('returns null for missing vars', async () => {
    const s = new EnvVarCredentialStore({});
    expect(await s.get('env:MISSING')).toBeNull();
  });
  it('rejects non-env refs', async () => {
    const s = new EnvVarCredentialStore({});
    await expect(s.get('keychain:x/y')).rejects.toThrow();
  });
  it('set() and delete() throw (read-only)', async () => {
    const s = new EnvVarCredentialStore({});
    await expect(s.set('env:X', new SecretValue('y'))).rejects.toThrow(/read-only/i);
  });
});
