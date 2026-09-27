import { extractHtmlLinks } from '@/shared-kernel/text/htmlLinks.js';

import { CourseFilePath } from './CourseFilePath.js';
import type { Module } from './Module.js';
import type { Topic } from './Topic.js';

/**
 * Where to find a course syllabus when the Brightspace course overview is not
 * published. Many instructors upload it into course content instead: a topic
 * called "Programa del curso", a PDF linked from a Welcome page or from a
 * module description, a module named "Syllabus"… This module ranks those
 * places from the (cached) content tree plus, optionally, the HTML of a couple
 * of intro pages. It never downloads anything itself.
 */

export type SyllabusCandidateTarget =
  | { type: 'topic'; topicId: number }
  | { type: 'module'; moduleId: number }
  /** Canonical /content/enforced/{ou}-…/… path (see CourseFilePath). */
  | { type: 'course_file'; path: string }
  /** Link to another site (SharePoint, Drive…); cannot be fetched through Brightspace. */
  | { type: 'external'; url: string };

export type SyllabusMatchOn =
  /** A syllabus keyword in the topic/module title. */
  | 'title'
  /** A syllabus keyword in the file name of the topic or link target. */
  | 'filename'
  /** A syllabus keyword in the anchor text of a link. */
  | 'link_text'
  /** A document linked from the description of a module titled like a syllabus. */
  | 'module_title'
  /** Generic welcome / course-introduction page or module (no syllabus keyword). */
  | 'intro';

export interface SyllabusCandidate {
  target: SyllabusCandidateTarget;
  /** Topic/module title, or the file name (or URL) of a link target. */
  title: string;
  /** Anchor text of the link the candidate was found through, if any. */
  label: string | null;
  match: { on: SyllabusMatchOn; keyword: string };
  /** Titles of the enclosing modules (root first) and of the HTML topic a link was found in. */
  location: { modulePath: string[]; topicTitle: string | null };
  score: number;
}

export interface FindSyllabusCandidatesOptions {
  courseOrgUnitId: number;
  /** HTML of already-downloaded topics (see syllabusPagesToScan), by topic id. */
  pages?: ReadonlyMap<number, string>;
  limit?: number;
}

export const DEFAULT_SYLLABUS_CANDIDATES = 5;
export const DEFAULT_SYLLABUS_PAGES_TO_SCAN = 2;

// Phrases are matched on normalized text (see normalizeForMatch) as whole words.
const SYLLABUS_PHRASES = [
  'programa del curso', 'programa de curso', 'programa de la asignatura', 'programa de asignatura',
  'course syllabus', 'course outline', 'course program', 'course programme', 'course guide',
  'plan de curso', 'plan del curso', 'plan de cours', 'plano de ensino', 'plano de curso',
  'guia del curso', 'guia de curso', 'guia docente', 'guia de la asignatura',
  'syllabus', 'syllabi', 'silabo', 'silabus', 'programme', 'programa', 'temario', 'ementa',
];

const INTRO_PHRASES = [
  'informacion general', 'informacion del curso', 'course information', 'general information',
  'course overview', 'about this course', 'about the course', 'start here', 'getting started',
  'introduccion al curso', 'introduccion del curso', 'presentacion del curso', 'presentacion curso',
  'descripcion del curso', 'course description', 'informations generales', 'boas vindas', 'bem vindo',
  'welcome', 'bienvenida', 'bienvenido', 'bienvenidos', 'bienvenidas', 'bienvenue',
];

/** Titles that are generic intros only when they are the whole title ("Presentación", not "Presentación de X"). */
const INTRO_EXACT = ['presentacion', 'introduccion', 'introduction', 'inicio', 'informacion', 'overview', 'apresentacao'];

const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'odt', 'rtf', 'pptx', 'ppt']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

