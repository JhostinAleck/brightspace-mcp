import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '@/shared-kernel/text/decodeHtmlEntities.js';

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeHtmlEntities('Caf&eacute; &#237; &#x00e9; &amp; &lt;b&gt;')).toBe('Café í é & <b>');
  });

  it('does not double-decode an escaped entity', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('handles code points outside the BMP', () => {
    expect(decodeHtmlEntities('&#x1F600;')).toBe('😀');
  });

  it('leaves unknown or out-of-range entities untouched', () => {
    expect(decodeHtmlEntities('&bogus; &#x110000;')).toBe('&bogus; &#x110000;');
  });
});
