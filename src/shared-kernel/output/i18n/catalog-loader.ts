import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogSchema, type Catalog } from './catalog.schema.js';

export const SUPPORTED_LOCALES = ['en-US', 'es-419', 'pt-BR', 'fr-CA'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const __dirname = dirname(fileURLToPath(import.meta.url));

function catalogPath(locale: SupportedLocale): string {
  return join(__dirname, 'catalogs', `${locale}.json`);
}

export function loadCatalog(locale: SupportedLocale): Catalog {
  const path = catalogPath(locale);
  if (!existsSync(path)) {
    throw new Error(`Catalog file missing: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Catalog ${locale} is malformed: ${parsed.error.message}`);
  }
  return parsed.data;
}

export type Catalogs = Record<SupportedLocale, Catalog>;

export function loadAllCatalogs(): Catalogs {
  const out = {} as Catalogs;
  for (const loc of SUPPORTED_LOCALES) {
    if (existsSync(catalogPath(loc))) {
      out[loc] = loadCatalog(loc);
    }
  }
  if (!out['en-US']) {
    throw new Error('Base catalog en-US is required but missing.');
  }
  return out;
}
