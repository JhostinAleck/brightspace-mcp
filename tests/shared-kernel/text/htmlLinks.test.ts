import { describe, expect, it } from 'vitest';

import {
  extractHtmlLinks,
  htmlToPlainText,
  htmlToText,
  resolveContentUrl,
  stripD2lSessionParams,
} from '@/shared-kernel/text/htmlLinks.js';

const BASE = '/content/enforced/486307-202620_ISIS3510_5/1_RECURSOS/Welcome/Welcome.html';

describe('stripD2lSessionParams', () => {
  it('drops d2lSessionVal and the bare "_" params D2L appends', () => {
    expect(stripD2lSessionParams('/content/enforced/1-X/a%20b.png?_&d2lSessionVal=abc&_&d2lSessionVal=def'))
      .toBe('/content/enforced/1-X/a%20b.png');
  });

  it('keeps unrelated query params', () => {
    expect(stripD2lSessionParams('/content/enforced/1-X/s.pdf?isCourseFile=true&d2lSessionVal=x'))
      .toBe('/content/enforced/1-X/s.pdf?isCourseFile=true');
  });

  it('works on absolute URLs', () => {
    expect(stripD2lSessionParams('https://school.example/content/enforced/1-X/f.pdf?d2lSessionVal=zz'))
      .toBe('https://school.example/content/enforced/1-X/f.pdf');
  });
});

describe('resolveContentUrl', () => {
  it('resolves a relative link against the directory of the page it came from', () => {
    expect(resolveContentUrl('files/Lab1.pdf', BASE))
      .toBe('/content/enforced/486307-202620_ISIS3510_5/1_RECURSOS/Welcome/files/Lab1.pdf');
  });

  it('handles ../ segments', () => {
    expect(resolveContentUrl('../Slides/C1.pdf', BASE))
      .toBe('/content/enforced/486307-202620_ISIS3510_5/1_RECURSOS/Slides/C1.pdf');
  });

  it('leaves root-relative and absolute URLs untouched', () => {
    expect(resolveContentUrl('/content/enforced/1-X/a.pdf', BASE)).toBe('/content/enforced/1-X/a.pdf');
    expect(resolveContentUrl('https://youtu.be/abc', BASE)).toBe('https://youtu.be/abc');
    expect(resolveContentUrl('mailto:prof@example.edu', BASE)).toBe('mailto:prof@example.edu');
  });

  it('resolves against an absolute base URL', () => {
    expect(resolveContentUrl('b.pdf', 'https://school.example/content/enforced/1-X/dir/page.html'))
      .toBe('https://school.example/content/enforced/1-X/dir/b.pdf');
  });

  it('returns the raw value when there is no base', () => {
    expect(resolveContentUrl('b.pdf', null)).toBe('b.pdf');
  });
});

describe('extractHtmlLinks', () => {
  it('collects anchors, iframes, embeds and <object>/<param> media sources, deduplicated', () => {
    const html = `
      <p><a href="/content/enforced/1-X/Programa.pdf" target="_blank">Programa Curso</a></p>
      <iframe src="/content/enforced/1-X/Slides.pdf?d2lSessionVal=abc"></iframe>
      <object data="/content/enforced/1-X/video.mov"><param name="src" value="/content/enforced/1-X/video.mov"/>
        <a href="/content/enforced/1-X/video.mov">/content/enforced/999-OLD/video.mov</a></object>
      <embed src="clip.mp4">
      <a href="javascript:void(0)">nope</a>
      <a href="#top">anchor</a>
      <img src="/content/enforced/1-X/banner.png">`;
    const links = extractHtmlLinks(html, { baseUrl: '/content/enforced/1-X/page.html' });
    expect(links).toEqual([
      { label: 'Programa Curso', url: '/content/enforced/1-X/Programa.pdf', kind: 'link' },
      { label: '', url: '/content/enforced/1-X/Slides.pdf', kind: 'embed' },
      { label: '', url: '/content/enforced/1-X/video.mov', kind: 'embed' },
      { label: '', url: '/content/enforced/1-X/clip.mp4', kind: 'embed' },
    ]);
  });

  it('decodes entities in labels and hrefs', () => {
    const links = extractHtmlLinks('<a href="/a?x=1&amp;y=2">Cap&#237;tulo 1</a>');
    expect(links).toEqual([{ label: 'Capítulo 1', url: '/a?x=1&y=2', kind: 'link' }]);
  });
});

describe('htmlToPlainText', () => {
  it('returns visible text only, collapsed', () => {
    expect(htmlToPlainText('<p>Cap&iacute;tulo <a href="/x.pdf">uno</a></p>\n<style>p{}</style><p>dos</p>'))
      .toBe('Capítulo uno dos');
  });
});

describe('htmlToText', () => {
  it('keeps block structure as newlines and preserves resolved link targets', () => {
    const html = '<h4>OBJECTIVE</h4><p>Build <strong>mobile</strong> apps.</p><ul><li>One</li><li>Two</li></ul>' +
      '<p><a href="files/Lab1.pdf">Lab 1</a></p>';
    const out = htmlToText(html, { baseUrl: BASE });
    expect(out).toContain('OBJECTIVE\nBuild mobile apps.');
    expect(out).toContain('- One\n- Two');
    expect(out).toContain('Lab 1 (/content/enforced/486307-202620_ISIS3510_5/1_RECURSOS/Welcome/files/Lab1.pdf)');
  });

  it('lists embedded resources (iframes/media) that have no anchor text', () => {
    const out = htmlToText('<p>Watch:</p><iframe src="/content/enforced/1-X/Slides.pdf"></iframe>');
    expect(out).toContain('Watch:');
    expect(out).toContain('Embedded resources:');
    expect(out).toContain('/content/enforced/1-X/Slides.pdf');
  });

  it('drops anchor labels that are stale raw paths, keeping the real target', () => {
    const out = htmlToText('<p><a href="/content/enforced/1-NEW/v.mov">/content/enforced/9-OLD/v.mov</a></p><p>Clip 01</p>');
    expect(out).toBe('/content/enforced/1-NEW/v.mov\nClip 01');
  });

  it('drops scripts, styles and session tokens', () => {
    const out = htmlToText('<style>p{}</style><script>var x=1</script><a href="/c/f.pdf?d2lSessionVal=S3CR3T">f</a>');
    expect(out).toBe('f (/c/f.pdf)');
  });
});
