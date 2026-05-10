import { z } from 'zod';

import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export const searchCourseSchema = z.object({
  course_id: z.number().int().positive(),
  query: z.string().min(1).max(200),
  scope: z.array(z.enum(['content', 'announcements', 'discussions'])).default(['content', 'announcements', 'discussions']),
  limit: z.number().int().positive().max(50).default(20),
}).strict();

export interface SearchCourseDeps {
  contentRepo: ContentRepository;
  communicationsRepo: CommunicationsRepository;
}

interface Hit {
  scope: 'content' | 'announcements' | 'discussions';
  title: string;
  snippet: string;
  score: number;
  reference: string;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/**
 * Score a single piece of text against the query terms. Term-frequency-based,
 * not full-blown TF-IDF — for a single course the corpus is small enough that
 * frequency alone gives sensible ordering.
 */
function score(text: string, queryTerms: string[]): { score: number; firstMatch: number } {
  if (queryTerms.length === 0) return { score: 0, firstMatch: -1 };
  const lower = text.toLowerCase();
  let total = 0;
  let firstMatch = -1;
  for (const term of queryTerms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      total += (lower.match(new RegExp(escapeRegExp(term), 'g')) ?? []).length;
      if (firstMatch < 0 || idx < firstMatch) firstMatch = idx;
    }
  }
  return { score: total, firstMatch };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippet(text: string, around: number, length = 160): string {
  if (around < 0) return text.slice(0, length);
  const start = Math.max(0, around - length / 2);
  const end = Math.min(text.length, start + length);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function flattenModules(modules: readonly Module[]): Array<{ title: string; topics: Array<{ id: number; title: string }> }> {
  const out: Array<{ title: string; topics: Array<{ id: number; title: string }> }> = [];
  const walk = (mods: readonly Module[]): void => {
    for (const m of mods) {
      out.push({ title: m.title, topics: m.topics.map((t) => ({ id: t.id, title: t.title })) });
      walk(m.submodules);
    }
  };
  walk(modules);
  return out;
}

export async function handleSearchCourse(deps: SearchCourseDeps, rawInput: unknown) {
  const input = searchCourseSchema.parse(rawInput);
  const courseId = createOrgUnitId(String(input.course_id));
  const queryTerms = tokenize(input.query);

  const hits: Hit[] = [];

  // Content
  if (input.scope.includes('content')) {
    try {
      const modules = await deps.contentRepo.findModules(courseId);
      for (const m of flattenModules(modules)) {
        const text = `${m.title}\n${m.topics.map((t) => t.title).join('\n')}`;
        const { score: s, firstMatch } = score(text, queryTerms);
        if (s > 0) {
          hits.push({
            scope: 'content',
            title: m.title,
            snippet: snippet(text, firstMatch),
            score: s,
            reference: `module: ${m.title}`,
          });
        }
        for (const t of m.topics) {
          const r = score(t.title, queryTerms);
          if (r.score > 0) {
            hits.push({
              scope: 'content',
              title: t.title,
              snippet: snippet(t.title, r.firstMatch),
              score: r.score,
              reference: `topic id=${t.id}`,
            });
          }
        }
      }
    } catch { /* skip if content fails */ }
  }

  // Announcements
  if (input.scope.includes('announcements')) {
    try {
      const ann = await deps.communicationsRepo.findAnnouncements(courseId);
      for (const a of ann) {
        const text = `${a.title}\n${(a.html ?? '').replace(/<[^>]+>/g, ' ')}`;
        const r = score(text, queryTerms);
        if (r.score > 0) {
          hits.push({
            scope: 'announcements',
            title: a.title,
            snippet: snippet(text, r.firstMatch),
            score: r.score,
            reference: `announcement id=${a.id} (${a.postedAt.toISOString()})`,
          });
        }
      }
    } catch { /* skip */ }
  }

  // Discussions
  if (input.scope.includes('discussions')) {
    try {
      const forums = await deps.communicationsRepo.findDiscussions(courseId);
      for (const f of forums) {
        for (const t of f.topics) {
          const text = `${t.name}\n${t.description ?? ''}`;
          const r = score(text, queryTerms);
          if (r.score > 0) {
            hits.push({
              scope: 'discussions',
              title: t.name,
              snippet: snippet(text, r.firstMatch),
              score: r.score,
              reference: `forum=${f.name}, topic id=${t.id}`,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  if (hits.length === 0) {
    return { content: [{ type: 'text' as const, text: `No matches for "${input.query}".` }] };
  }

  hits.sort((a, b) => b.score - a.score);
  const trimmed = hits.slice(0, input.limit);
  const lines = trimmed.map((h, i) => `${i + 1}. [${h.scope}] ${h.title}\n   ${h.reference}\n   ${h.snippet}`);
  return {
    content: [{
      type: 'text' as const,
      text: `${trimmed.length} match${trimmed.length === 1 ? '' : 'es'} (of ${hits.length}) for "${input.query}":\n\n${lines.join('\n\n')}`,
    }],
  };
}
