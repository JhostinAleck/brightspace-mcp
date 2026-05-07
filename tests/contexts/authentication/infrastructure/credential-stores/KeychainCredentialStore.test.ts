import { describe, it, expect } from 'vitest';
import { KeychainCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/KeychainCredentialStore';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue';

/**
 * Two backends are supported: legacy keytar (flat function module) and the
 * modern @napi-rs/keyring (AsyncEntry class). The store probes the shape of
 * the loaded module and dispatches accordingly. Both shapes get equal test
 * coverage so a future migration cannot regress the API silently.
 */

function makeFakeFlatBackend() {
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

function makeFakeNapiBackend() {
  const store = new Map<string, string>();
  const key = (service: string, account: string) => `${service}::${account}`;
  class AsyncEntry {
    constructor(private readonly service: string, private readonly account: string) {}
    async getPassword(): Promise<string | null | undefined> {
      return store.get(key(this.service, this.account)) ?? undefined;
    }
    async setPassword(password: string): Promise<void> {
      store.set(key(this.service, this.account), password);
    }
    async deletePassword(): Promise<boolean> {
      return store.delete(key(this.service, this.account));
    }
  }
  return { module: { AsyncEntry }, internal: store };
}

describe('KeychainCredentialStore (flat keytar-style backend)', () => {
  it('parses keychain:<service>/<account> refs and round-trips a secret', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await store.set('keychain:my-app/my-key', new SecretValue('shh'));
    const got = await store.get('keychain:my-app/my-key');
    expect(got?.reveal()).toBe('shh');
  });

  it('returns null for missing entry', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    expect(await store.get('keychain:my-app/nope')).toBeNull();
  });

  it('delete removes the entry', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await store.set('keychain:my-app/k', new SecretValue('v'));
    await store.delete('keychain:my-app/k');
    expect(await store.get('keychain:my-app/k')).toBeNull();
  });

  it('rejects non-keychain: refs', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await expect(store.get('file:x')).rejects.toThrow(/keychain:/);
  });

  it('rejects malformed keychain refs (missing slash)', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await expect(store.get('keychain:missing-slash')).rejects.toThrow(/service|account|slash/i);
  });

  it('honours the deprecated keytarLoader alias', async () => {
    const { module: fake } = makeFakeFlatBackend();
    const store = new KeychainCredentialStore({ keytarLoader: async () => fake });
    await store.set('keychain:legacy/k', new SecretValue('ok'));
    expect((await store.get('keychain:legacy/k'))?.reveal()).toBe('ok');
  });

  it('surfaces a clear error if the backend cannot be loaded', async () => {
    const store = new KeychainCredentialStore({
      keychainLoader: async () => { throw new Error('not installed'); },
    });
    await expect(store.get('keychain:a/b')).rejects.toThrow(/Keychain backend/i);
  });
});

describe('KeychainCredentialStore (napi-rs/keyring backend)', () => {
  it('round-trips a secret via AsyncEntry', async () => {
    const { module: fake } = makeFakeNapiBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await store.set('keychain:my-app/my-key', new SecretValue('shh'));
    const got = await store.get('keychain:my-app/my-key');
    expect(got?.reveal()).toBe('shh');
  });

  it('treats undefined return from getPassword as null', async () => {
    const { module: fake } = makeFakeNapiBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    expect(await store.get('keychain:my-app/missing')).toBeNull();
  });

  it('delete removes the entry via AsyncEntry.deletePassword', async () => {
    const { module: fake } = makeFakeNapiBackend();
    const store = new KeychainCredentialStore({ keychainLoader: async () => fake });
    await store.set('keychain:my-app/k', new SecretValue('v'));
    await store.delete('keychain:my-app/k');
    expect(await store.get('keychain:my-app/k')).toBeNull();
  });

  it('falls back to deleteCredential when deletePassword is not present', async () => {
    const store = new Map<string, string>();
    class AsyncEntry {
      constructor(private readonly service: string, private readonly account: string) {}
      private k(): string { return `${this.service}::${this.account}`; }
      async getPassword(): Promise<string | null> { return store.get(this.k()) ?? null; }
      async setPassword(p: string): Promise<void> { store.set(this.k(), p); }
      async deleteCredential(): Promise<boolean> { return store.delete(this.k()); }
    }
    const credStore = new KeychainCredentialStore({
      keychainLoader: async () => ({ AsyncEntry }),
    });
    await credStore.set('keychain:legacy-napi/k', new SecretValue('x'));
    await credStore.delete('keychain:legacy-napi/k');
    expect(await credStore.get('keychain:legacy-napi/k')).toBeNull();
  });
});