const SCORE = {
  keyword: 100,
  linkText: 70,
  moduleTitleLink: 65,
  syllabusModule: 60,
  introTopic: 30,
  introModule: 25,
  documentBonus: 5,
} as const;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Lowercase, accents removed, every run of non letters/digits (incl. `_`, `-`, `%20`) → one space. */
export function normalizeForMatch(s: string): string {
  return safeDecode(s)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function findPhrase(text: string, phrases: readonly string[]): string | null {
  const padded = ` ${normalizeForMatch(text)} `;
  return phrases.find((p) => padded.includes(` ${p} `)) ?? null;
}

export function matchSyllabusKeyword(text: string): string | null {
  return findPhrase(text, SYLLABUS_PHRASES);
}

export function matchIntroKeyword(text: string): string | null {
  const norm = normalizeForMatch(text);
  if (INTRO_EXACT.includes(norm)) return norm;
  return findPhrase(text, INTRO_PHRASES);
}

function fileNameOf(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  return safeDecode(clean.slice(clean.lastIndexOf('/') + 1));
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

function isHtmlPage(t: Topic): boolean {
  return !t.isBroken && t.kind === 'file' && HTML_EXTENSIONS.has(t.fileExtension ?? '');
}

/** The course's own content folder name (e.g. "101-202620_ABCD1234_1"), learned from any path in the tree. */
function courseDirOf(modules: readonly Module[], pages: ReadonlyMap<number, string>, ou: number): string | null {
  const re = new RegExp(`/content/enforced/(${ou}(?:-[^/?#"']*)?)/`);
  const sources: string[] = [];
  const visit = (mods: readonly Module[]): void => {
    for (const m of mods) {
      for (const t of m.topics) if (t.url) sources.push(t.url);
      if (m.descriptionHtml) sources.push(m.descriptionHtml);
      visit(m.submodules);
    }
  };
  visit(modules);
  sources.push(...pages.values());
  for (const s of sources) {
    const hit = re.exec(s);
    if (hit?.[1]) return safeDecode(hit[1]);
  }
  return null;
}

function parseCoursePath(raw: string, ou: number): string | null {
  try {
    return CourseFilePath.parse(raw, ou).path;
  } catch {
    return null;
  }
}

interface LinkContext {
  ou: number;
  courseDir: string | null;
}

/** Map a link found in content HTML to something the agent can open, or null for noise. */
function linkTarget(url: string, ctx: LinkContext): SyllabusCandidateTarget | null {
  const [pathPart = '', query = ''] = url.split('?', 2);
  if (/quickLink\.d2l$/i.test(pathPart)) {
    const params = new URLSearchParams(query.split('#')[0] ?? '');
    const ou = params.get('ou');
    const fileId = params.get('fileId');
    if (params.get('type')?.toLowerCase() !== 'coursefile' || !fileId || !ctx.courseDir) return null;
    if (ou !== null && ou !== String(ctx.ou)) return null;
    const rel = fileId.replace(/^\/+/, '').split('/').map((s) => encodeURIComponent(s)).join('/');
    const path = parseCoursePath(`/content/enforced/${encodeURIComponent(ctx.courseDir)}/${rel}`, ctx.ou);
    return path ? { type: 'course_file', path } : null;
  }
  const view = /\/d2l\/le\/content\/(\d+)\/viewContent\/(\d+)\//i.exec(pathPart);
  if (view) return view[1] === String(ctx.ou) ? { type: 'topic', topicId: Number(view[2]) } : null;

  let path = url;
  if (/^https?:\/\//i.test(url)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!parsed.pathname.startsWith('/content/enforced/')) return { type: 'external', url };
    path = parsed.pathname;
  }
  if (!path.startsWith('/content/enforced/')) return null;
  const canonical = parseCoursePath(path, ctx.ou);
  return canonical ? { type: 'course_file', path: canonical } : null;
}

function targetKey(t: SyllabusCandidateTarget): string {
  switch (t.type) {
    case 'topic':
      return `topic:${t.topicId}`;
    case 'module':
      return `module:${t.moduleId}`;
    case 'course_file':
      return `file:${t.path}`;
    case 'external':
      return `url:${t.url}`;
  }
}

interface Collected extends SyllabusCandidate {
  order: number;
  /** Ids of the modules enclosing where the candidate was found. */
  moduleIds: number[];
}

/**
 * Rank the places in a course's content that most likely hold its syllabus:
 * keyword in a topic title or file name > keyword in a link's text > a
 * document linked from a module titled like a syllabus > a module titled like
 * a syllabus > generic welcome/intro pages and modules. Links pointing at
 * other courses and non-document D2L links are ignored.
 */
export function findSyllabusCandidates(
  modules: readonly Module[],
  opts: FindSyllabusCandidatesOptions,
): SyllabusCandidate[] {
  const ou = opts.courseOrgUnitId;
  const pages = opts.pages ?? new Map<number, string>();
  const ctx: LinkContext = { ou, courseDir: courseDirOf(modules, pages, ou) };

  // Topics by canonical file path, so a link to a topic's file is reported as the topic.
  const topicByPath = new Map<string, { topic: Topic; path: string[]; ids: number[] }>();
  const indexTopics = (mods: readonly Module[], path: string[], ids: number[]): void => {
    for (const m of mods) {
      for (const t of m.topics) {
        const p = t.url && !t.isBroken ? parseCoursePath(t.url, ou) : null;
        if (p && !topicByPath.has(p)) topicByPath.set(p, { topic: t, path: [...path, m.title], ids: [...ids, m.id] });
      }
      indexTopics(m.submodules, [...path, m.title], [...ids, m.id]);
    }
  };
  indexTopics(modules, [], []);

  const found = new Map<string, Collected>();
  let order = 0;
  const add = (c: Omit<Collected, 'order'>): void => {
    const key = targetKey(c.target);
    const prev = found.get(key);
    if (!prev || c.score > prev.score) found.set(key, { ...c, order: prev?.order ?? order });
    order += 1;
  };

  const addLinks = (
    html: string,
    baseUrl: string | null,
    where: { modulePath: string[]; moduleIds: number[]; topicTitle: string | null },
    moduleKeyword: string | null,
  ): void => {
    for (const link of extractHtmlLinks(html, { baseUrl })) {
      let target = linkTarget(link.url, ctx);
      if (!target) continue;
      let title: string;
      if (target.type === 'course_file') {
        const asTopic = topicByPath.get(target.path);
        title = fileNameOf(target.path);
        if (asTopic) {
          target = { type: 'topic', topicId: asTopic.topic.id };
          title = asTopic.topic.title;
        }
      } else if (target.type === 'topic') {
        title = link.label || `Topic ${target.topicId}`;
      } else if (target.type === 'external') {
        title = link.label || link.url;
      } else {
        continue;
      }
      const fileName = target.type === 'external' ? '' : title;
      const inName = target.type === 'course_file' ? matchSyllabusKeyword(fileName) : null;
      const inLabel = link.label ? matchSyllabusKeyword(link.label) : null;
      const isDocument = target.type === 'course_file' && DOCUMENT_EXTENSIONS.has(extensionOf(fileName) ?? '');
      let match: SyllabusCandidate['match'] | null = null;
      let score = 0;
      if (inName) {
        match = { on: 'filename', keyword: inName };
        score = SCORE.keyword;
      } else if (inLabel) {
        match = { on: 'link_text', keyword: inLabel };
        score = SCORE.linkText;
      } else if (moduleKeyword && (isDocument || target.type === 'topic')) {
        match = { on: 'module_title', keyword: moduleKeyword };
        score = SCORE.moduleTitleLink;
      }
      if (!match) continue;
      add({
        target,
        title,
        label: link.label || null,
        match,
        location: { modulePath: where.modulePath, topicTitle: where.topicTitle },
        moduleIds: where.moduleIds,
        score: score + (isDocument ? SCORE.documentBonus : 0),
      });
    }
  };

  const visit = (mods: readonly Module[], path: string[], ids: number[], depth: number): void => {
    for (const m of mods) {
      const modulePath = [...path, m.title];
      const moduleIds = [...ids, m.id];
      const moduleKeyword = matchSyllabusKeyword(m.title);
      const moduleIntro = depth <= 1 && !moduleKeyword ? matchIntroKeyword(m.title) : null;
      if (moduleKeyword || moduleIntro) {
        add({
          target: { type: 'module', moduleId: m.id },
          title: m.title,
          label: null,
          match: moduleKeyword ? { on: 'title', keyword: moduleKeyword } : { on: 'intro', keyword: moduleIntro ?? '' },
          location: { modulePath: path, topicTitle: null },
          moduleIds: ids,
          score: moduleKeyword ? SCORE.syllabusModule : SCORE.introModule,
        });
      }
      if (m.descriptionHtml) {
        addLinks(m.descriptionHtml, null, { modulePath, moduleIds, topicTitle: null }, moduleKeyword);
      }
      for (const t of m.topics) {
        if (t.isBroken) continue;
        const inTitle = matchSyllabusKeyword(t.title);
        const inName = !inTitle && t.url?.startsWith('/content/') ? matchSyllabusKeyword(fileNameOf(t.url)) : null;
        // Intro pages only count near the top of the tree ("Getting started with X" deep in a unit is not one).
        const intro = !inTitle && !inName && depth <= 1 ? matchIntroKeyword(t.title) : null;
        const isDocument = DOCUMENT_EXTENSIONS.has(t.fileExtension ?? '');
        const match: SyllabusCandidate['match'] | null = inTitle
          ? { on: 'title', keyword: inTitle }
          : inName
            ? { on: 'filename', keyword: inName }
            : intro
              ? { on: 'intro', keyword: intro }
              : null;
        if (match) {
          const base = match.on === 'intro' ? SCORE.introTopic : SCORE.keyword;
          add({
            target: { type: 'topic', topicId: t.id },
            title: t.title,
            label: null,
            match,
            location: { modulePath, topicTitle: null },
            moduleIds,
            score: base + (isDocument ? SCORE.documentBonus : 0),
          });
        }
        const html = pages.get(t.id);
        if (html) addLinks(html, t.url, { modulePath, moduleIds, topicTitle: t.title }, null);
      }
      visit(m.submodules, modulePath, moduleIds, depth + 1);
    }
  };
  visit(modules, [], [], 0);

  // A module is only worth suggesting when nothing more specific was found inside it.
  const all = [...found.values()];
  const kept = all.filter(
    (c) => c.target.type !== 'module' || !all.some((o) => o !== c && o.moduleIds.includes((c.target as { moduleId: number }).moduleId)),
  );
  kept.sort((a, b) => b.score - a.score || a.order - b.order);
  return kept.slice(0, opts.limit ?? DEFAULT_SYLLABUS_CANDIDATES).map(({ order: _o, moduleIds: _m, ...c }) => c);
}

/**
 * HTML topics worth downloading to look for syllabus links: pages titled like
 * a syllabus first, then welcome/intro pages (by title, or the pages of a
 * root-level intro module), in document order.
 */
export function syllabusPagesToScan(modules: readonly Module[], max = DEFAULT_SYLLABUS_PAGES_TO_SCAN): Topic[] {
  const syllabusPages: Topic[] = [];
  const introPages: Topic[] = [];
  const visit = (mods: readonly Module[], depth: number): void => {
    for (const m of mods) {
      const introModule = depth <= 1 && (matchIntroKeyword(m.title) !== null || matchSyllabusKeyword(m.title) !== null);
      for (const t of m.topics) {
        if (!isHtmlPage(t)) continue;
        if (matchSyllabusKeyword(t.title)) syllabusPages.push(t);
        else if (matchIntroKeyword(t.title) || introModule) introPages.push(t);
      }
      visit(m.submodules, depth + 1);
    }
  };
  visit(modules, 0);
  return [...syllabusPages, ...introPages].slice(0, max);
}
