// Reserved Windows device names that must not be used as filenames even with
// extensions — `CON.txt` triggers the same issue as bare `CON`.
const RESERVED_WINDOWS_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export interface SubmissionDraft {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly mimeType?: string;
}

function validateFilename(filename: string): void {
  if (filename.length === 0 || filename.length > 255) {
    throw new Error(`filename must be 1-255 chars`);
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error(`invalid filename (path traversal): ${filename}`);
  }
  if (filename.includes('\0')) {
    throw new Error(`invalid filename (null byte): ${filename}`);
  }
  if (filename.endsWith('.') || filename.endsWith(' ')) {
    throw new Error(`invalid filename (trailing dot or space): ${filename}`);
  }
  const stem = filename.split('.')[0]?.toUpperCase() ?? '';
  if (RESERVED_WINDOWS_NAMES.has(stem)) {
    throw new Error(`invalid filename (reserved Windows device name): ${filename}`);
  }
}

export function createSubmissionDraft(input: {
  filename: string;
  content: Uint8Array;
  mimeType?: string;
}): SubmissionDraft {
  validateFilename(input.filename);
  if (input.content.byteLength === 0) {
    throw new Error(`content is empty`);
  }
  const draft: SubmissionDraft = {
    filename: input.filename,
    content: input.content,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
  };
  return draft;
}
