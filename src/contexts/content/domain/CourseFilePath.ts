import { DomainError } from '@/shared-kernel/errors/DomainError.js';

export class InvalidCourseFilePathError extends DomainError {
  readonly code = 'invalid_course_file_path';
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export interface CourseFilePathOptions {
  /**
   * Tenant origin (e.g. https://school.brightspace.com). When given, absolute
   * URLs on exactly this origin are accepted; absolute URLs are otherwise
   * rejected.
   */
  origin?: string | null;
}

const PREFIX = '/content/enforced/';
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function fail(msg: string): never {
  throw new InvalidCourseFilePathError(msg);
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return fail(`Malformed percent-encoding in path segment "${seg}".`);
  }
}

/**
 * A file inside a course's own content area (`/content/enforced/{ou}-…/…`),
 * validated so a model-supplied path can never reach other courses, the API,
 * or another host. The stored `path` is canonical: every segment percent-
 * encoded exactly once, no query string (session tokens are dropped).
 */
export class CourseFilePath {
  private constructor(readonly path: string, readonly filename: string) {}

  /** True for references like `files/a.pdf` or `../a.pdf` that need a base. */
  static isRelative(raw: string): boolean {
    const s = raw.trim();
    return s !== '' && !s.startsWith('/') && !SCHEME_RE.test(s);
  }

  static parse(raw: string, courseOrgUnitId: number, opts: CourseFilePathOptions = {}): CourseFilePath {
    const input = raw.trim();
    if (!input) fail('Path is empty.');
    if (input.includes('\\')) fail('Backslashes are not allowed in course file paths.');
    if (input.startsWith('//')) fail('Protocol-relative URLs are not allowed.');

    let pathAndQuery = input;
    if (SCHEME_RE.test(input)) {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        return fail('Not a valid URL.');
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('Only http(s) URLs are allowed.');
      const allowed = opts.origin ? normalizeOrigin(opts.origin) : null;
      if (!allowed) fail(`Absolute URLs are not accepted here; pass the path starting with ${PREFIX}.`);
      if (url.origin !== allowed) fail(`URL host ${url.host} is not this Brightspace tenant.`);
      pathAndQuery = url.pathname;
    }
    if (!pathAndQuery.startsWith('/')) {
      fail(`Relative path "${input}": pass topic_id so it can be resolved, or a path starting with ${PREFIX}.`);
    }

    const pathOnly = pathAndQuery.split(/[?#]/)[0] ?? '';
    if (!pathOnly.startsWith(PREFIX)) fail(`Only files under ${PREFIX}${courseOrgUnitId}-… can be downloaded.`);
    const rawSegments = pathOnly.slice(PREFIX.length).split('/');
    const decoded = rawSegments.map(decodeSegment);
    if (decoded[decoded.length - 1] === '') fail('Path points to a folder, not a file.');
    if (decoded.includes('')) fail('Empty path segments are not allowed.');
    if (decoded.some((s) => s === '.' || s === '..')) fail('Path traversal ("." / "..") is not allowed.');
    const hasControlChar = (s: string): boolean => [...s].some((ch) => ch.charCodeAt(0) < 0x20);
    if (decoded.some((s) => s.includes('/') || s.includes('\\') || hasControlChar(s))) {
      fail('Encoded slashes or control characters are not allowed.');
    }
    const courseDir = decoded[0] ?? '';
    const ou = String(courseOrgUnitId);
    if (courseDir !== ou && !courseDir.startsWith(`${ou}-`)) {
      fail(`Path belongs to another course (${courseDir}); only ${PREFIX}${ou}-… is allowed for course ${ou}.`);
    }
    if (decoded.length < 2) fail('Path points to a folder, not a file.');

    const canonical = PREFIX + decoded.map((s) => encodeURIComponent(s)).join('/');
    return new CourseFilePath(canonical, decoded[decoded.length - 1] ?? '');
  }
}
