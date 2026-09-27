import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';

export interface ExtractResult {
  [key: string]: unknown;
  contents: Array<
    | { uri: string; mimeType: 'text/plain'; text: string }
    | { uri: string; mimeType: string; blob: string }
  >;
}

/** Below this many characters a PDF is assumed to be scanned (image-only). */
const MIN_PDF_TEXT_CHARS = 50;

/** Last path segment of a resource URI, used as a format hint (".../Taller.docx"). */
function filenameHint(uri: string): string | null {
  const last = uri.slice(uri.lastIndexOf('/') + 1);
  if (!last.includes('.')) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Turn a downloaded course file into MCP resource contents. Text is extracted
 * with the shared extractor (PDF, Office, HTML, notebooks, plain text); files
 * without usable text (scanned PDFs, archives, media) are returned as base64.
 */
export async function extractTextFromBuffer(buffer: Buffer, uri: string): Promise<ExtractResult> {
  const extracted = await extractFileContent(buffer, { filename: filenameHint(uri) }).catch(() => null);
  if (extracted?.kind === 'image') {
    return { contents: [{ uri, mimeType: extracted.mimeType, blob: extracted.base64 }] };
  }
  if (extracted?.kind === 'text') {
    const text = extracted.text.trim();
    const minChars = extracted.format === 'pdf' ? MIN_PDF_TEXT_CHARS : 1;
    if (text.length >= minChars) {
      const note = extracted.truncated
        ? `\n\n[Truncated: showing ${extracted.text.length} of ${extracted.totalChars} characters.]`
        : '';
      return { contents: [{ uri, mimeType: 'text/plain', text: text + note }] };
    }
  }
  const isPdf = extracted?.format === 'pdf' || buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  const mimeType = isPdf ? 'application/pdf' : (extracted?.mimeType ?? 'application/octet-stream');
  const notice = isPdf
    ? 'PDF text extraction produced insufficient text. Raw file included as base64 below.'
    : 'No text could be extracted from this file. Raw file included as base64 below.';
  return {
    contents: [
      { uri, mimeType: 'text/plain', text: notice },
      { uri, mimeType, blob: buffer.toString('base64') },
    ],
  };
}
