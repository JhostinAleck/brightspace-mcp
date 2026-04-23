export interface SubmissionDraft {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly mimeType?: string;
}

export function createSubmissionDraft(input: {
  filename: string;
  content: Uint8Array;
  mimeType?: string;
}): SubmissionDraft {
  if (input.filename.includes('..') || input.filename.includes('/') || input.filename.includes('\\')) {
    throw new Error(`invalid filename (path traversal): ${input.filename}`);
  }
  if (input.filename.length === 0 || input.filename.length > 255) {
    throw new Error(`filename must be 1-255 chars`);
  }
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
