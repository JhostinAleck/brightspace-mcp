import { describe, expect, it } from 'vitest';
import { bulletList, numberedList } from '@/shared-kernel/output/format/list.js';

describe('list primitives', () => {
  it('renders bullet list with default marker', () => {
    expect(bulletList(['a', 'b', 'c'])).toBe('- a\n- b\n- c');
  });

  it('renders numbered list', () => {
    expect(numberedList(['a', 'b'])).toBe('1. a\n2. b');
  });

  it('handles multi-line items by indenting continuations', () => {
    expect(bulletList(['line1\nline2'])).toBe('- line1\n  line2');
  });

  it('returns empty string for empty input', () => {
    expect(bulletList([])).toBe('');
    expect(numberedList([])).toBe('');
  });
});
