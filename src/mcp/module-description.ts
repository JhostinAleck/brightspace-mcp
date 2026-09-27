import { extractHtmlLinks, htmlToPlainText, type HtmlLink } from '@/shared-kernel/text/htmlLinks.js';

/** Characters of module description shown per module in get_course_content. */
export const DESCRIPTION_EXCERPT_CHARS = 200;
/** Links shown per module in get_course_content. */
export const DESCRIPTION_MAX_LINKS = 5;

export interface DescriptionSummary {
  excerpt: string;
  /** True when the excerpt was cut. */
  excerptTruncated: boolean;
  /** Formatted "label: url" lines (at most `maxLinks`). */
  links: string[];
  /** Links not shown because of `maxLinks`. */
  hiddenLinks: number;
}

/**
 * "label: url", or just the url when the label is empty or itself looks like
 * a path/URL (D2L often labels embedded media with a stale path from the
 * course the content was copied from).
 */
export function formatLink(link: HtmlLink): string {
  const label = link.label.trim();
  if (!label || label === link.url || /^(\/|https?:\/\/)/i.test(label)) return link.url;
  return `${label}: ${link.url}`;
}

export function summarizeDescription(
  html: string | null,
  opts: { maxChars?: number; maxLinks?: number } = {},
): DescriptionSummary | null {
  if (!html) return null;
  const maxChars = opts.maxChars ?? DESCRIPTION_EXCERPT_CHARS;
  const maxLinks = opts.maxLinks ?? DESCRIPTION_MAX_LINKS;
  const found = extractHtmlLinks(html);
  let plain = htmlToPlainText(html);
  // A description made only of link labels would just repeat the link list.
  const labels = found.map((l) => l.label).filter(Boolean);
  if (labels.length > 0 && !/\p{L}/u.test(labels.reduce((rest, l) => rest.split(l).join(' '), plain))) plain = '';
  const links = found.map(formatLink);
  if (!plain && links.length === 0) return null;
  const excerptTruncated = plain.length > maxChars;
  return {
    excerpt: excerptTruncated ? `${plain.slice(0, maxChars).trimEnd()}…` : plain,
    excerptTruncated,
    links: links.slice(0, maxLinks),
    hiddenLinks: Math.max(0, links.length - maxLinks),
  };
}
