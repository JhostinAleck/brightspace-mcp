export interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
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
      const moduleName = 'playwright';
      const mod = (await import(moduleName)) as unknown as PlaywrightModule;
      return mod;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Playwright is not available (${message}). Install with "npm install playwright" and run "npx playwright install chromium", or use another auth strategy.`,
      );
    }
  };
}
