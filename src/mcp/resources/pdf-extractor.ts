export interface ExtractResult {
  [key: string]: unknown;
  contents: Array<
    | { uri: string; mimeType: 'text/plain'; text: string }
    | { uri: string; mimeType: 'application/pdf'; blob: string }
  >;
}

export async function extractTextFromBuffer(buffer: Buffer, uri: string): Promise<ExtractResult> {
  try {
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(buffer);
    if (data.text && data.text.trim().length >= 50) {
      return { contents: [{ uri, mimeType: 'text/plain', text: data.text.trim() }] };
    }
  } catch {
    // fall through to base64 fallback
  }
  return {
    contents: [
      { uri, mimeType: 'text/plain', text: 'PDF text extraction produced insufficient text. Raw file included as base64 below.' },
      { uri, mimeType: 'application/pdf', blob: buffer.toString('base64') },
    ],
  };
}
