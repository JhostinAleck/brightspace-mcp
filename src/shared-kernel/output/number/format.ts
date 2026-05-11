export interface NumberOpts {
  locale: string;
  digits?: number | undefined;
}

export function formatPercent(n: number, opts: NumberOpts): string {
  const digits = opts.digits ?? 1;
  const fmt = new Intl.NumberFormat(opts.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${fmt.format(n)}%`;
}

export function formatPoints(earned: number | null, max: number, opts: NumberOpts): string {
  const fmt = new Intl.NumberFormat(opts.locale, { maximumFractionDigits: 2 });
  const lhs = earned === null ? '—' : fmt.format(earned);
  return `${lhs}/${fmt.format(max)}`;
}

export function formatDecimal(n: number, opts: NumberOpts): string {
  const digits = opts.digits;
  const fmt = new Intl.NumberFormat(opts.locale, {
    maximumFractionDigits: digits ?? 2,
  });
  return fmt.format(n);
}
