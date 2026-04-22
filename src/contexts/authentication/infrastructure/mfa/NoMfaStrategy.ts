import type {
  MfaStrategy,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';

export class NoMfaStrategy implements MfaStrategy {
  readonly kind = 'none' as const;
  async solve(_challenge: MfaChallenge): Promise<MfaResponse> {
    return { acknowledged: true };
  }
}
