import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { callWhoAmI } from '@/contexts/http-api/whoami.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

afterEach(() => nock.cleanAll());

describe('callWhoAmI', () => {
  it('returns parsed UserIdentity on success', async () => {
    nock('https://school.example.com')
      .get('/d2l/api/lp/1.56/users/whoami')
      .reply(200, { Identifier: '42', FirstName: 'Jane', LastName: 'Doe', UniqueName: 'jdoe' });

    const identity = await callWhoAmI(AccessToken.bearer('tok'), 'https://school.example.com');
    expect(identity.displayName).toBe('Jane Doe');
    expect(identity.uniqueName).toBe('jdoe');
  });

  it('trims display name when LastName is empty', async () => {
    nock('https://school.example.com')
      .get('/d2l/api/lp/1.56/users/whoami')
      .reply(200, { Identifier: '1', FirstName: 'Solo', LastName: '', UniqueName: 'solo' });

    const identity = await callWhoAmI(AccessToken.bearer('tok'), 'https://school.example.com');
    expect(identity.displayName).toBe('Solo');
  });

  it('respects a custom lpVersion', async () => {
    nock('https://school.example.com')
      .get('/d2l/api/lp/1.99/users/whoami')
      .reply(200, { Identifier: '7', FirstName: 'A', LastName: 'B', UniqueName: 'ab' });

    const identity = await callWhoAmI(
      AccessToken.bearer('tok'),
      'https://school.example.com',
      '1.99',
    );
    expect(identity.uniqueName).toBe('ab');
  });

  it('throws on non-ok response', async () => {
    nock('https://school.example.com')
      .get('/d2l/api/lp/1.56/users/whoami')
      .reply(401);

    await expect(
      callWhoAmI(AccessToken.bearer('bad'), 'https://school.example.com'),
    ).rejects.toThrow('401');
  });
});
