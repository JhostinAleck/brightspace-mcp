import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

// Minimal Playwright interface — defined locally to avoid cross-context imports
interface PlaywrightCookieParam { name: string; value: string; domain: string; path: string }
interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
  close(): Promise<void>;
}
interface PlaywrightBrowserContext {
  addCookies(cookies: PlaywrightCookieParam[]): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}
interface PlaywrightBrowser {
  newContext(): Promise<PlaywrightBrowserContext>;
  close(): Promise<void>;
  isConnected?(): boolean;
}
export type PlaywrightLoader = () => Promise<{ chromium: { launch(opts?: { headless?: boolean }): Promise<PlaywrightBrowser> } }>;

/**
 * Playwright-backed renderer with a reusable browser singleton.
 *
 * Previous behaviour launched a fresh Chromium instance per render — a
 * ~2s cold-start tax for every topic file. We now keep one browser alive
 * for the lifetime of the process and create per-request browser contexts
 * (cheap) so cookies don't leak between calls. `dispose()` is registered
 * on graceful shutdown so the Chromium child process exits cleanly.
 */
export class PlaywrightPageRenderer {
  private browserPromise: Promise<PlaywrightBrowser> | null = null;

  constructor(
    private readonly loader: PlaywrightLoader,
    private readonly getToken: () => Promise<AccessToken>,
    private readonly baseUrl: string,
  ) {}

  private async browser(): Promise<PlaywrightBrowser> {
    if (this.browserPromise) {
      const existing = await this.browserPromise;
      if (typeof existing.isConnected === 'function' && existing.isConnected()) return existing;
      this.browserPromise = null;
    }
    this.browserPromise = (async () => {
      const pw = await this.loader();
      return pw.chromium.launch({ headless: true });
    })();
    return this.browserPromise;
  }

  async getRenderedHtml(path: string): Promise<string> {
    const token = await this.getToken();
    if (token.kind !== 'cookie') return '';

    const browser = await this.browser();
    const domain = new URL(this.baseUrl).hostname;
    const cookies: PlaywrightCookieParam[] = token.reveal().split('; ').flatMap((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 1) return [];
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      return name && value ? [{ name, value, domain, path: '/' }] : [];
    });

    const ctx = await browser.newContext();
    try {
      await ctx.addCookies(cookies);
      const page = await ctx.newPage();
      try {
        await page.goto(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
          waitUntil: 'load',
          timeout: 30_000,
        });
        // Wait for JS components to render (Brightspace SPA does continuous polling
        // so 'networkidle' never fires; a fixed delay after 'load' is more reliable)
        await page.waitForTimeout(5000);
        return await page.content();
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  async getRenderedText(path: string): Promise<string> {
    const html = await this.getRenderedHtml(path);
    if (!html) return '';
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
               .replace(/<[^>]+>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim()
               .slice(0, 8000);
  }

  async dispose(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      /* best-effort */
    } finally {
      this.browserPromise = null;
    }
  }
}
