import type {
  MfaStrategy,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';

export interface DuoPushMfaStrategyOptions {
  pollIntervalMs: number;
  timeoutMs: number;
}

interface DuoPollBody {
  status?: 'pushed' | 'allow' | 'deny' | string;
}

export class DuoPushMfaStrategy implements MfaStrategy {
  readonly kind = 'duo_push' as const;

  constructor(private readonly opts: DuoPushMfaStrategyOptions) {}

  async solve(challenge: MfaChallenge): Promise<MfaResponse> {
    if (challenge.kind !== 'duo_push') {
      throw new Error(
        `DuoPushMfaStrategy only handles duo_push challenges, got "${challenge.kind}"`,
      );
    }
    if (!challenge.duoTransactionUrl) {
      throw new Error('duoTransactionUrl is required for duo_push challenges');
    }
    const deadline = Date.now() + this.opts.timeoutMs;
    while (Date.now() < deadline) {
      const resp = await fetch(challenge.duoTransactionUrl, {
        signal: AbortSignal.timeout(Math.max(1_000, this.opts.pollIntervalMs * 10)),
      });
      if (!resp.ok) {
        throw new Error(`Duo poll returned HTTP ${resp.status}`);
      }
      const body = (await resp.json()) as DuoPollBody;
      if (body.status === 'allow') return { acknowledged: true };
      if (body.status === 'deny') throw new Error('Duo push denied by user (rejected)');
      await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
    }
    throw new Error('Duo push timed out waiting for approval');
  }
}
