import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TotpMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/TotpMfaStrategy.js';
import { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

// RFC 6238 Appendix B test vector: secret "12345678901234567890" (ASCII)
// encoded as base32 is 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
// At Unix epoch time = 59, HOTP code (8-digit SHA-1) is '94287082'.
// The 6-digit truncation is '287082'.
const RFC_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TotpMfaStrategy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('generates RFC 6238 6-digit code at t=59', async () => {
    vi.setSystemTime(new Date(59_000));
    const strategy = new TotpMfaStrategy({
      secret: new SecretValue(RFC_BASE32),
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    const resp = await strategy.solve({ kind: 'totp_code' });
    expect(resp.code).toBe('287082');
  });

  it('regenerates different code as time advances across a period', async () => {
    vi.setSystemTime(new Date(30_000)); // period 1
    const strategy = new TotpMfaStrategy({
      secret: new SecretValue(RFC_BASE32),
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    const a = (await strategy.solve({ kind: 'totp_code' })).code;
    vi.setSystemTime(new Date(61_000)); // period 2
    const b = (await strategy.solve({ kind: 'totp_code' })).code;
    expect(a).not.toBe(b);
  });

  it('rejects non-totp_code challenge kinds', async () => {
    const strategy = new TotpMfaStrategy({
      secret: new SecretValue(RFC_BASE32),
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    await expect(
      strategy.solve({ kind: 'duo_push' }),
    ).rejects.toThrow(/totp_code/i);
  });

  it('generates RFC 6238 8-digit SHA1 code at t=59', async () => {
    vi.setSystemTime(new Date(59_000));
    const strategy = new TotpMfaStrategy({
      secret: new SecretValue(RFC_BASE32),
      digits: 8,
      period: 30,
      algorithm: 'SHA1',
    });
    const resp = await strategy.solve({ kind: 'totp_code' });
    // RFC 6238 Appendix B, SHA1, t=59 → 94287082 (full 8 digits)
    expect(resp.code).toBe('94287082');
  });

  it('calls SecretValue.reveal exactly once per solve()', async () => {
    vi.setSystemTime(new Date(59_000));
    const secret = new SecretValue(RFC_BASE32);
    const spy = vi.spyOn(secret, 'reveal');
    const strategy = new TotpMfaStrategy({
      secret,
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    await strategy.solve({ kind: 'totp_code' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('generates code for 80-bit (16 char base32) secrets used by many services', async () => {
    vi.setSystemTime(new Date(59_000));
    const strategy = new TotpMfaStrategy({
      secret: new SecretValue('JBSWY3DPEHPK3PXP'),
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    const resp = await strategy.solve({ kind: 'totp_code' });
    expect(resp.code).toMatch(/^\d{6}$/);
  });

  it('rejects unsupported algorithm at construction (defence-in-depth)', () => {
    expect(() => new TotpMfaStrategy({
      secret: new SecretValue(RFC_BASE32),
      digits: 6,
      period: 30,
      // Simulate bad config that sneaks past Zod somehow
      algorithm: 'MD5' as unknown as 'SHA1',
    })).toThrow(/unsupported algorithm/i);
  });
});
