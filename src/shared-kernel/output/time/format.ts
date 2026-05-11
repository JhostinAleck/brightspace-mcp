export interface FormatOptions {
  tz: string;
  locale: string;
  style?: 'short' | 'long' | 'datetime' | undefined;
}

export function formatDate(d: Date | null, opts: FormatOptions): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  const style = opts.style ?? 'short';
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { dateStyle: 'long', timeZone: opts.tz }
      : style === 'datetime'
        ? { dateStyle: 'medium', timeStyle: 'short', timeZone: opts.tz }
        : { dateStyle: 'medium', timeZone: opts.tz };
  return new Intl.DateTimeFormat(opts.locale, options).format(d);
}

export function formatDateTime(d: Date | null, opts: Omit<FormatOptions, 'style'>): string {
  return formatDate(d, { ...opts, style: 'datetime' });
}

export function formatTime(d: Date | null, opts: Omit<FormatOptions, 'style'>): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(opts.locale, { timeStyle: 'short', timeZone: opts.tz }).format(d);
}
