import { createHmac } from 'node:crypto';
import type {
  MfaStrategy,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

export interface TotpMfaStrategyOptions {
  secret: SecretValue;
  digits: 6 | 8;
  period: number;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
}

const ALLOWED_ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'] as const;

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/\s+/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error(`TotpMfaStrategy: invalid base32 character "${char}" in secret`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

export class TotpMfaStrategy implements MfaStrategy {
  readonly kind = 'totp' as const;

  constructor(private readonly opts: TotpMfaStrategyOptions) {
    if (!ALLOWED_ALGORITHMS.includes(opts.algorithm)) {
      throw new Error(
        `TotpMfaStrategy: unsupported algorithm "${opts.algorithm}". Must be one of: ${ALLOWED_ALGORITHMS.join(', ')}`,
      );
    }
  }

  async solve(challenge: MfaChallenge): Promise<MfaResponse> {
    if (challenge.kind !== 'totp_code') {
      throw new Error(
        `TotpMfaStrategy only handles totp_code challenges, got "${challenge.kind}"`,
      );
    }

    const { digits, period, algorithm } = this.opts;
    const key = base32Decode(this.opts.secret.reveal());
    const epochSec = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epochSec / period);

    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));

    const digest = createHmac(algorithm.toLowerCase(), key).update(counterBuf).digest();
    const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
    const truncated =
      (((digest[offset] ?? 0) & 0x7f) << 24) |
      (((digest[offset + 1] ?? 0) & 0xff) << 16) |
      (((digest[offset + 2] ?? 0) & 0xff) << 8) |
       ((digest[offset + 3] ?? 0) & 0xff);

    const code = (truncated % 10 ** digits).toString().padStart(digits, '0');
    return { code };
  }
}
