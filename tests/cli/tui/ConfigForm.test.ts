import { describe, it, expect } from 'vitest';
import { AuthStrategyKindSchema, MfaStrategyKindSchema } from '@/shared-kernel/config/schema.js';
import { SUPPORTED_LOCALES } from '@/shared-kernel/output/i18n/catalog-loader.js';
import { getConfigFormFields } from '@/cli/commands/tui/config/ConfigForm.js';

describe('ConfigForm — Zod-derived options (prevents hardcoding drift)', () => {
  it('strategy options match AuthStrategyKindSchema.options exactly', () => {
    const fields = getConfigFormFields();
    expect(fields['strategy']?.options).toEqual(AuthStrategyKindSchema.options);
  });

  it('mfa_strategy options match MfaStrategyKindSchema.options exactly', () => {
    const fields = getConfigFormFields();
    expect(fields['mfa_strategy']?.options).toEqual(MfaStrategyKindSchema.options);
  });

  it('locale options match SUPPORTED_LOCALES exactly', () => {
    const fields = getConfigFormFields();
    expect(fields['locale']?.options).toEqual([...SUPPORTED_LOCALES]);
  });

  it('format options are markdown and plain', () => {
    const fields = getConfigFormFields();
    expect(fields['format']?.options).toEqual(['markdown', 'plain']);
  });
});
