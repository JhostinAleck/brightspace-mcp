import type { Module } from './Module.js';
import type { Topic } from './Topic.js';

/** Depth-first walk over a module tree (depth 0 = root modules). */
export function walkModules(modules: readonly Module[], visit: (m: Module, depth: number) => void, depth = 0): void {
  for (const m of modules) {
    visit(m, depth);
    walkModules(m.submodules, visit, depth + 1);
  }
}

export function findModule(modules: readonly Module[], moduleId: number): Module | null {
  let hit: Module | null = null;
  walkModules(modules, (m) => {
    if (!hit && m.id === moduleId) hit = m;
  });
  return hit;
}

export function findTopic(modules: readonly Module[], topicId: number): { topic: Topic; module: Module } | null {
  let hit: { topic: Topic; module: Module } | null = null;
  walkModules(modules, (m) => {
    if (hit) return;
    const topic = m.topics.find((t) => t.id === topicId);
    if (topic) hit = { topic, module: m };
  });
  return hit;
}
