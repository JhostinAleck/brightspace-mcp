import { buildOutputContext, type OutputContext, type SupportedLocale } from '@/shared-kernel/output/index.js';

export interface TestOutputContextOverrides {
  tz?: string;
  locale?: SupportedLocale;
  includeMetaFooter?: boolean;
}

export function testOutputContext(overrides: TestOutputContextOverrides = {}): OutputContext {
  return buildOutputContext({
    ...(overrides.tz !== undefined ? { tz: overrides.tz } : {}),
    ...(overrides.locale !== undefined ? { locale: overrides.locale } : {}),
    format: 'markdown',
    includeMetaFooter: overrides.includeMetaFooter ?? false,
  });
}
