export interface PlaywrightCookieParam {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface PlaywrightBrowserContext {
  addCookies(cookies: PlaywrightCookieParam[]): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

export interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  newContext(): Promise<PlaywrightBrowserContext>;
  close(): Promise<void>;
}

export interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<void>;
  content(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;
  context(): { cookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>> };
  close(): Promise<void>;
}

export interface PlaywrightModule {
  chromium: {
    launch(opts?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
}

export type PlaywrightLoader = () => Promise<PlaywrightModule>;

export function createPlaywrightLoader(
  inner?: () => Promise<PlaywrightModule>,
): PlaywrightLoader {
  return async () => {
    try {
      if (inner) return await inner();
      // Use createRequire to load playwright as CJS — avoids ESM/CJS interop issues
      // where dynamic import() wraps the module differently depending on the runtime context.
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      return require('playwright') as PlaywrightModule;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Playwright is not available (${message}). Install with "npm install playwright" and run "npx playwright install chromium", or use another auth strategy.`,
      );
    }
  };
}
