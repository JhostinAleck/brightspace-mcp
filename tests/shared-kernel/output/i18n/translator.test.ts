import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/shared-kernel/output/i18n/translator.js';
import type { Catalogs } from '@/shared-kernel/output/i18n/catalog-loader.js';

const catalogs = {
  'en-US': {
    courses: {
      empty: 'You have no courses.',
      count: { one: 'You have {count} course:', other: 'You have {count} courses:' },
    },
  },
  'es-419': {
    courses: {
      count: { one: 'Tienes {count} curso:', other: 'Tienes {count} cursos:' },
    },
  },
  'pt-BR': {},
  'fr-CA': {},
} as unknown as Catalogs;

describe('translator', () => {
  it('returns simple string', () => {
    const t = createTranslator(catalogs, 'en-US');
    expect(t('courses.empty')).toBe('You have no courses.');
  });

  it('falls back to en-US on missing key in target locale', () => {
    const t = createTranslator(catalogs, 'es-419');
    expect(t('courses.empty')).toBe('You have no courses.');
  });

  it('plural one (es)', () => {
    const t = createTranslator(catalogs, 'es-419');
    expect(t('courses.count', { count: 1 })).toBe('Tienes 1 curso:');
  });

  it('plural other (es)', () => {
    const t = createTranslator(catalogs, 'es-419');
    expect(t('courses.count', { count: 5 })).toBe('Tienes 5 cursos:');
  });

  it('returns key marker on totally missing key', () => {
    const t = createTranslator(catalogs, 'en-US');
    expect(t('nope.foo')).toBe('{{nope.foo}}');
  });

  it('interpolates simple {var}', () => {
    const cat = {
      'en-US': { hello: 'Hi {name}!' },
      'es-419': {},
      'pt-BR': {},
      'fr-CA': {},
    } as unknown as Catalogs;
    const t = createTranslator(cat, 'en-US');
    expect(t('hello', { name: 'Jhostin' })).toBe('Hi Jhostin!');
  });
});
