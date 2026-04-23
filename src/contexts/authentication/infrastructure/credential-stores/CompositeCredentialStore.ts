import type {
  CredentialStore,
  CredentialKey,
} from '@/contexts/authentication/domain/CredentialStore.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export interface CompositeCredentialStoreOptions {
  env: CredentialStore;
  keychain: CredentialStore;
  file: CredentialStore;
}

export class CompositeCredentialStore implements CredentialStore {
  constructor(private readonly stores: CompositeCredentialStoreOptions) {}

  private pick(key: CredentialKey): CredentialStore {
    if (key.startsWith('env:')) return this.stores.env;
    if (key.startsWith('keychain:')) return this.stores.keychain;
    if (key.startsWith('file:')) return this.stores.file;
    throw new Error(`CompositeCredentialStore: unknown scheme in ref "${key}"`);
  }

  async get(key: CredentialKey): Promise<SecretValue | null> {
    return this.pick(key).get(key);
  }

  async set(key: CredentialKey, value: SecretValue): Promise<void> {
    return this.pick(key).set(key, value);
  }

  async delete(key: CredentialKey): Promise<void> {
    return this.pick(key).delete(key);
  }
}
