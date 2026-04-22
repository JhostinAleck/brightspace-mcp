import type {
  MfaStrategy,
  MfaChallenge,
  MfaResponse,
} from '@/contexts/authentication/domain/MfaStrategy.js';

export type Prompter = (text: string) => Promise<string>;

export class ManualPromptMfaStrategy implements MfaStrategy {
  readonly kind = 'manual_prompt' as const;

  constructor(private readonly prompt: Prompter) {}

  async solve(challenge: MfaChallenge): Promise<MfaResponse> {
    const text = challenge.promptText ?? 'Enter MFA code:';
    const code = await this.prompt(text);
    return { code: code.trim() };
  }
}
