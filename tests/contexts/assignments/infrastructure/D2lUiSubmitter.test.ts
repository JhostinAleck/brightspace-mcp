import { describe, expect, it, vi } from 'vitest';

import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { D2lUiSubmitter } from '@/contexts/assignments/infrastructure/D2lUiSubmitter.js';
import { createSubmissionDraft } from '@/contexts/assignments/domain/SubmissionDraft.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

/**
 * Builds a tiny mock Playwright module that satisfies the slice of the
 * surface D2lUiSubmitter actually uses. Each spec configures specific page
 * behaviours (URL after navigation, evaluate return values, etc.).
 */
interface PageStub {
  goto: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  waitForEvent: ReturnType<typeof vi.fn>;
  frames: () => Array<{ url: () => string; click: ReturnType<typeof vi.fn>; evaluate: ReturnType<typeof vi.fn>; waitForSelector: ReturnType<typeof vi.fn> }>;
}

function makeStubs(opts: {
  submitUrl?: string | null;
  fetchSubmissionsResponses?: Array<unknown[]>;
  filechooserShouldThrow?: boolean;
  hasDialogFrame?: boolean;
}): { browser: { newContext: () => Promise<unknown>; close: () => Promise<void> }; page: PageStub; closed: () => boolean } {
  let closed = false;
  const fetchResponses = [...(opts.fetchSubmissionsResponses ?? [[]])];
  const dialogFrame = opts.hasDialogFrame !== false ? {
    url: () => 'https://example.com/d2l/common/dialogs/file/main.d2l',
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(true),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
  } : null;

  const page: PageStub = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async (fnOrPath: unknown) => {
      // Two evaluate use-cases used by D2lUiSubmitter:
      //   - anchor-search for the submit URL (function signature `(fid)`)
      //   - fetchSubmissionIds (function calls `fetch(...)` internally)
      // Distinguish by inspecting the function source.
      if (typeof fnOrPath === 'function') {
        const src = (fnOrPath as () => unknown).toString();
        if (src.includes('fetch(')) {
          return fetchResponses.length > 0 ? fetchResponses.shift() : [];
        }
        if (src.includes('querySelectorAll')) {
          return opts.submitUrl ?? null;
        }
      }
      return null;
    }),
    waitForEvent: opts.filechooserShouldThrow
      ? vi.fn().mockRejectedValue(new Error('filechooser timeout'))
      : vi.fn().mockResolvedValue({ setFiles: vi.fn().mockResolvedValue(undefined) }),
    frames: () => (dialogFrame ? [dialogFrame, { url: () => 'main' } as never] : []),
  };

  const context = {
    addCookies: vi.fn().mockResolvedValue(undefined),
    newPage: async (): Promise<PageStub> => page,
  };
  const browser = {
    newContext: async (): Promise<typeof context> => context,
    close: async (): Promise<void> => { closed = true; },
  };
  return { browser, page, closed: () => closed };
}

const draft = createSubmissionDraft({
  filename: 'lab.zip',
  content: Buffer.from('zip-content'),
  mimeType: 'application/zip',
});

const submitInput = {
  courseId: createOrgUnitId('424258'),
  folderId: '405350',
  draft,
};

describe('D2lUiSubmitter', () => {
  it('throws when getToken returns a non-cookie token (e.g. api_token strategy)', async () => {
    const { browser } = makeStubs({});
    const submitter = new D2lUiSubmitter({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playwrightLoader: async () => ({ chromium: { launch: async () => browser } } as any),
      baseUrl: 'https://example.com',
      le: '1.93',
      getToken: async () => AccessToken.bearer('not-a-cookie'),
      headless: true,
    });
    await expect(submitter.submit(submitInput)).rejects.toThrow(/cookie-based auth/);
  });

  it('throws when the folder is not found in the dropbox list', async () => {
    const { browser, closed } = makeStubs({ submitUrl: null });
    const submitter = new D2lUiSubmitter({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playwrightLoader: async () => ({ chromium: { launch: async () => browser } } as any),
      baseUrl: 'https://example.com',
      le: '1.93',
      getToken: async () => AccessToken.cookie('d2lSessionVal=abc'),
      headless: true,
    });
    await expect(submitter.submit(submitInput)).rejects.toThrow(/not found in dropbox list/);
    expect(closed()).toBe(true); // browser closed in finally
  });

  it('returns a real D2L SubmissionId after the submissions API confirms a new entry', async () => {
    const baseline: unknown[] = [];
    const afterSubmit = [{
      Submissions: [{ Id: 999, SubmissionDate: '2026-05-09T20:00:00.000Z' }],
    }];
    const { browser } = makeStubs({
      submitUrl: 'https://example.com/d2l/lms/dropbox/user/folder_submit_files.d2l?db=405350&grpid=438848&ou=424258',
      // First call: baseline (empty). Second+ calls: confirms new submission.
      fetchSubmissionsResponses: [baseline, afterSubmit],
    });
    const submitter = new D2lUiSubmitter({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playwrightLoader: async () => ({ chromium: { launch: async () => browser } } as any),
      baseUrl: 'https://example.com',
      le: '1.93',
      getToken: async () => AccessToken.cookie('d2lSessionVal=abc'),
      headless: true,
      timeouts: { confirmationMs: 5_000 },
    });

    const result = await submitter.submit(submitInput);
    expect(result.submissionId).toBe('999');
    expect(result.submittedAt.toISOString()).toBe('2026-05-09T20:00:00.000Z');
  });

  it('throws if the API verification never sees a new submission', async () => {
    const baseline: unknown[] = [];
    const stuckEmpty = [...Array(20)].map(() => baseline); // never returns new
    const { browser } = makeStubs({
      submitUrl: 'https://example.com/d2l/lms/dropbox/user/folder_submit_files.d2l?db=405350&ou=424258',
      fetchSubmissionsResponses: stuckEmpty,
    });
    const submitter = new D2lUiSubmitter({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playwrightLoader: async () => ({ chromium: { launch: async () => browser } } as any),
      baseUrl: 'https://example.com',
      le: '1.93',
      getToken: async () => AccessToken.cookie('d2lSessionVal=abc'),
      headless: true,
      timeouts: { confirmationMs: 200 }, // short so the test stays fast
    });
    await expect(submitter.submit(submitInput)).rejects.toThrow(/did not appear/);
  });
});
