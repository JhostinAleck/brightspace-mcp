import type {
  MfaStrategy,
  MfaStrategyKind,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';

export class FakeMfaStrategy implements MfaStrategy {
  public readonly seen: MfaChallenge[] = [];

  constructor(
    public readonly kind: MfaStrategyKind,
    private readonly response: MfaResponse,
  ) {}

  async solve(challenge: MfaChallenge): Promise<MfaResponse> {
    this.seen.push(challenge);
    return this.response;
  }
}
