import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { DuoPushMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/DuoPushMfaStrategy.js';

afterEach(() => nock.cleanAll());

describe('DuoPushMfaStrategy', () => {
  it('polls and returns acknowledged when status is allow', async () => {
    nock('https://duo.example.com')
      .get('/tx/poll')
      .reply(200, { status: 'pushed' })
      .get('/tx/poll')
      .reply(200, { status: 'allow' });

    const strategy = new DuoPushMfaStrategy({ pollIntervalMs: 1, timeoutMs: 5_000 });
    const resp = await strategy.solve({
      kind: 'duo_push',
      duoTransactionUrl: 'https://duo.example.com/tx/poll',
    });
    expect(resp.acknowledged).toBe(true);
  });

  it('throws when status is deny', async () => {
    nock('https://duo.example.com')
      .get('/tx/poll')
      .reply(200, { status: 'deny' });

    const strategy = new DuoPushMfaStrategy({ pollIntervalMs: 1, timeoutMs: 5_000 });
    await expect(
      strategy.solve({ kind: 'duo_push', duoTransactionUrl: 'https://duo.example.com/tx/poll' }),
    ).rejects.toThrow(/deny|rejected/i);
  });

  it('throws on timeout when push never approves', async () => {
    nock('https://duo.example.com')
      .persist()
      .get('/tx/poll')
      .reply(200, { status: 'pushed' });

    const strategy = new DuoPushMfaStrategy({ pollIntervalMs: 1, timeoutMs: 50 });
    await expect(
      strategy.solve({ kind: 'duo_push', duoTransactionUrl: 'https://duo.example.com/tx/poll' }),
    ).rejects.toThrow(/timeout|timed out/i);
  });

  it('rejects non-duo_push challenges', async () => {
    const strategy = new DuoPushMfaStrategy({ pollIntervalMs: 1, timeoutMs: 100 });
    await expect(strategy.solve({ kind: 'totp_code' })).rejects.toThrow(/duo_push/i);
  });

  it('rejects missing duoTransactionUrl', async () => {
    const strategy = new DuoPushMfaStrategy({ pollIntervalMs: 1, timeoutMs: 100 });
    await expect(strategy.solve({ kind: 'duo_push' })).rejects.toThrow(/duoTransactionUrl/i);
  });
});
