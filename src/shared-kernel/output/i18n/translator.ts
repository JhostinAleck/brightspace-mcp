import type { Catalog, PluralForms } from './catalog.schema.js';
import type { Catalogs, SupportedLocale } from './catalog-loader.js';

export type Translator = (key: string, vars?: Record<string, unknown>) => string;

function resolve(catalog: Catalog | undefined, key: string): unknown {
  if (!catalog) return undefined;
  const parts = key.split('.');
  let node: unknown = catalog;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[p];
    if (node === undefined) return undefined;
  }
  return node;
}

function isPluralForms(v: unknown): v is PluralForms {
  return typeof v === 'object' && v !== null && 'other' in (v as Record<string, unknown>);
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export function createTranslator(catalogs: Catalogs, locale: SupportedLocale): Translator {
  const pluralRules = new Intl.PluralRules(locale);
  return (key, vars) => {
    let leaf = resolve(catalogs[locale], key);
    if (leaf === undefined && locale !== 'en-US') {
      leaf = resolve(catalogs['en-US'], key);
    }
    if (leaf === undefined) {
      return `{{${key}}}`;
    }
    if (typeof leaf === 'string') {
      return interpolate(leaf, vars);
    }
    if (isPluralForms(leaf)) {
      const count = typeof vars?.count === 'number' ? vars.count : 0;
      const form = pluralRules.select(count);
      const template = leaf[form] ?? leaf.other;
      return interpolate(template, vars);
    }
    return `{{${key}}}`;
  };
}
