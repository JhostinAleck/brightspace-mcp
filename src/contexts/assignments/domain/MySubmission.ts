/** One file inside a submission the current user (or their group) made. */
export interface SubmittedFile {
  name: string;
  /** Exact size when the API reports it. */
  sizeBytes: number | null;
  /** Human size as shown by the web UI (e.g. "1.2 MB") when bytes are unknown. */
  sizeLabel: string | null;
  /** Download path, relative to the tenant base URL. */
  url: string;
}

export interface MySubmission {
  id: string;
  submittedAt: Date | null;
  /** Localized date text from the web UI when no machine date is available. */
  submittedAtLabel: string | null;
  submittedBy: string | null;
  comment: string | null;
  files: SubmittedFile[];
}

/** Newest first: submission ids grow monotonically in D2L. */
export function sortNewestFirst(subs: MySubmission[]): MySubmission[] {
  return [...subs].sort((a, b) => Number(b.id) - Number(a.id) || (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
}
