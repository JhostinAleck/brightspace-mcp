import type { SecretValue } from './SecretValue.js';

export type CredentialKey = string;

export interface CredentialStore {
  get(key: CredentialKey): Promise<SecretValue | null>;
  set(key: CredentialKey, value: SecretValue): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
}
