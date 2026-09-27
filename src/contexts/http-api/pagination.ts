import type { D2lApiClient } from './D2lApiClient.js';

/**
 * D2L "ObjectListPage" envelope: `{ Objects: T[], Next: string | null }`.
 * Used by the Quizzes API, `calendar/events/myEvents/`, and others. `Next` is
 * an absolute URL (on the tenant host) carrying a `bookmark` query param.
 */
export interface ObjectListPage<T> {
  Objects?: T[] | null;
  Next?: string | null;
}

const MAX_PAGES = 100;

/**
 * Convert a D2L `Next` link into a path the D2lApiClient can request.
 * The host is intentionally dropped — the client always prefixes its own
 * configured base URL, so a hostile/garbled `Next` cannot redirect requests
 * elsewhere. Anything that is not under `/d2l/api/` is rejected.
 */
export function nextPagePath(next: string | null | undefined): string | null {
  if (!next) return null;
  let url: URL;
  try {
    url = new URL(next, 'http://relative.invalid');
  } catch {
    return null;
  }
  if (!url.pathname.startsWith('/d2l/api/')) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * Fetch every page of an ObjectListPage endpoint, following `Next` links.
 * Stops on a repeated link (cyclic bookmark) or after MAX_PAGES.
 */
export async function fetchAllObjectListPages<T>(client: D2lApiClient, firstPath: string): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let path: string | null = firstPath;
  let pages = 0;
  while (path !== null && pages < MAX_PAGES && !seen.has(path)) {
    seen.add(path);
    pages += 1;
    const page: ObjectListPage<T> = await client.get<ObjectListPage<T>>(path);
    all.push(...(page.Objects ?? []));
    path = nextPagePath(page.Next);
  }
  return all;
}
