import { describe, expect, it } from 'vitest';
import { loadAllCatalogs, SUPPORTED_LOCALES } from '@/shared-kernel/output/i18n/catalog-loader.js';

describe('catalog-loader', () => {
  it('loads en-US successfully', () => {
    const all = loadAllCatalogs();
    expect(all['en-US']).toBeDefined();
    const courses = all['en-US'].courses as Record<string, unknown>;
    expect(courses.empty).toBe('You have no courses.');
  });

  it('exposes supported locale list including en-US', () => {
    expect(SUPPORTED_LOCALES).toContain('en-US');
  });
});
