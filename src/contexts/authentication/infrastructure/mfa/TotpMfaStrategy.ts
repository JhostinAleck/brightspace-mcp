import { createHmac } from 'node:crypto';
import type {
  MfaStrategy,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';
import type { SecretValue } from '@/contexts/authentication/domain/SecretValue.js';

/**
 * Remembers the last TOTP time-step submitted. Identity providers (e.g.
 * Microsoft Entra) reject a code that was already used, so two logins inside
 * one 30 s window — from the server, the TUI and a script at once — would
 * otherwise make the second one fail. Share one store across processes.
 */
export interface TotpUsedCounterStore {
  last(): Promise<number | null>;
  markUsed(counter: number): Promise<void>;
}

export interface TotpMfaStrategyOptions {
  secret: SecretValue;
  digits: 6 | 8;
  period: number;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  usedCounters?: TotpUsedCounterStore;
  /** Wait for the next window when fewer ms than this remain, so the code doesn't expire in transit. Default 0. */
  minRemainingMs?: number;
  sleep?: (ms: number) => Promise<void>;
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

    const { digits, algorithm } = this.opts;
    const key = base32Decode(this.opts.secret.reveal());
    const counter = await this.freshCounter();

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
    await this.opts.usedCounters?.markUsed(counter);
    return { code };
  }

  /** Current time-step, waiting for the next one if it's nearly over or already used. */
  private async freshCounter(): Promise<number> {
    const periodMs = this.opts.period * 1000;
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const minRemaining = this.opts.minRemainingMs ?? 0;
    const lastUsed = (await this.opts.usedCounters?.last()) ?? null;
    for (;;) {
      const now = Date.now();
      const counter = Math.floor(now / periodMs);
      const remaining = (counter + 1) * periodMs - now;
      if (remaining >= minRemaining && (lastUsed === null || counter > lastUsed)) return counter;
      await sleep(remaining + 50);
    }
  }
}
