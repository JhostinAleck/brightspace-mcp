import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import { getSyllabus } from '@/contexts/content/application/getSyllabus.js';
import type { SyllabusCandidate } from '@/contexts/content/domain/SyllabusCandidates.js';
import { getSyllabusSchema } from '@/mcp/schemas.js';
import { syllabusToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetSyllabusDeps { contentRepo: ContentRepository; output: OutputContext; }

const quote = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;

function nextCall(c: SyllabusCandidate, courseId: number): string {
  switch (c.target.type) {
    case 'topic':
      return `get_topic_file(course_id=${courseId}, topic_id=${c.target.topicId})`;
    case 'module':
      return `get_module(course_id=${courseId}, module_id=${c.target.moduleId})`;
    case 'course_file':
      return `get_course_file(course_id=${courseId}, path=${quote(c.target.path)})`;
    case 'external':
      return `external link, not downloadable through Brightspace — open in a browser: ${c.target.url}`;
  }
}

function why(c: SyllabusCandidate): string {
  const kw = quote(c.match.keyword);
  switch (c.match.on) {
    case 'title':
      return `title matches ${kw}`;
    case 'filename':
      return `file name matches ${kw}`;
    case 'link_text':
      return `link text matches ${kw}`;
    case 'module_title':
      return `document linked from the module titled like a syllabus (${kw})`;
    case 'intro':
      return 'welcome/course-introduction material without a syllabus keyword; may contain or link the syllabus';
  }
}

function where(c: SyllabusCandidate): string {
  // e.g. `link "X" in topic "Y", module "A › B"` or `in module "A"`
  const place: string[] = [];
  if (c.location.topicTitle) place.push(`topic ${quote(c.location.topicTitle)}`);
  if (c.location.modulePath.length > 0) place.push(`module ${quote(c.location.modulePath.join(' › '))}`);
  const link = c.label && c.label !== c.title ? `link ${quote(c.label)}` : '';
  const inPlace = place.length > 0 ? `in ${place.join(', ')}` : '';
  return [link, inPlace].filter(Boolean).join(' ');
}

const KIND_LABEL: Record<SyllabusCandidate['target']['type'], string> = {
  topic: 'topic',
  module: 'module',
  course_file: 'course file',
  external: 'external link',
};

function notPublishedText(
  courseId: number,
  reason: 'not_found' | 'empty',
  candidates: SyllabusCandidate[],
  contentSearched: boolean,
): string {
  const lines = [
    reason === 'not_found'
      ? `Brightspace course overview not published (404) for course ${courseId}.`
      : `Brightspace course overview for course ${courseId} exists but its description is empty.`,
  ];
  const fallback =
    `Next: search_course(course_id=${courseId}, query="syllabus") (also try "programa"), ` +
    `or browse with get_course_content(course_id=${courseId}).`;
  if (!contentSearched) {
    lines.push('', 'Course content could not be loaded to look for an uploaded syllabus.', fallback);
    return lines.join('\n');
  }
  if (candidates.length === 0) {
    lines.push('', 'No syllabus-like topics, modules or links were found in course content.', fallback);
    return lines.join('\n');
  }
  lines.push(
    '',
    'Instructors often upload the syllabus to course content instead. Likely places (best first; nothing was downloaded):',
    '',
  );
  candidates.forEach((c, i) => {
    const loc = where(c);
    lines.push(`${i + 1}. ${c.title} — ${KIND_LABEL[c.target.type]}${loc ? ` (${loc})` : ''}; ${why(c)}`);
    lines.push(`   → ${nextCall(c, courseId)}`);
  });
  lines.push('', `If none of these is the syllabus: ${fallback.replace(/^Next: /, '')}`);
  return lines.join('\n');
}

export async function handleGetSyllabus(deps: GetSyllabusDeps, rawInput: unknown) {
  const input = getSyllabusSchema.parse(rawInput);
  const result = await getSyllabus({ repo: deps.contentRepo, courseId: OrgUnitId.of(input.course_id) });
  const text = result.status === 'published'
    ? syllabusToText(result.syllabus, deps.output)
    : notPublishedText(input.course_id, result.reason, result.candidates, result.contentSearched);
  return { content: [{ type: 'text' as const, text }] };
}
