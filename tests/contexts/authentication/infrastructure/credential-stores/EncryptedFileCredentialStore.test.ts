import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptedFileCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/EncryptedFileCredentialStore.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

describe('EncryptedFileCredentialStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'encfile-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a secret', async () => {
    const store = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('hunter2'),
    });
    await store.set('file:creds/my_tok', new SecretValue('abc_123'));
    const got = await store.get('file:creds/my_tok');
    expect(got?.reveal()).toBe('abc_123');
  });

  it('returns null for missing key', async () => {
    const store = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('hunter2'),
    });
    expect(await store.get('file:creds/nope')).toBeNull();
  });

  it('delete removes a key', async () => {
    const store = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('hunter2'),
    });
    await store.set('file:creds/k', new SecretValue('v'));
    await store.delete('file:creds/k');
    expect(await store.get('file:creds/k')).toBeNull();
  });

  it('rejects wrong passphrase on read', async () => {
    const a = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('right'),
    });
    await a.set('file:creds/k', new SecretValue('v'));
    const b = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('wrong'),
    });
    await expect(b.get('file:creds/k')).rejects.toThrow();
  });

  it('rejects non-file: refs', async () => {
    const store = new EncryptedFileCredentialStore({
      path: join(dir, 'creds.enc'),
      passphrase: new SecretValue('p'),
    });
    await expect(store.get('env:X')).rejects.toThrow(/file:/);
  });

  it('sets file permissions to 0600 on POSIX', async () => {
    if (process.platform === 'win32') return;
    const path = join(dir, 'creds.enc');
    const store = new EncryptedFileCredentialStore({
      path,
      passphrase: new SecretValue('p'),
    });
    await store.set('file:creds/k', new SecretValue('v'));
    expect(existsSync(path)).toBe(true);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
