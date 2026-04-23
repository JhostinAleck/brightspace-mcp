import { readFile, writeFile, chmod, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { dirname } from 'node:path';
import type {
  CredentialStore,
  CredentialKey,
} from '@/contexts/authentication/domain/CredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

interface EncryptedFile {
  version: 1;
  salt: string;
  entries: Record<string, { iv: string; authTag: string; ciphertext: string }>;
}

export interface EncryptedFileCredentialStoreOptions {
  path: string;
  passphrase: SecretValue;
}

const SCHEME_PREFIX = 'file:';

// Pinned scrypt params — part of the v1 on-disk format contract. If these
// change, bump EncryptedFile.version. OWASP 2024 "interactive" tier: balances
// cold-start latency against attacker cost for an offline credential file.
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * AES-256-GCM encrypted on-disk credential store.
 *
 * Concurrency: this store is safe for a single writer. Two MCP server
 * processes writing to the same file concurrently will race — one will
 * silently lose data. The plan trades this off because credential writes
 * are rare (setup wizard, occasional rotation). If you need multi-writer
 * safety, wrap the store with `proper-lockfile` or use the OS keychain
 * (KeychainCredentialStore) instead.
 *
 * Security: AES-256-GCM (authenticated), per-entry random 12-byte IV,
 * scrypt KDF with pinned OWASP 2024 interactive params, per-file 16-byte
 * salt. File perms 0600 on POSIX. Format version 1 — if params change,
 * the version bumps and a migration is required.
 */
export class EncryptedFileCredentialStore implements CredentialStore {
  constructor(private readonly opts: EncryptedFileCredentialStoreOptions) {}

  private stripPrefix(key: CredentialKey): string {
    if (!key.startsWith(SCHEME_PREFIX)) {
      throw new Error(`EncryptedFileCredentialStore only handles file: refs, got "${key}"`);
    }
    return key.slice(SCHEME_PREFIX.length);
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.opts.passphrase.reveal(), salt, 32, SCRYPT_PARAMS);
  }

  private async loadFile(): Promise<EncryptedFile> {
    if (!existsSync(this.opts.path)) {
      return { version: 1, salt: randomBytes(16).toString('hex'), entries: {} };
    }
    let text: string;
    try {
      text = await readFile(this.opts.path, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read credential file "${this.opts.path}": ${err instanceof Error ? err.message : String(err)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Credential file at "${this.opts.path}" is corrupted (not valid JSON): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (
      typeof parsed !== 'object' || parsed === null ||
      !('version' in parsed) || !('salt' in parsed) || !('entries' in parsed) ||
      typeof (parsed as { salt: unknown }).salt !== 'string' ||
      typeof (parsed as { entries: unknown }).entries !== 'object' ||
      (parsed as { entries: unknown }).entries === null
    ) {
      throw new Error(`Credential file at "${this.opts.path}" has invalid shape (missing version/salt/entries)`);
    }
    const validated = parsed as EncryptedFile;
    if (validated.version !== 1) {
      throw new Error(`Unsupported encrypted file version ${String(validated.version)}`);
    }
    return validated;
  }

  private async saveFile(file: EncryptedFile): Promise<void> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    const tmp = `${this.opts.path}.tmp-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp, JSON.stringify(file), { encoding: 'utf8' });
    if (process.platform !== 'win32') await chmod(tmp, 0o600);
    try {
      await rename(tmp, this.opts.path);
    } catch (err) {
      await unlink(tmp).catch(() => { /* best-effort cleanup */ });
      throw err;
    }
  }

  async get(key: CredentialKey): Promise<SecretValue | null> {
    const logical = this.stripPrefix(key);
    const file = await this.loadFile();
    const entry = file.entries[logical];
    if (!entry) return null;
    const salt = Buffer.from(file.salt, 'hex');
    const aesKey = this.deriveKey(salt);
    const iv = Buffer.from(entry.iv, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(Buffer.from(entry.authTag, 'hex'));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(entry.ciphertext, 'hex')),
        decipher.final(),
      ]);
    } catch (err) {
      throw new Error(
        `Failed to decrypt credential "${logical}" — wrong passphrase or corrupted file`,
        { cause: err instanceof Error ? err : undefined },
      );
    }
    return new SecretValue(plaintext.toString('utf8'));
  }

  async set(key: CredentialKey, value: SecretValue): Promise<void> {
    const logical = this.stripPrefix(key);
    const file = await this.loadFile();
    const salt = Buffer.from(file.salt, 'hex');
    const aesKey = this.deriveKey(salt);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(value.reveal(), 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    file.entries[logical] = {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
    };
    await this.saveFile(file);
  }

  async delete(key: CredentialKey): Promise<void> {
    const logical = this.stripPrefix(key);
    if (!existsSync(this.opts.path)) return;
    const file = await this.loadFile();
    if (!(logical in file.entries)) return;
    delete file.entries[logical];
    if (Object.keys(file.entries).length === 0) {
      await unlink(this.opts.path);
      return;
    }
    await this.saveFile(file);
  }
}
