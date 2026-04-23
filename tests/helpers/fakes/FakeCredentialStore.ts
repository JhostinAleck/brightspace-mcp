import type {
  CredentialStore,
  CredentialKey,
} from '@/contexts/authentication/domain/CredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export class FakeCredentialStore implements CredentialStore {
  constructor(private readonly values: Record<string, string> = {}) {}

  async get(key: CredentialKey): Promise<SecretValue | null> {
    const v = this.values[key];
    return v === undefined ? null : new SecretValue(v);
  }

  async set(key: CredentialKey, value: SecretValue): Promise<void> {
    this.values[key] = value.reveal();
  }

  async delete(key: CredentialKey): Promise<void> {
    delete this.values[key];
  }

  snapshot(): Record<string, string> {
    return { ...this.values };
  }
}
