import { describe, it, expect } from 'vitest';
import { CompositeCredentialStore } from '@/contexts/authentication/infrastructure/credential-stores/CompositeCredentialStore';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue';
import { FakeCredentialStore } from '@tests/helpers/fakes/FakeCredentialStore';

describe('CompositeCredentialStore', () => {
  it('routes env: to the env store', async () => {
    const envStore = new FakeCredentialStore({ 'env:FOO': 'fromEnv' });
    const keyStore = new FakeCredentialStore({});
    const fileStore = new FakeCredentialStore({});
    const composite = new CompositeCredentialStore({ env: envStore, keychain: keyStore, file: fileStore });
    expect((await composite.get('env:FOO'))?.reveal()).toBe('fromEnv');
  });

  it('routes keychain: to the keychain store', async () => {
    const envStore = new FakeCredentialStore({});
    const keyStore = new FakeCredentialStore({ 'keychain:svc/acc': 'fromKc' });
    const fileStore = new FakeCredentialStore({});
    const composite = new CompositeCredentialStore({ env: envStore, keychain: keyStore, file: fileStore });
    expect((await composite.get('keychain:svc/acc'))?.reveal()).toBe('fromKc');
  });

  it('routes file: to the file store', async () => {
    const envStore = new FakeCredentialStore({});
    const keyStore = new FakeCredentialStore({});
    const fileStore = new FakeCredentialStore({ 'file:creds/x': 'fromFile' });
    const composite = new CompositeCredentialStore({ env: envStore, keychain: keyStore, file: fileStore });
    expect((await composite.get('file:creds/x'))?.reveal()).toBe('fromFile');
  });

  it('rejects unknown schemes', async () => {
    const stub = new FakeCredentialStore({});
    const composite = new CompositeCredentialStore({ env: stub, keychain: stub, file: stub });
    await expect(composite.get('bogus:x')).rejects.toThrow(/scheme/i);
  });

  it('set and delete route to the correct store', async () => {
    const envStore = new FakeCredentialStore({});
    const keyStore = new FakeCredentialStore({});
    const fileStore = new FakeCredentialStore({});
    const composite = new CompositeCredentialStore({ env: envStore, keychain: keyStore, file: fileStore });
    await composite.set('keychain:s/a', new SecretValue('v'));
    expect(keyStore.snapshot()['keychain:s/a']).toBe('v');
    await composite.delete('keychain:s/a');
    expect(keyStore.snapshot()['keychain:s/a']).toBeUndefined();
  });
});
