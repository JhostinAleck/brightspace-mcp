import { describe, it, expect } from 'vitest';
import { stripHtmlPreservingLinks } from '@/shared-kernel/text/stripHtml.js';

describe('stripHtmlPreservingLinks', () => {
  it('keeps the href alongside the link text instead of discarding it', () => {
    const html = '<p><a href="https://uniandes.zoom.us/j/123">Join Zoom</a></p>';
    expect(stripHtmlPreservingLinks(html)).toBe('Join Zoom (https://uniandes.zoom.us/j/123)');
  });

  it('reproduces the real "check the syllabus here" case (relative href, no domain)', () => {
    const html = '<a href="1_RECURSOS_DE_CONTENIDO/Welcome/ISIS3510-syllabus.pdf?isCourseFile=true&ou=486307">¡¡ CHECK THE SYLLABUS HERE !!</a>';
    expect(stripHtmlPreservingLinks(html)).toBe(
      '¡¡ CHECK THE SYLLABUS HERE !! (1_RECURSOS_DE_CONTENIDO/Welcome/ISIS3510-syllabus.pdf?isCourseFile=true&ou=486307)',
    );
  });

  it('strips nested tags inside the link label but keeps the text', () => {
    const html = '<a href="/x.docx"><strong>Programa</strong> del curso</a>';
    expect(stripHtmlPreservingLinks(html)).toBe('Programa del curso (/x.docx)');
  });

  it('handles multiple links in the same document', () => {
    const html = '<a href="/a.pdf">A</a> and <a href="/b.pdf">B</a>';
    expect(stripHtmlPreservingLinks(html)).toBe('A (/a.pdf) and B (/b.pdf)');
  });

  it('still strips ordinary non-link markup like before', () => {
    const html = '<div><h1>Title</h1><p>Body   text</p></div>';
    expect(stripHtmlPreservingLinks(html)).toBe('Title Body text');
  });

  it('falls back to plain text when href is empty', () => {
    const html = '<a href="">Nowhere</a>';
    expect(stripHtmlPreservingLinks(html)).toBe('Nowhere');
  });

  it('decodes HTML entities in both text and href', () => {
    const html = '<p>Tom &amp; Jerry&nbsp;&lt;3</p><a href="/f.pdf?a=1&amp;ou=2">Caf&eacute; &#233; &#x41;</a>';
    expect(stripHtmlPreservingLinks(html)).toBe('Tom & Jerry <3 Café é A (/f.pdf?a=1&ou=2)');
  });

  it('drops javascript: hrefs and keeps only the label', () => {
    const html = '<a href="javascript:alert(1)">Click</a> <a href=" JavaScript:void(0)">Other</a>';
    expect(stripHtmlPreservingLinks(html)).toBe('Click Other');
  });

  it('drops the contents of script and style blocks', () => {
    const html = '<style>.a{color:red}</style><p>Hi</p><script>var x = 1;</script>';
    expect(stripHtmlPreservingLinks(html)).toBe('Hi');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtmlPreservingLinks('')).toBe('');
  });
});
