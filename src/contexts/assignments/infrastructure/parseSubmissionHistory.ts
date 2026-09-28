import type { MySubmission, SubmittedFile } from '@/contexts/assignments/domain/MySubmission.js';
import { decodeHtmlEntities } from '@/shared-kernel/text/decodeHtmlEntities.js';

/**
 * The folder list links each folder to its submission history page. Group
 * folders carry the group id; individual folders use `grpid=0`. The history
 * page fails (HTTP 500) without it, so the link is the only reliable source.
 */
export function findHistoryGroupId(folderListHtml: string, folderId: number): string | null {
  const re = new RegExp(`folders_history\\.d2l\\?db=${folderId}(?:&amp;|&)grpid=(\\d+)`);
  return re.exec(folderListHtml)?.[1] ?? null;
}

function text(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const FILE_LINK =
  /<a\s[^>]*href="(\/d2l\/common\/viewFile\.d2lfile\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*(?:<span[^>]*>([\s\S]*?)<\/span>)?/g;

function parseFiles(rowHtml: string): SubmittedFile[] {
  const files: SubmittedFile[] = [];
  for (const m of rowHtml.matchAll(FILE_LINK)) {
    const url = decodeHtmlEntities(m[1] ?? '');
    const name = text(m[2] ?? '') || decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
    const size = text(m[3] ?? '').replace(/^\((.*)\)$/, '$1').trim();
    files.push({ name, sizeBytes: null, sizeLabel: size || null, url });
  }
  return files;
}

function parseComment(rowHtml: string): string | null {
  const m = /<d2l-html-block\s[^>]*html="([^"]*)"/.exec(rowHtml);
  if (!m) return null;
  return text(decodeHtmlEntities(m[1] ?? '')) || null;
}

/**
 * Parse the submission history grid of `folders_history.d2l` — the only
 * student-visible listing once a folder closes (the Valence
 * `mysubmissions` route answers 403 then). Columns: submission id, files
 * (+ optional comment), submitter (group folders only), date.
 */
export function parseSubmissionHistory(html: string): MySubmission[] {
  const start = html.search(/<table[^>]*d2l-grid/);
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? undefined : end);
  const out: MySubmission[] = [];
  for (const row of table.split(/<tr\b/).slice(1)) {
    if (row.includes('<th')) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1] ?? '');
    const id = text(cells[0] ?? '');
    if (!/^\d+$/.test(id)) continue;
    const submitterCell = cells.find((c) => /EmailUser\(/.test(c));
    out.push({
      id,
      submittedAt: null,
      submittedAtLabel: cells.length > 2 ? text(cells[cells.length - 1] ?? '') || null : null,
      submittedBy: submitterCell ? text(submitterCell) || null : null,
      comment: parseComment(row),
      files: parseFiles(row),
    });
  }
  return out;
}
