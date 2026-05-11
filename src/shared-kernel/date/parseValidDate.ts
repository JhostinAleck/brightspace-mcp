/**
 * Parse a date string and return `null` if the result is an "Invalid Date".
 *
 * `new Date(badString)` returns a Date object whose `getTime()` is `NaN` —
 * calling `.toISOString()` on it throws `RangeError: Invalid time value`.
 * Use this helper at trust boundaries (D2L API responses, cached JSON) to
 * surface unparseable timestamps as `null` instead of bombs that detonate
 * further down the call stack.
 */
export function parseValidDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
