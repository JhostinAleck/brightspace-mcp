import type {
  CredentialStore,
  CredentialKey,
} from '@/contexts/authentication/domain/CredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface KeychainCredentialStoreOptions {
  keytarLoader?: () => Promise<KeytarModule>;
}

const SCHEME_PREFIX = 'keychain:';

export class KeychainCredentialStore implements CredentialStore {
  private readonly load: () => Promise<KeytarModule>;

  constructor(opts: KeychainCredentialStoreOptions = {}) {
    this.load = opts.keytarLoader ?? (async () => {
      const mod = (await import('keytar')) as unknown as { default?: KeytarModule } & KeytarModule;
      return mod.default ?? mod;
    });
  }

  private parseRef(key: CredentialKey): { service: string; account: string } {
    if (!key.startsWith(SCHEME_PREFIX)) {
      throw new Error(`KeychainCredentialStore only handles keychain: refs, got "${key}"`);
    }
    const rest = key.slice(SCHEME_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash <= 0 || slash === rest.length - 1) {
      throw new Error(`Invalid keychain ref "${key}": expected keychain:<service>/<account>`);
    }
    return { service: rest.slice(0, slash), account: rest.slice(slash + 1) };
  }

  private async keytar(): Promise<KeytarModule> {
    try {
      return await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `keytar is not available (${message}). Install the optional "keytar" dependency or switch to encrypted_file credential store.`,
      );
    }
  }

  async get(key: CredentialKey): Promise<SecretValue | null> {
    const { service, account } = this.parseRef(key);
    const k = await this.keytar();
    const value = await k.getPassword(service, account);
    return value === null ? null : new SecretValue(value);
  }

  async set(key: CredentialKey, value: SecretValue): Promise<void> {
    const { service, account } = this.parseRef(key);
    const k = await this.keytar();
    await k.setPassword(service, account, value.reveal());
  }

  async delete(key: CredentialKey): Promise<void> {
    const { service, account } = this.parseRef(key);
    const k = await this.keytar();
    await k.deletePassword(service, account);
  }
}
