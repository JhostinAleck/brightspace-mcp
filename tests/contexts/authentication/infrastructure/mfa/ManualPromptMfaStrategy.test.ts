import { describe, it, expect } from 'vitest';
import { ManualPromptMfaStrategy } from '@/contexts/authentication/infrastructure/mfa/ManualPromptMfaStrategy.js';

describe('ManualPromptMfaStrategy', () => {
  it('calls the provided prompter with challenge text and returns code', async () => {
    const prompts: string[] = [];
    const strategy = new ManualPromptMfaStrategy(async (text) => {
      prompts.push(text);
      return '123456';
    });
    const resp = await strategy.solve({
      kind: 'prompt_text',
      promptText: 'Enter 6-digit code',
    });
    expect(resp.code).toBe('123456');
    expect(prompts).toEqual(['Enter 6-digit code']);
  });

  it('defaults to a generic prompt when promptText missing', async () => {
    const prompts: string[] = [];
    const strategy = new ManualPromptMfaStrategy(async (text) => {
      prompts.push(text);
      return 'X';
    });
    await strategy.solve({ kind: 'prompt_text' });
    expect(prompts[0]).toMatch(/mfa|code/i);
  });
});
