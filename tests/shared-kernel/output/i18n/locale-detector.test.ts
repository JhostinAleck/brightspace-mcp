import { describe, expect, it } from 'vitest';
import { detectSystemLocale } from '@/shared-kernel/output/i18n/locale-detector.js';

describe('locale-detector', () => {
  it('maps en_US.UTF-8 → en-US', () => {
    expect(detectSystemLocale({ LANG: 'en_US.UTF-8' })).toBe('en-US');
  });

  it('maps es_CO.UTF-8 → es-419', () => {
    expect(detectSystemLocale({ LANG: 'es_CO.UTF-8' })).toBe('es-419');
  });

  it('maps es_ES → es-419 (no es-ES catalog)', () => {
    expect(detectSystemLocale({ LANG: 'es_ES.UTF-8' })).toBe('es-419');
  });

  it('maps pt_BR → pt-BR', () => {
    expect(detectSystemLocale({ LANG: 'pt_BR.UTF-8' })).toBe('pt-BR');
  });

  it('maps fr_CA → fr-CA', () => {
    expect(detectSystemLocale({ LANG: 'fr_CA.UTF-8' })).toBe('fr-CA');
  });

  it('maps fr_FR → fr-CA (only French we ship)', () => {
    expect(detectSystemLocale({ LANG: 'fr_FR.UTF-8' })).toBe('fr-CA');
  });

  it('falls back to en-US on unknown', () => {
    expect(detectSystemLocale({ LANG: 'zh_CN.UTF-8' })).toBe('en-US');
    expect(detectSystemLocale({})).toBe('en-US');
  });
});
