import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllCatalogs, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared-kernel/output/i18n/catalog-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const allowlistPath = join(__dirname, '..', '..', '..', '..', 'docs', 'i18n-fallback-allowed.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8')) as { allowed_keys: string[] };

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || (typeof v === 'object' && v !== null && 'other' in v)) {
      out.push(path);
    } else {
      out.push(...flattenKeys(v, path));
    }
  }
  return out;
}

describe('catalog parity', () => {
  const cats = loadAllCatalogs();
  const baseKeys = flattenKeys(cats['en-US']);

  for (const loc of SUPPORTED_LOCALES.filter((l) => l !== 'en-US') as SupportedLocale[]) {
    it(`${loc} covers all en-US keys (or is allowlisted)`, () => {
      const locCatalog = cats[loc];
      if (!locCatalog) {
        throw new Error(`Catalog for ${loc} not loaded — add the JSON file.`);
      }
      const locKeys = new Set(flattenKeys(locCatalog));
      const missing = baseKeys.filter(
        (k) => !locKeys.has(k) && !allowlist.allowed_keys.includes(k),
      );
      expect(missing).toEqual([]);
    });
  }
});
