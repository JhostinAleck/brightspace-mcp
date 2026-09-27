import { decodeHtmlEntities } from './decodeHtmlEntities.js';

function tagsToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Converts HTML to plain text while preserving where <a> links point.
 * A plain tag-stripping regex turns `<a href="...">label</a>` into just
 * "label", silently discarding the URL — which is exactly the destination
 * a caller usually wants (e.g. a "check the syllabus here" link embedded in
 * a D2L content page). This keeps the link as `label (href)` instead.
 * `javascript:` hrefs are dropped (label only) and <script>/<style> bodies
 * are removed entirely.
 */
export function stripHtmlPreservingLinks(html: string): string {
  const withoutCode = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const withLinks = withoutCode.replace(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, rawHref: string, label: string) => {
      const text = tagsToText(label);
      const href = decodeHtmlEntities(rawHref).trim();
      if (!href || /^javascript:/i.test(href)) return text;
      return text ? `${text} (${href})` : href;
    },
  );
  return tagsToText(withLinks);
}
