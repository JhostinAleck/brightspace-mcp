import { describe, it, expect } from 'vitest';
import { KeychainCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/KeychainCredentialStore';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue';

function makeFakeKeytar() {
  const store = new Map<string, string>();
  const key = (service: string, account: string) => `${service}::${account}`;
  return {
    module: {
      async getPassword(service: string, account: string) {
        return store.get(key(service, account)) ?? null;
      },
      async setPassword(service: string, account: string, value: string) {
        store.set(key(service, account), value);
      },
      async deletePassword(service: string, account: string) {
        return store.delete(key(service, account));
      },
    },
    internal: store,
  };
}

describe('KeychainCredentialStore', () => {
  it('parses keychain:<service>/<account> refs and round-trips a secret', async () => {
    const { module: fake } = makeFakeKeytar();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    await store.set('keychain:my-app/my-key', new SecretValue('shh'));
    const got = await store.get('keychain:my-app/my-key');
    expect(got?.reveal()).toBe('shh');
  });

  it('returns null for missing entry', async () => {
    const { module: fake } = makeFakeKeytar();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    expect(await store.get('keychain:my-app/nope')).toBeNull();
  });

  it('delete removes the entry', async () => {
    const { module: fake } = makeFakeKeytar();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    await store.set('keychain:my-app/k', new SecretValue('v'));
    await store.delete('keychain:my-app/k');
    expect(await store.get('keychain:my-app/k')).toBeNull();
  });

  it('rejects non-keychain: refs', async () => {
    const { module: fake } = makeFakeKeytar();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    await expect(store.get('file:x')).rejects.toThrow(/keychain:/);
  });

  it('rejects malformed keychain refs (missing slash)', async () => {
    const { module: fake } = makeFakeKeytar();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    await expect(store.get('keychain:missing-slash')).rejects.toThrow(/service|account|slash/i);
  });

  it('surfaces a clear error if keytar cannot be loaded', async () => {
    const store = new KeychainCredentialStore({
      keytarLoader: async () => { throw new Error('not installed'); },
    });
    await expect(store.get('keychain:a/b')).rejects.toThrow(/keytar/i);
  });
});
