import { describe, expect, it } from 'vitest';
import { markdown as md } from '@/shared-kernel/output/format/markdown.js';

describe('markdown primitives', () => {
  it('renders headers', () => {
    expect(md.h1('Title')).toBe('# Title');
    expect(md.h3('Sub')).toBe('### Sub');
  });

  it('renders inline emphasis', () => {
    expect(md.bold('x')).toBe('**x**');
    expect(md.italic('x')).toBe('_x_');
    expect(md.code('x')).toBe('`x`');
  });

  it('renders links', () => {
    expect(md.link('label', 'https://x')).toBe('[label](https://x)');
  });

  it('escapes markdown-active characters in plain text', () => {
    expect(md.escape('a|b*c_d')).toBe('a\\|b\\*c\\_d');
  });

  it('blockquote', () => {
    expect(md.blockquote('line1\nline2')).toBe('> line1\n> line2');
  });
});
