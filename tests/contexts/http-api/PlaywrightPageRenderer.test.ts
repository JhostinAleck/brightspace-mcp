import { describe, it, expect } from 'vitest';
import { PlaywrightPageRenderer } from '@/contexts/http-api/PlaywrightPageRenderer';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';

const neverLoader = async () => { throw new Error('should not be called'); };

function makeFakePage(content: string) {
  return {
    goto: async (_url: string) => {},
    waitForTimeout: async () => {},
    content: async () => content,
    close: async () => {},
  };
}

describe('PlaywrightPageRenderer', () => {
  it('returns empty string when token is bearer (not cookie)', async () => {
    const renderer = new PlaywrightPageRenderer(
      neverLoader as never,
      async () => AccessToken.bearer('tok'),
      'https://example.brightspace.com/',
    );
    const result = await renderer.getRenderedHtml('/some/path');
    expect(result).toBe('');
  });

  it('getRenderedText returns empty string when token is bearer', async () => {
    const renderer = new PlaywrightPageRenderer(
      neverLoader as never,
      async () => AccessToken.bearer('tok'),
      'https://example.brightspace.com/',
    );
    const result = await renderer.getRenderedText('/some/path');
    expect(result).toBe('');
  });

  it('calls loader and sets cookies when token is cookie type', async () => {
    const pages: string[] = [];
    const fakePage = {
      goto: async (url: string) => { pages.push(url); },
      waitForTimeout: async () => {},
      content: async () => '<html><body>Hello World</body></html>',
      close: async () => {},
    };
    const fakeCtx = {
      addCookies: async () => {},
      newPage: async () => fakePage,
      close: async () => {},
    };
    const fakeBrowser = {
      newContext: async () => fakeCtx,
      close: async () => {},
      isConnected: () => true,
    };
    const fakeModule = { chromium: { launch: async () => fakeBrowser } };
    const loader = async () => fakeModule;

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('d2lSessionVal=abc; d2lSecureSessionVal=xyz'),
      'https://bloqueneon.uniandes.edu.co/',
    );

    const html = await renderer.getRenderedHtml('/d2l/some/page');
    expect(html).toContain('Hello World');
    expect(pages[0]).toContain('/d2l/some/page');
  });

  it('getRenderedText strips HTML tags and scripts', async () => {
    const fakePage = makeFakePage('<html><head><script>alert(1)</script><style>body{}</style></head><body><h1>Title</h1><p>Content here</p></body></html>');
    const fakeCtx = { addCookies: async () => {}, newPage: async () => fakePage, close: async () => {} };
    const fakeBrowser = { newContext: async () => fakeCtx, close: async () => {}, isConnected: () => true };
    const loader = async () => ({ chromium: { launch: async () => fakeBrowser } });

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('session=abc'),
      'https://example.com/',
    );

    const text = await renderer.getRenderedText('/page');
    expect(text).toContain('Title');
    expect(text).toContain('Content here');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('<h1>');
  });

  it('closes the per-call context even when page.goto throws', async () => {
    let ctxClosed = false;
    const fakeBrowser = {
      newContext: async () => ({
        addCookies: async () => {},
        newPage: async () => ({
          goto: async () => { throw new Error('nav failed'); },
          waitForTimeout: async () => {},
          content: async () => '',
          close: async () => {},
        }),
        close: async () => { ctxClosed = true; },
      }),
      close: async () => {},
      isConnected: () => true,
    };
    const loader = async () => ({ chromium: { launch: async () => fakeBrowser } });

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('session=abc'),
      'https://example.com/',
    );

    await expect(renderer.getRenderedHtml('/fail')).rejects.toThrow('nav failed');
    expect(ctxClosed).toBe(true);
  });

  it('reuses the browser instance across calls and disposes on shutdown', async () => {
    let launches = 0;
    let browserClosed = false;
    const fakeBrowser = {
      newContext: async () => ({
        addCookies: async () => {},
        newPage: async () => makeFakePage('<html></html>'),
        close: async () => {},
      }),
      close: async () => { browserClosed = true; },
      isConnected: () => true,
    };
    const loader = async () => {
      launches++;
      return { chromium: { launch: async () => fakeBrowser } };
    };

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('session=abc'),
      'https://example.com/',
    );

    await renderer.getRenderedHtml('/a');
    await renderer.getRenderedHtml('/b');
    expect(launches).toBe(1);
    await renderer.dispose();
    expect(browserClosed).toBe(true);
  });
});
