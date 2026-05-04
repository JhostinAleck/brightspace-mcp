import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

// Minimal Playwright interface — defined locally to avoid cross-context imports
interface PlaywrightCookieParam { name: string; value: string; domain: string; path: string }
interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  content(): Promise<string>;
}
interface PlaywrightBrowserContext {
  addCookies(cookies: PlaywrightCookieParam[]): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
}
interface PlaywrightBrowser {
  newContext(): Promise<PlaywrightBrowserContext>;
  close(): Promise<void>;
}
export type PlaywrightLoader = () => Promise<{ chromium: { launch(opts?: { headless?: boolean }): Promise<PlaywrightBrowser> } }>;

export class PlaywrightPageRenderer {
  constructor(
    private readonly loader: PlaywrightLoader,
    private readonly getToken: () => Promise<AccessToken>,
    private readonly baseUrl: string,
  ) {}

  async getRenderedHtml(path: string): Promise<string> {
    const token = await this.getToken();
    if (token.kind !== 'cookie') return '';

    const pw = await this.loader();
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const domain = new URL(this.baseUrl).hostname;
      const cookies: PlaywrightCookieParam[] = token.reveal().split('; ').flatMap((pair) => {
        const eq = pair.indexOf('=');
        if (eq < 1) return [];
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1);
        return name && value ? [{ name, value, domain, path: '/' }] : [];
      });

      const ctx = await browser.newContext();
      await ctx.addCookies(cookies);
      const page = await ctx.newPage();
      await page.goto(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        waitUntil: 'load',
        timeout: 30_000,
      });
      // Wait for JS components to render (Brightspace SPA does continuous polling
      // so 'networkidle' never fires; a fixed delay after 'load' is more reliable)
      await page.waitForTimeout(5000);
      return await page.content();
    } finally {
      await browser.close();
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
}
