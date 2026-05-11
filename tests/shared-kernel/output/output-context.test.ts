import { describe, expect, it } from 'vitest';
import { buildOutputContext, resetCatalogCache } from '@/shared-kernel/output/output-context.js';

describe('OutputContext', () => {
  it('uses provided tz and locale', () => {
    const ctx = buildOutputContext({
      tz: 'America/Bogota',
      locale: 'es-419',
      format: 'markdown',
      includeMetaFooter: true,
    });
    expect(ctx.tz).toBe('America/Bogota');
    expect(ctx.locale).toBe('es-419');
    expect(ctx.t('courses.empty')).toBe('No tienes cursos.');
  });

  it('falls back to system detect when tz omitted', () => {
    const ctx = buildOutputContext({
      locale: 'en-US',
      format: 'markdown',
      includeMetaFooter: true,
    });
    expect(ctx.tz.length).toBeGreaterThan(0);
  });

  it('formatPercent uses locale', () => {
    const ctx = buildOutputContext({
      tz: 'UTC',
      locale: 'en-US',
      format: 'markdown',
      includeMetaFooter: true,
    });
    expect(ctx.formatPercent(85.5)).toBe('85.5%');
  });

  it('throws on invalid tz', () => {
    expect(() =>
      buildOutputContext({
        tz: 'Mars/Olympus',
        locale: 'en-US',
        format: 'markdown',
        includeMetaFooter: true,
      }),
    ).toThrow(/invalid.*tz/i);
  });

  it('metaFooter emits localized footer', () => {
    const ctx = buildOutputContext({
      tz: 'America/Bogota',
      locale: 'es-419',
      format: 'markdown',
      includeMetaFooter: true,
    });
    const out = ctx.metaFooter(new Date('2026-05-11T12:00:00Z'));
    expect(out).toContain('Zona horaria: America/Bogota');
  });

  it('metaFooter returns empty string when disabled', () => {
    const ctx = buildOutputContext({
      tz: 'UTC',
      locale: 'en-US',
      format: 'markdown',
      includeMetaFooter: false,
    });
    expect(ctx.metaFooter()).toBe('');
  });

  it('md.table works end-to-end', () => {
    const ctx = buildOutputContext({
      tz: 'UTC',
      locale: 'en-US',
      format: 'markdown',
      includeMetaFooter: false,
    });
    const out = ctx.md.table(['A', 'B'], [['1', '2']]);
    expect(out).toBe('| A | B |\n|---|---|\n| 1 | 2 |');
  });
});
