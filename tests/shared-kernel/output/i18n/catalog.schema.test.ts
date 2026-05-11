import { describe, expect, it } from 'vitest';
import { CatalogSchema } from '@/shared-kernel/output/i18n/catalog.schema.js';

describe('CatalogSchema', () => {
  it('accepts plain string leaf', () => {
    expect(CatalogSchema.safeParse({ x: 'hello' }).success).toBe(true);
  });

  it('accepts plural object leaf', () => {
    expect(
      CatalogSchema.safeParse({ x: { one: '1 thing', other: '{count} things' } }).success,
    ).toBe(true);
  });

  it('rejects mixed leaf shapes', () => {
    expect(CatalogSchema.safeParse({ x: { foo: 1 } }).success).toBe(false);
  });

  it('accepts nested namespaces', () => {
    expect(CatalogSchema.safeParse({ a: { b: { c: 'leaf' } } }).success).toBe(true);
  });
});
