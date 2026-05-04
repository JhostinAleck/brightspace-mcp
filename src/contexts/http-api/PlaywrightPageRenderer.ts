import type { PlaywrightLoader, PlaywrightCookieParam } from '@/contexts/authentication/infrastructure/strategies/lazy-playwright.js';
import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';

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
        waitUntil: 'networkidle',
        timeout: 30_000,
      });
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
