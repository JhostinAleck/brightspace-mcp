import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import type { PlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import type { SubmitInput, SubmitResult } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

/**
 * Selectors for each step of the submit-form drive. Every field is optional
 * because the defaults work for stock English Brightspace; tenants with custom
 * UIs can override individual steps without redefining the whole flow.
 *
 * Each entry is treated as a Playwright locator string — both CSS (`button#submit`,
 * `[data-d2l-id=add]`) and Playwright pseudo-selectors (`button:has-text("...")`)
 * are accepted.
 */
export interface UiSubmitSelectors {
  /** Main page button that opens the upload dialog. */
  addFileButton?: string;
  /** Link/tab inside the dialog that switches to "upload from local". */
  myComputerLink?: string;
  /** Button that triggers the OS file picker (Playwright intercepts via filechooser). */
  uploadButton?: string;
  /** Footer button in the dialog to commit the selected file to the form. */
  commitButton?: string;
  /** Main page button to send the submission. */
  submitButton?: string;
  /**
   * Optional confirmation modal button shown by some D2L tenants after the
   * primary Submit click ("Confirm Submission" style). Best-effort — failure
   * to find this button is silently ignored.
   */
  confirmButton?: string;
}

const DEFAULT_SELECTORS: Required<UiSubmitSelectors> = {
  // English-first because we force Accept-Language: en-US on the browser context
  // (see opts.forceLocale below). Each selector falls back to known translations
  // so a tenant that overrides browser locale still works without config.
  addFileButton: [
    'button:has-text("Add a File")',
    'button:has-text("Agregar un archivo")',
    'button:has-text("Anexar arquivo")',
    'button:has-text("Ajouter un fichier")',
  ].join(', '),
  myComputerLink: [
    'a[title="My Computer"]',
    'a[title="Mi PC"]',
    'a[title="Meu computador"]',
    'a[title="Mon ordinateur"]',
  ].join(', '),
  uploadButton: [
    'button:has-text("Upload")',
    'button:has-text("Cargar")',
    'button:has-text("Carregar")',
    'button:has-text("Téléverser")',
  ].join(', '),
  commitButton: [
    // Exclude the outer "Add a File" trigger so we don't re-open the dialog.
    'button:has-text("Add"):not(:has-text("Add a File"))',
    'button:has-text("Agregar"):not(:has-text("Agregar un archivo"))',
    'button:has-text("Adicionar"):not(:has-text("Anexar"))',
    'button:has-text("Ajouter"):not(:has-text("Ajouter un fichier"))',
  ].join(', '),
  submitButton: [
    // Exclude page section headers like "Submit Activity" that contain the word.
    'button:has-text("Submit"):not(:has-text("Submit Activity"))',
    'button:has-text("Enviar"):not(:has-text("Enviar actividad"))',
  ].join(', '),
  confirmButton: [
    'button:has-text("Submit Files")',
    'button:has-text("Confirm")',
    'button:has-text("Yes, Submit")',
    'button:has-text("Confirmar")',
    'button:has-text("Sí, Enviar")',
  ].join(', '),
};

export interface D2lUiSubmitterDeps {
  playwrightLoader: PlaywrightLoader;
  baseUrl: string;
  /** D2L LE API version (e.g. "1.93"). Used to verify the submission afterwards. */
  le: string;
  getToken: () => Promise<AccessToken>;
  headless: boolean;
  /**
   * Per-step selector overrides. Configured via YAML — see
   * `profile.ui_submit.selectors`. Anything not provided falls back to the
   * built-in English-first defaults.
   */
  selectors?: UiSubmitSelectors;
  /**
   * Force the Playwright context to render Brightspace in this locale.
   * Defaults to `en-US`, which keeps the built-in selectors deterministic.
   * Set to `null` to inherit the user's profile locale.
   */
  forceLocale?: string | null;
  /** Override timeouts for slow tenants. Defaults are conservative. */
  timeouts?: {
    pageLoadMs?: number;
    uploadMs?: number;
    confirmationMs?: number;
  };
}

/**
 * Drive Brightspace's web-UI submit form via Playwright.
 *
 * Why this exists: many Brightspace tenants disable the public Valence
 * student-side dropbox-submission API (`/dropbox/folders/{id}/submissions/
 * mysubmissions/`). The UI uses different internal endpoints that are always
 * enabled because they serve the actual user interface. We replay those by
 * scripting the browser.
 *
 * Auth model: this service does NOT log in. It expects cookies from the
 * existing AuthStrategy chain (typically `browser` or `session_cookie`). It
 * spawns a fresh Playwright context, injects the cookies, then drives the UI.
 *
 * Group vs individual: the folders_list page links to each folder with the
 * appropriate `grpid` query parameter (or omits it for individual). We follow
 * that link rather than building the URL ourselves, so we don't need to know
 * up-front whether the assignment is grouped.
 */
export class D2lUiSubmitter {
  private readonly pageLoadMs: number;
  private readonly uploadMs: number;
  private readonly confirmationMs: number;
  private readonly selectors: Required<UiSubmitSelectors>;
  private readonly locale: string | null;

  constructor(private readonly opts: D2lUiSubmitterDeps) {
    this.pageLoadMs = opts.timeouts?.pageLoadMs ?? 60_000;
    this.uploadMs = opts.timeouts?.uploadMs ?? 120_000;
    this.confirmationMs = opts.timeouts?.confirmationMs ?? 60_000;
    this.selectors = { ...DEFAULT_SELECTORS, ...opts.selectors };
    this.locale = opts.forceLocale === undefined ? 'en-US' : opts.forceLocale;
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    const token = await this.opts.getToken();
    if (token.kind !== 'cookie') {
      throw new Error(
        'D2lUiSubmitter requires cookie-based auth (browser or session_cookie strategy). ' +
        `Got: ${token.kind}`,
      );
    }

    const courseId = OrgUnitId.toNumber(input.courseId);
    const folderIdNum = Number(input.folderId);
    if (!Number.isFinite(folderIdNum)) {
      throw new Error(`folder_id must be numeric, got: ${input.folderId}`);
    }
    const submissionsPath = `/d2l/api/le/${this.opts.le}/${courseId}/dropbox/folders/${folderIdNum}/submissions/mysubmissions/`;

    const pw = await this.opts.playwrightLoader();
    // The lazy-playwright wrapper exposes a narrow type, so we widen here for
    // chromium.launch options and addCookies, both of which are stable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromium = (pw as any).chromium;
    const browser = await chromium.launch({ headless: this.opts.headless });

    try {
      // Force locale + Accept-Language header so D2L renders its UI
      // deterministically (defaults to en-US, override via opts.forceLocale).
      // Tenants whose login portal hard-overrides the browser locale can pass
      // null to skip this and configure custom selectors per locale instead.
      const contextOpts: Record<string, unknown> = {};
      if (this.locale) {
        contextOpts['locale'] = this.locale;
        contextOpts['extraHTTPHeaders'] = {
          'Accept-Language': `${this.locale},${this.locale.split('-')[0]};q=0.9`,
        };
      }
      const context = await browser.newContext(contextOpts);
      // Inject cookies from the AccessToken so we don't re-authenticate.
      const cookies = parseCookieHeader(token.reveal(), new URL(this.opts.baseUrl).hostname);
      await context.addCookies(cookies);

      const page = await context.newPage();

      // Step 0: snapshot existing submissions BEFORE we drive the UI, so we
      // can identify ours afterwards by diffing the list. This handles both
      // first-time submissions and re-submissions to the same folder.
      const baseline = await this.fetchSubmissionIds(page, submissionsPath);

      // Step 1: navigate to the folder list to discover the submit URL.
      // This handles individual + group automatically — the link includes
      // `grpid` if the assignment is grouped, omits it otherwise.
      const folderListUrl = `${this.opts.baseUrl}/d2l/lms/dropbox/user/folders_list.d2l?ou=${courseId}`;
      await page.goto(folderListUrl, { waitUntil: 'networkidle', timeout: this.pageLoadMs });

      const submitUrl: string | null = await page.evaluate((fid: number) => {
        const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
        const match = links.find((a) => a.href.includes(`db=${fid}`) && a.href.includes('folder_submit_files.d2l'));
        return match ? match.href : null;
      }, folderIdNum);

      if (!submitUrl) {
        throw new Error(`Folder ${folderIdNum} not found in dropbox list — check course/folder IDs`);
      }

      // Step 2: navigate to the actual submit form.
      await page.goto(submitUrl, { waitUntil: 'networkidle', timeout: this.pageLoadMs });

      // Step 3: open the file picker dialog.
      try {
        await page.click(this.selectors.addFileButton, { timeout: 5_000 });
      } catch {
        throw new Error(`"Add a File" button not found (selector: ${this.selectors.addFileButton})`);
      }

      // Step 4: wait for the dialog iframe.
      // D2L injects an iframe pointing to /d2l/common/dialogs/file/main.d2l
      const dialogFrame = await this.waitForDialogFrame(page);
      if (!dialogFrame) throw new Error('Upload dialog iframe did not load');

      // Step 5: switch the dialog to "upload from local computer".
      // The link is a11y-offscreen so we click it via JS dispatch.
      const myCompSelector = this.selectors.myComputerLink;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clicked = await (dialogFrame as any).evaluate((sel: string) => {
        const link = document.querySelector(sel) as HTMLElement | null;
        if (link) { link.click(); return true; }
        return false;
      }, myCompSelector);
      if (!clicked) throw new Error(`"My Computer" link not found (selector: ${myCompSelector})`);
      await page.waitForTimeout(2_500);

      // Step 6: trigger the OS file dialog and intercept it via filechooser.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uploadClick = (dialogFrame as any).click(this.selectors.uploadButton);
      const [fileChooser] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (page as any).waitForEvent('filechooser', { timeout: 10_000 }),
        uploadClick,
      ]);
      await fileChooser.setFiles({
        name: input.draft.filename,
        mimeType: input.draft.mimeType ?? 'application/octet-stream',
        buffer: Buffer.from(input.draft.content),
      });

      // Step 7: wait for the file to appear in the dialog (upload complete).
      const escapedName = input.draft.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (dialogFrame as any).waitForSelector(`text=/${escapedName}/`, { timeout: this.uploadMs });
      } catch {
        // Best-effort. Big files may need more time; we still try to commit below.
      }
      await page.waitForTimeout(2_000);

      // Step 8: commit the selection. The footer button typically lives inside
      // the dialog iframe; some D2L versions render it on the main page.
      let committed = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (dialogFrame as any).click(this.selectors.commitButton, { timeout: 5_000 });
        committed = true;
      } catch { /* try main page */ }
      if (!committed) {
        try {
          await page.click(this.selectors.commitButton, { timeout: 3_000 });
          committed = true;
        } catch { /* fall through */ }
      }
      if (!committed) {
        throw new Error(`"Add" commit button not found (selector: ${this.selectors.commitButton})`);
      }
      await page.waitForTimeout(4_000);

      // Step 9: click the final Submit button. (We don't pre-check that the
      // file got staged on the form — the API verification in step 11 is the
      // source of truth and catches silent failures.)
      try {
        await page.click(this.selectors.submitButton, { timeout: 5_000 });
      } catch {
        throw new Error(`"Submit" button not found (selector: ${this.selectors.submitButton})`);
      }

      // Step 9b: some tenants show a "Confirm submission" modal after the
      // primary Submit click. Best-effort — selector is configurable and
      // failure is silently ignored (most tenants skip this step).
      await page.waitForTimeout(1_500);
      try {
        await page.click(this.selectors.confirmButton, { timeout: 3_000 });
      } catch { /* no confirmation step on this tenant */ }

      // Step 10: poll the submissions API to confirm a new submission
      // landed. This is far more reliable than scraping the page for a
      // success message — D2L's UI varies (some tenants show a toast, some
      // navigate, some reset the form), but the API is consistent.
      const deadline = Date.now() + this.confirmationMs;
      while (Date.now() < deadline) {
        const current = await this.fetchSubmissionIds(page, submissionsPath);
        const newOnes = current.filter((s) => !baseline.find((b) => b.id === s.id));
        if (newOnes.length > 0) {
          // Pick the most recent new submission.
          const latest = newOnes.reduce((a, b) => (a.submittedAt > b.submittedAt ? a : b));
          return { submissionId: String(latest.id), submittedAt: latest.submittedAt };
        }
        await page.waitForTimeout(2_000);
      }
      throw new Error('Submission did not appear in /submissions/mysubmissions/ within timeout — UI flow likely failed silently');
    } finally {
      await browser.close();
    }
  }

  /**
   * Query `/dropbox/folders/{id}/submissions/mysubmissions/` from inside the
   * browser context (so cookies + XSRF flow naturally) and return the flat
   * list of submission IDs + timestamps. Used to detect new submissions by
   * diffing before/after the UI flow.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchSubmissionIds(page: any, path: string): Promise<Array<{ id: number; submittedAt: Date }>> {
    try {
      const raw = await page.evaluate(async (p: string) => {
        const res = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        return res.json();
      }, path);
      // Response shape: [{ Entity: {...}, Submissions: [{ Id, SubmissionDate, ... }] }, ...]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: Array<{ id: number; submittedAt: Date }> = [];
      for (const entity of (raw as Array<{ Submissions?: Array<{ Id?: number; SubmissionDate?: string }> }> ?? [])) {
        for (const sub of entity.Submissions ?? []) {
          if (typeof sub.Id === 'number' && sub.SubmissionDate) {
            out.push({ id: sub.Id, submittedAt: new Date(sub.SubmissionDate) });
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * D2L injects an iframe pointing to `/d2l/common/dialogs/file/main.d2l`
   * after clicking "Add a File". The iframe takes a moment to navigate from
   * the initial blank.html. We poll until it's loaded.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async waitForDialogFrame(page: any): Promise<any | null> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame = page.frames().find((f: any) => f.url().includes('/d2l/common/dialogs/file/'));
      if (frame) return frame;
      await page.waitForTimeout(500);
    }
    return null;
  }
}

function parseCookieHeader(
  header: string,
  domain: string,
): Array<{ name: string; value: string; domain: string; path: string }> {
  const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) cookies.push({ name, value, domain, path: '/' });
  }
  return cookies;
}
