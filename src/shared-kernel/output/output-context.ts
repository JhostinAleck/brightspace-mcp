import { detectSystemTz, isValidTz } from './time/tz-detector.js';
import { detectSystemLocale, type SupportedLocale } from './i18n/locale-detector.js';
import { loadAllCatalogs } from './i18n/catalog-loader.js';
import { createTranslator, type Translator } from './i18n/translator.js';
import { formatDate, formatDateTime } from './time/format.js';
import { formatRelative } from './time/relative.js';
import { formatPercent, formatPoints, formatDecimal } from './number/format.js';
import { markdown } from './format/markdown.js';
import { bulletList, numberedList } from './format/list.js';
import { table } from './format/table.js';

export type { SupportedLocale };
export type OutputFormat = 'markdown' | 'plain';

export interface BuildOutputContextInput {
  tz?: string;
  locale?: SupportedLocale;
  format: OutputFormat;
  includeMetaFooter: boolean;
}

export interface MarkdownBuilder {
  h1: (t: string) => string;
  h2: (t: string) => string;
  h3: (t: string) => string;
  h4: (t: string) => string;
  bold: (t: string) => string;
  italic: (t: string) => string;
  code: (t: string) => string;
  link: (label: string, url: string) => string;
  blockquote: (t: string) => string;
  escape: (t: string) => string;
  bulletList: (items: readonly string[]) => string;
  numberedList: (items: readonly string[]) => string;
  table: (headers: readonly string[], rows: readonly (readonly string[])[]) => string;
}

export interface OutputContext {
  readonly tz: string;
  readonly locale: SupportedLocale;
  readonly format: OutputFormat;
  readonly t: Translator;
  readonly formatDate: (d: Date | null, style?: 'short' | 'long' | 'datetime') => string;
  readonly formatRelative: (d: Date | null) => string;
  readonly formatPercent: (n: number, digits?: number) => string;
  readonly formatPoints: (earned: number | null, max: number) => string;
  readonly formatDecimal: (n: number, digits?: number) => string;
  readonly md: MarkdownBuilder;
  readonly metaFooter: (now?: Date) => string;
}

let cachedCatalogs: ReturnType<typeof loadAllCatalogs> | null = null;
function getCatalogs() {
  if (!cachedCatalogs) cachedCatalogs = loadAllCatalogs();
  return cachedCatalogs;
}

export function buildOutputContext(input: BuildOutputContextInput): OutputContext {
  const tz = input.tz ?? detectSystemTz();
  if (!isValidTz(tz)) {
    throw new Error(
      `invalid tz: "${tz}". Use an IANA name like "America/Bogota". ` +
        `Run: node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`,
    );
  }
  const locale = input.locale ?? detectSystemLocale();
  const catalogs = getCatalogs();
  const t = createTranslator(catalogs, locale);

  const md: MarkdownBuilder = {
    h1: markdown.h1,
    h2: markdown.h2,
    h3: markdown.h3,
    h4: markdown.h4,
    bold: markdown.bold,
    italic: markdown.italic,
    code: markdown.code,
    link: markdown.link,
    blockquote: markdown.blockquote,
    escape: markdown.escape,
    bulletList,
    numberedList,
    table,
  };

  const ctx: OutputContext = {
    tz,
    locale,
    format: input.format,
    t,
    formatDate: (d, style) => formatDate(d, { tz, locale, style }),
    formatRelative: (d) => (d ? formatRelative(d, { locale }) : t('common.no_data')),
    formatPercent: (n, digits) => formatPercent(n, { locale, digits }),
    formatPoints: (earned, max) => formatPoints(earned, max, { locale }),
    formatDecimal: (n, digits) => formatDecimal(n, { locale, digits }),
    md,
    metaFooter: (now) => {
      if (!input.includeMetaFooter) return '';
      const ts = formatDateTime(now ?? new Date(), { tz, locale });
      return t('common.footer_meta', { timestamp: ts, tz });
    },
  };

  return ctx;
}

export function resetCatalogCache(): void {
  cachedCatalogs = null;
}
