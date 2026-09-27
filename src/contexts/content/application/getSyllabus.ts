import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import {
  findSyllabusCandidates,
  syllabusPagesToScan,
  type SyllabusCandidate,
} from '@/contexts/content/domain/SyllabusCandidates.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetSyllabusInput {
  repo: ContentRepository;
  courseId: OrgUnitId;
}

export type SyllabusLookup =
  /** The Brightspace course overview (/overview) has a description. */
  | { status: 'published'; syllabus: Syllabus }
  /**
   * No overview (`not_found`, a 404) or a blank one (`empty`). `candidates`
   * are the places in course content that most likely hold the syllabus, best
   * first (possibly none); `contentSearched` is false when the content tree
   * could not be loaded.
   */
  | {
      status: 'not_published';
      reason: 'not_found' | 'empty';
      candidates: SyllabusCandidate[];
      contentSearched: boolean;
    };

/** Intro pages are small; anything bigger is not a page worth scanning. */
const MAX_PAGE_BYTES = 512 * 1024;

async function downloadPages(input: GetSyllabusInput, modules: Module[]): Promise<Map<number, string>> {
  const pages = new Map<number, string>();
  await Promise.all(
    syllabusPagesToScan(modules).map(async (topic) => {
      try {
        const buf = await input.repo.findTopicFile(input.courseId, topic.id);
        if (buf.length > 0 && buf.length <= MAX_PAGE_BYTES) pages.set(topic.id, buf.toString('utf8').replace(/^\uFEFF/, ''));
      } catch {
        // Best effort: the tree alone still yields candidates.
      }
    }),
  );
  return pages;
}

/**
 * The course overview when published; otherwise point the caller at where the
 * syllabus probably is in course content. Uses the cached content tree and
 * downloads at most a couple of small intro/syllabus HTML pages to look for
 * links — the syllabus file itself is never downloaded here.
 */
export async function getSyllabus(input: GetSyllabusInput): Promise<SyllabusLookup> {
  const syllabus = await input.repo.findSyllabus(input.courseId);
  if (syllabus?.html?.trim()) return { status: 'published', syllabus };
  const reason = syllabus ? 'empty' : 'not_found';

  let modules: Module[];
  try {
    modules = await input.repo.findModules(input.courseId);
  } catch {
    return { status: 'not_published', reason, candidates: [], contentSearched: false };
  }
  const pages = await downloadPages(input, modules);
  const candidates = findSyllabusCandidates(modules, {
    courseOrgUnitId: OrgUnitId.toNumber(input.courseId),
    pages,
  });
  return { status: 'not_published', reason, candidates, contentSearched: true };
}
