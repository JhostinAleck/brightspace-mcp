import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '@/shared-kernel/config/schema.js';

const minimalConfig = {
  default_profile: 'a',
  profiles: {
    a: {
      base_url: 'https://x.com',
      auth: { strategy: 'api_token', api_token: { token_ref: 'env:T' } },
    },
  },
};

describe('output config', () => {
  it('defaults output.format to markdown', () => {
    const c = ConfigSchema.parse(minimalConfig);
    expect(c.output.format).toBe('markdown');
    expect(c.output.include_meta_footer).toBe(true);
  });

  it('accepts explicit output block', () => {
    const c = ConfigSchema.parse({
      ...minimalConfig,
      output: {
        tz: 'America/Bogota',
        locale: 'es-419',
        format: 'plain',
        include_meta_footer: false,
      },
    });
    expect(c.output.tz).toBe('America/Bogota');
    expect(c.output.locale).toBe('es-419');
  });

  it('rejects unsupported locale', () => {
    expect(() => ConfigSchema.parse({ ...minimalConfig, output: { locale: 'zh-CN' } })).toThrow();
  });

  it('rejects unsupported format', () => {
    expect(() => ConfigSchema.parse({ ...minimalConfig, output: { format: 'html' } })).toThrow();
  });
});
