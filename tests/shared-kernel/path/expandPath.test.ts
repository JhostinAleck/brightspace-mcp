import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { expandPath } from '@/shared-kernel/path/expandPath.js';

describe('expandPath', () => {
  it('expands ~/ to home directory', () => {
    expect(expandPath('~/Downloads')).toBe(`${homedir()}/Downloads`);
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandPath('/etc/hosts')).toBe('/etc/hosts');
  });

  it('expands %VAR% tokens from process.env', () => {
    process.env['BRIGHTSPACE_TEST_VAR'] = '/tmp/test';
    expect(expandPath('%BRIGHTSPACE_TEST_VAR%/file.txt')).toBe('/tmp/test/file.txt');
    delete process.env['BRIGHTSPACE_TEST_VAR'];
  });

  it('leaves unknown %VAR% tokens as literal text', () => {
    delete process.env['DOES_NOT_EXIST_VAR'];
    expect(expandPath('%DOES_NOT_EXIST_VAR%/foo')).toBe('%DOES_NOT_EXIST_VAR%/foo');
  });

  it('handles ~ + %VAR% combined', () => {
    process.env['SUB'] = 'sub';
    expect(expandPath('~/%SUB%/file')).toBe(`${homedir()}/sub/file`);
    delete process.env['SUB'];
  });
});
