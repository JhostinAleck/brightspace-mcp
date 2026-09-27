import { describe, expect, it } from 'vitest';

import { findModule, findTopic, walkModules } from '@/contexts/content/domain/ContentTree.js';
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic } from '@/contexts/content/domain/Topic.js';

const leaf = new Topic({ id: 7, title: 'Lab', kind: 'file', url: '/content/enforced/1-X/a/lab.html', fileExtension: 'html' });
const inner = new Module({ id: 2, title: 'Inner', topics: [leaf], submodules: [], descriptionHtml: '<p>x</p>' });
const tree = [
  new Module({ id: 1, title: 'Outer', topics: [], submodules: [inner] }),
  new Module({ id: 3, title: 'Other', topics: [], submodules: [] }),
];

describe('ContentTree', () => {
  it('findTopic locates a nested topic with its parent module', () => {
    const hit = findTopic(tree, 7);
    expect(hit?.topic.title).toBe('Lab');
    expect(hit?.module.id).toBe(2);
    expect(findTopic(tree, 99)).toBeNull();
  });

  it('findModule locates nested modules', () => {
    expect(findModule(tree, 2)?.title).toBe('Inner');
    expect(findModule(tree, 42)).toBeNull();
  });

  it('walkModules visits depth-first with the depth', () => {
    const seen: string[] = [];
    walkModules(tree, (m, depth) => seen.push(`${m.title}@${depth}`));
    expect(seen).toEqual(['Outer@0', 'Inner@1', 'Other@0']);
  });

  it('Module and Topic default the new optional fields', () => {
    expect(tree[1]!.descriptionHtml).toBeNull();
    expect(inner.descriptionHtml).toBe('<p>x</p>');
    expect(leaf.isBroken).toBe(false);
  });
});
