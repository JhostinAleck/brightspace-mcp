import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
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
    const totp = new TOTP({
      digits: this.opts.digits,
      period: this.opts.period,
      algorithm: this.opts.algorithm.toLowerCase() as Lowercase<typeof this.opts.algorithm>,
      secret: this.opts.secret.reveal(),
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
    const code = await totp.generate();
    return { code };
  }
}
