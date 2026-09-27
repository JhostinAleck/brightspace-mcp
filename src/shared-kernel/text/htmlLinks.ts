import { decodeHtmlEntities } from './decodeHtmlEntities.js';
import { stripHtmlPreservingLinks } from './stripHtml.js';

export interface HtmlLink {
  /** Visible anchor text ('' for embeds / anchors without text). */
  label: string;
  url: string;
  /** 'link' = <a href>, 'embed' = iframe/embed/object/media source. */
  kind: 'link' | 'embed';
}

export interface HtmlLinkOptions {
  /**
   * URL (absolute or root-relative path) of the document the HTML came from.
   * Relative links resolve against its directory, the way a browser would.
   */
  baseUrl?: string | null;
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const DUMMY_ORIGIN = 'http://d2l.invalid';

/**
 * Remove the `d2lSessionVal=…` (and the bare `_`) query params D2L appends to
 * links inside content HTML. They are per-session tokens: useless to a caller
 * and not something to echo back into a chat transcript.
 */
export function stripD2lSessionParams(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hashAt = url.indexOf('#', q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const kept = query
    .split('&')
    .filter((p) => p !== '' && p !== '_' && !/^d2lSessionVal=/i.test(p));
  return url.slice(0, q) + (kept.length > 0 ? `?${kept.join('&')}` : '') + hash;
}

/**
 * Resolve a link found in a content page against that page's URL. Absolute
 * URLs (any scheme) and root-relative paths are returned unchanged; relative
 * paths resolve against the base's directory. With no base, the raw value is
 * returned.
 */
export function resolveContentUrl(raw: string, baseUrl?: string | null): string {
  const url = raw.trim();
  if (!url || SCHEME_RE.test(url) || url.startsWith('/') || url.startsWith('#') || !baseUrl) return url;
  try {
    if (SCHEME_RE.test(baseUrl)) return new URL(url, baseUrl).toString();
    const resolved = new URL(url, `${DUMMY_ORIGIN}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`);
    return resolved.toString().slice(DUMMY_ORIGIN.length);
  } catch {
    return url;
  }
}

function cleanUrl(raw: string, opts: HtmlLinkOptions): string | null {
  const decoded = decodeHtmlEntities(raw).trim();
  if (!decoded || decoded.startsWith('#') || /^(javascript|data):/i.test(decoded)) return null;
  return stripD2lSessionParams(resolveContentUrl(decoded, opts.baseUrl));
}

function labelText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function removeCode(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
}

const EMBED_RES: RegExp[] = [
  /<(?:iframe|embed|source|video|audio)\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi,
  /<object\b[^>]*?\bdata\s*=\s*["']([^"']*)["']/gi,
  /<param\b(?=[^>]*\bname\s*=\s*["'](?:src|movie|url)["'])[^>]*?\bvalue\s*=\s*["']([^"']*)["']/gi,
];

/**
 * Collect the resources a piece of content HTML points at: anchors plus
 * embedded documents/media (iframes, <embed>, <object data>, <param src>,
 * <source>). Images are skipped (mostly banners/icons). URLs are resolved
 * against `baseUrl`, stripped of session tokens and deduplicated (first
 * occurrence wins, in document order).
 */
export function extractHtmlLinks(html: string, opts: HtmlLinkOptions = {}): HtmlLink[] {
  const src = removeCode(html);
  const found: Array<HtmlLink & { at: number }> = [];
  for (const m of src.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = cleanUrl(m[1] ?? '', opts);
    if (url) found.push({ label: labelText(m[2] ?? ''), url, kind: 'link', at: m.index });
  }
  for (const re of EMBED_RES) {
    for (const m of src.matchAll(re)) {
      const url = cleanUrl(m[1] ?? '', opts);
      if (url) found.push({ label: '', url, kind: 'embed', at: m.index });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: HtmlLink[] = [];
  for (const { label, url, kind } of found) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ label, url, kind });
  }
  return out;
}

/**
 * D2L often labels embedded media with a raw path copied from an older course
 * (`<a href="/content/enforced/NEW/x.mov">/content/enforced/OLD/x.mov</a>`).
 * Such labels are noise at best and misleading at worst: blank them so only
 * the real target survives.
 */
function blankPathLikeAnchorLabels(html: string): string {
  return html.replace(/(<a\b[^>]*>)([\s\S]*?)(<\/a>)/gi, (m, open: string, inner: string, close: string) =>
    /^(\/|https?:\/\/)\S*$/i.test(labelText(inner).replace(/\s+/g, '')) ? `${open}${close}` : m);
}

/**
 * Visible text only (no link targets), whitespace collapsed to single spaces.
 * Anchor labels that are just raw paths/URLs are dropped.
 */
export function htmlToPlainText(html: string): string {
  return labelText(blankPathLikeAnchorLabels(removeCode(html)));
}

const BLOCK_BREAK_RE = /<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|h[1-6]|tr|table|ul|ol|blockquote|pre|section|article|header|footer|dt|dd|center)\s*>/gi;

/**
 * Convert content HTML (a D2L HTML topic or module description) to readable
 * text: block elements become line breaks, list items get a "- " bullet,
 * anchors keep their (resolved, token-free) target as `label (url)`, and
 * embedded documents/media without anchor text are listed at the end under
 * "Embedded resources:".
 */
export function htmlToText(html: string, opts: HtmlLinkOptions = {}): string {
  const src = removeCode(html);
  const withResolvedHrefs = blankPathLikeAnchorLabels(src).replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)\2/gi,
    (_m, pre: string, q: string, href: string) => {
      const url = cleanUrl(href, opts);
      return `${pre}${q}${url ?? 'javascript:'}${q}`;
    },
  );
  const marked = withResolvedHrefs.replace(/<li\b[^>]*>/gi, '\n- ').replace(BLOCK_BREAK_RE, '\n');
  const lines = marked
    .split('\n')
    .map((chunk) => {
      const bullet = chunk.startsWith('- ') ? '- ' : '';
      const text = stripHtmlPreservingLinks(bullet ? chunk.slice(2) : chunk);
      return text ? bullet + text : '';
    })
    .filter((l) => l !== '' && l !== '-');
  const text = lines.join('\n');

  const embeds = extractHtmlLinks(src, opts).filter((l) => l.kind === 'embed' && !text.includes(l.url));
  if (embeds.length === 0) return text;
  const embedBlock = `Embedded resources:\n${embeds.map((e) => `- ${e.url}`).join('\n')}`;
  return text ? `${text}\n\n${embedBlock}` : embedBlock;
}
