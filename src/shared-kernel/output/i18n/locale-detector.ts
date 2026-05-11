import { SUPPORTED_LOCALES, type SupportedLocale } from './catalog-loader.js';

export function detectSystemLocale(env: NodeJS.ProcessEnv = process.env): SupportedLocale {
  const raw = env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? '';
  const lang = raw.split('.')[0]?.replace('_', '-').toLowerCase() ?? '';
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('es')) return 'es-419';
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('fr')) return 'fr-CA';
  return 'en-US';
}

export { SUPPORTED_LOCALES };
export type { SupportedLocale };
