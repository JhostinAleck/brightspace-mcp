export interface RelativeOptions {
  locale: string;
  now?: Date;
}

const MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_628_000_000,
  year: 31_536_000_000,
} as const;

export function formatRelative(target: Date | null, opts: RelativeOptions): string {
  if (!target || Number.isNaN(target.getTime())) return '—';
  const now = opts.now ?? new Date();
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(opts.locale, { numeric: 'auto' });
  if (abs < MS.minute) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < MS.hour) return rtf.format(Math.round(diff / MS.minute), 'minute');
  if (abs < MS.day) return rtf.format(Math.round(diff / MS.hour), 'hour');
  if (abs < MS.week) return rtf.format(Math.round(diff / MS.day), 'day');
  if (abs < MS.month) return rtf.format(Math.round(diff / MS.week), 'week');
  if (abs < MS.year) return rtf.format(Math.round(diff / MS.month), 'month');
  return rtf.format(Math.round(diff / MS.year), 'year');
}
