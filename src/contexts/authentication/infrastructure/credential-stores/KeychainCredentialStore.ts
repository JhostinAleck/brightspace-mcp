import type {
  CredentialStore,
  CredentialKey,
} from '@/contexts/authentication/domain/CredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

/**
 * Backend-agnostic OS keychain interface. The constructor accepts a loader
 * that returns any module exposing `getPassword`/`setPassword`/`deletePassword`
 * with the keytar-style flat function signatures, OR an `AsyncEntry` class
 * with the `@napi-rs/keyring` per-(service,account) API.
 *
 * The default loader prefers `@napi-rs/keyring` (actively maintained, modern
 * napi-rs binding) and falls back to `keytar` for backward compatibility.
 * `keytar` itself is unmaintained since 2022 — new installs should use
 * `@napi-rs/keyring`.
 */

export interface KeychainBackendFlat {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

interface NapiAsyncEntryInstance {
  getPassword(): Promise<string | null | undefined>;
  setPassword(password: string): Promise<void>;
  deletePassword?(): Promise<boolean>;
  deleteCredential?(): Promise<boolean>;
}

export interface KeychainBackendNapi {
  AsyncEntry: new (service: string, account: string) => NapiAsyncEntryInstance;
}

export type KeychainBackend = KeychainBackendFlat | KeychainBackendNapi;

export interface KeychainCredentialStoreOptions {
  /**
   * Loader for the underlying keychain module. Accepts either a flat
   * keytar-style module or a napi-rs/keyring-style module.
   *
   * Named `keychainLoader`; the legacy `keytarLoader` alias is honoured for
   * backward compatibility with tests pinned to the previous API.
   */
  keychainLoader?: () => Promise<KeychainBackend>;
  /** @deprecated Use `keychainLoader`. */
  keytarLoader?: () => Promise<KeychainBackend>;
}

const SCHEME_PREFIX = 'keychain:';

function isNapiBackend(mod: KeychainBackend): mod is KeychainBackendNapi {
  return typeof (mod as KeychainBackendNapi).AsyncEntry === 'function';
}

async function defaultLoader(): Promise<KeychainBackend> {
  // We ship @napi-rs/keyring as the supported optional backend. The legacy
  // `keytar` module is no longer pulled in (its `prebuild-install` chain is
  // deprecated and the project is unmaintained since 2022). Users who
  // already have `keytar` installed can still wire it in by passing a
  // custom `keychainLoader` that returns the keytar module.
  const mod = (await import('@napi-rs/keyring')) as unknown as KeychainBackendNapi;
  if (typeof mod.AsyncEntry !== 'function') {
    throw new Error('@napi-rs/keyring did not export an AsyncEntry class');
  }
  return mod;
}

export class KeychainCredentialStore implements CredentialStore {
  private readonly load: () => Promise<KeychainBackend>;

  constructor(opts: KeychainCredentialStoreOptions = {}) {
    this.load = opts.keychainLoader ?? opts.keytarLoader ?? defaultLoader;
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

  private async backend(): Promise<KeychainBackend> {
    try {
      return await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Keychain backend not available (${message}). Install "@napi-rs/keyring" (recommended) or the legacy "keytar" optional dependency, or switch to encrypted_file credential store.`,
        { cause: err },
      );
    }
  }

  async get(key: CredentialKey): Promise<SecretValue | null> {
    const { service, account } = this.parseRef(key);
    const mod = await this.backend();
    let value: string | null | undefined;
    if (isNapiBackend(mod)) {
      const entry = new mod.AsyncEntry(service, account);
      value = await entry.getPassword();
    } else {
      value = await mod.getPassword(service, account);
    }
    return value === null || value === undefined ? null : new SecretValue(value);
  }

  async set(key: CredentialKey, value: SecretValue): Promise<void> {
    const { service, account } = this.parseRef(key);
    const mod = await this.backend();
    if (isNapiBackend(mod)) {
      const entry = new mod.AsyncEntry(service, account);
      await entry.setPassword(value.reveal());
      return;
    }
    await mod.setPassword(service, account, value.reveal());
  }

  async delete(key: CredentialKey): Promise<void> {
    const { service, account } = this.parseRef(key);
    const mod = await this.backend();
    if (isNapiBackend(mod)) {
      const entry = new mod.AsyncEntry(service, account);
      // napi-rs/keyring exposes `deletePassword` (or `deleteCredential` on
      // older versions). Probe both so cross-version installs work.
      if (typeof entry.deletePassword === 'function') {
        await entry.deletePassword();
      } else if (typeof entry.deleteCredential === 'function') {
        await entry.deleteCredential();
      } else {
        throw new Error('napi-rs/keyring entry has no delete method');
      }
      return;
    }
    await mod.deletePassword(service, account);
  }
}
