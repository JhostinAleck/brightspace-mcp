import { describe, it, expect } from 'vitest';
import { PlaywrightPageRenderer } from '@/contexts/http-api/PlaywrightPageRenderer';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';

const neverLoader = async () => { throw new Error('should not be called'); };

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
    };
    const fakeCtx = {
      addCookies: async () => {},
      newPage: async () => fakePage,
    };
    const fakeBrowser = {
      newContext: async () => fakeCtx,
      close: async () => {},
    };
    const fakeModule = { chromium: { launch: async () => fakeBrowser } };
    const loader = async () => fakeModule;

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('d2lSessionVal=abc; d2lSecureSessionVal=xyz'),
      'https://learn.example.edu/',
    );

    const html = await renderer.getRenderedHtml('/d2l/some/page');
    expect(html).toContain('Hello World');
    expect(pages[0]).toContain('/d2l/some/page');
  });

  it('getRenderedText strips HTML tags and scripts', async () => {
    const fakePage = {
      goto: async () => {},
      waitForTimeout: async () => {},
      content: async () => '<html><head><script>alert(1)</script><style>body{}</style></head><body><h1>Title</h1><p>Content here</p></body></html>',
    };
    const fakeCtx = { addCookies: async () => {}, newPage: async () => fakePage };
    const fakeBrowser = { newContext: async () => fakeCtx, close: async () => {} };
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

  it('closes browser even when page.goto throws', async () => {
    let closed = false;
    const fakeBrowser = {
      newContext: async () => ({
        addCookies: async () => {},
        newPage: async () => ({ goto: async () => { throw new Error('nav failed'); }, waitForTimeout: async () => {}, content: async () => '' }),
      }),
      close: async () => { closed = true; },
    };
    const loader = async () => ({ chromium: { launch: async () => fakeBrowser } });

    const renderer = new PlaywrightPageRenderer(
      loader as never,
      async () => AccessToken.cookie('session=abc'),
      'https://example.com/',
    );

    await expect(renderer.getRenderedHtml('/fail')).rejects.toThrow('nav failed');
    expect(closed).toBe(true);
  });
});
