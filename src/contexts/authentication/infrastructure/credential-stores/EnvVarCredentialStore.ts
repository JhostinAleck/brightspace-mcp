import type { CredentialStore, CredentialKey } from '@/contexts/authentication/domain/CredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export class EnvVarCredentialStore implements CredentialStore {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  async get(key: CredentialKey): Promise<SecretValue | null> {
    if (!key.startsWith('env:')) {
      throw new Error(`EnvVarCredentialStore only handles env: refs, got "${key}"`);
    }
    const v = this.env[key.slice(4)];
    return v ? new SecretValue(v) : null;
  }

  async set(_key: CredentialKey, _value: SecretValue): Promise<void> {
    throw new Error('EnvVarCredentialStore is read-only');
  }

  async delete(_key: CredentialKey): Promise<void> {
    throw new Error('EnvVarCredentialStore is read-only');
  }
}
