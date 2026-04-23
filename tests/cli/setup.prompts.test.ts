import { describe, expect, it, vi } from 'vitest';

// Import the prompt functions but mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
}));

describe('validation helpers (pure, no prompts involved)', () => {
  it('validateBaseUrl accepts https URLs', async () => {
    const { validateBaseUrl } = await import('@/cli/commands/setup/prompts.js');
    expect(validateBaseUrl('https://school.brightspace.com')).toBe(true);
  });

  it('validateBaseUrl rejects http (non-localhost)', async () => {
    const { validateBaseUrl } = await import('@/cli/commands/setup/prompts.js');
    const result = validateBaseUrl('http://school.brightspace.com');
    expect(result).not.toBe(true);
    expect(typeof result).toBe('string');
  });

  it('validateBaseUrl rejects a non-URL string', async () => {
    const { validateBaseUrl } = await import('@/cli/commands/setup/prompts.js');
    const result = validateBaseUrl('not a url');
    expect(result).not.toBe(true);
  });

  it('validateTotpSecret accepts base32', async () => {
    const { validateTotpSecret } = await import('@/cli/commands/setup/prompts.js');
    expect(validateTotpSecret('JBSWY3DPEHPK3PXP')).toBe(true);
  });

  it('validateTotpSecret rejects strings with non-base32 chars', async () => {
    const { validateTotpSecret } = await import('@/cli/commands/setup/prompts.js');
    const result = validateTotpSecret('INVALID0!?');
    expect(result).not.toBe(true);
  });
});

describe('promptBrowserPreset', () => {
  it('is exported as a function', async () => {
    const { promptBrowserPreset } = await import('@/cli/commands/setup/prompts.js');
    expect(typeof promptBrowserPreset).toBe('function');
  });
});

describe('buildMicrosoftSsoSelectors', () => {
  it('returns the known MS AAD selector map', async () => {
    const { buildMicrosoftSsoSelectors } = await import('@/cli/commands/setup/prompts.js');
    const sel = buildMicrosoftSsoSelectors();
    expect(sel.username).toBe('#i0116');
    expect(sel.password).toBe('#i0118');
    expect(sel.submit).toBe('#idSIButton9');
    expect(sel.password_submit).toBe('#idSIButton9');
    expect(sel.pre_mfa_clicks).toHaveLength(2);
    expect(sel.mfa_input).toBe('#idTxtBx_SAOTCC_OTC');
    expect(sel.mfa_submit).toBe('#idSubmit_SAOTCC_Continue');
    expect(sel.post_login).toBe('d2l-labs-navigation');
  });
});

describe('promptCookieRef', () => {
  it('is exported as a function', async () => {
    const { promptCookieRef } = await import('@/cli/commands/setup/prompts.js');
    expect(typeof promptCookieRef).toBe('function');
  });
});
