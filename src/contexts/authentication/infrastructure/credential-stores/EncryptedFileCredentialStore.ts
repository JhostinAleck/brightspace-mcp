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

export class EncryptedFileCredentialStore implements CredentialStore {
  constructor(private readonly opts: EncryptedFileCredentialStoreOptions) {}

  private stripPrefix(key: CredentialKey): string {
    if (!key.startsWith(SCHEME_PREFIX)) {
      throw new Error(`EncryptedFileCredentialStore only handles file: refs, got "${key}"`);
    }
    return key.slice(SCHEME_PREFIX.length);
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.opts.passphrase.reveal(), salt, 32);
  }

  private async loadFile(): Promise<EncryptedFile> {
    if (!existsSync(this.opts.path)) {
      return { version: 1, salt: randomBytes(16).toString('hex'), entries: {} };
    }
    const text = await readFile(this.opts.path, 'utf8');
    const parsed = JSON.parse(text) as EncryptedFile;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported encrypted file version ${String(parsed.version)}`);
    }
    return parsed;
  }

  private async saveFile(file: EncryptedFile): Promise<void> {
    await mkdir(dirname(this.opts.path), { recursive: true });
    const tmp = `${this.opts.path}.tmp-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp, JSON.stringify(file), { encoding: 'utf8' });
    if (process.platform !== 'win32') await chmod(tmp, 0o600);
    await rename(tmp, this.opts.path);
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
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, 'hex')),
      decipher.final(),
    ]);
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
