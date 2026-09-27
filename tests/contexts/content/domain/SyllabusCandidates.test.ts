import { describe, expect, it } from 'vitest';

import { Module } from '@/contexts/content/domain/Module.js';
import { Topic, type TopicProps } from '@/contexts/content/domain/Topic.js';
import {
  findSyllabusCandidates,
  matchIntroKeyword,
  matchSyllabusKeyword,
  syllabusPagesToScan,
} from '@/contexts/content/domain/SyllabusCandidates.js';

const OU = 101;
const DIR = '/content/enforced/101-202620_ABCD1234_1';

function topic(p: Partial<TopicProps> & { id: number; title: string }): Topic {
  const url = p.url ?? null;
  const ext = p.fileExtension ?? (url ? (/\.([a-z0-9]+)$/i.exec(url)?.[1]?.toLowerCase() ?? null) : null);
  return new Topic({ kind: 'file', url, fileExtension: ext, ...p });
}

function mod(id: number, title: string, opts: { topics?: Topic[]; submodules?: Module[]; descriptionHtml?: string } = {}): Module {
  return new Module({ id, title, topics: opts.topics ?? [], submodules: opts.submodules ?? [], descriptionHtml: opts.descriptionHtml ?? null });
}

describe('syllabus keyword matching', () => {
  it('matches multilingual syllabus keywords ignoring accents, case and separators', () => {
    expect(matchSyllabusKeyword('Programa del Curso')).toBe('programa del curso');
    expect(matchSyllabusKeyword('SÍLABO 2026-20')).toBe('silabo');
    expect(matchSyllabusKeyword('ISIS3510-syllabus.pdf')).toBe('syllabus');
    expect(matchSyllabusKeyword('course_outline_v2.docx')).toBe('course outline');
    expect(matchSyllabusKeyword('Guía del curso')).toBe('guia del curso');
    expect(matchSyllabusKeyword('PROGRAMME')).toBe('programme');
    expect(matchSyllabusKeyword('M%20y%20J%20-%20Programa%20PyE.pdf')).toBe('programa');
  });

  it('does not match words that merely start with a keyword', () => {
    expect(matchSyllabusKeyword('Repaso programación en Python')).toBeNull();
    expect(matchSyllabusKeyword('Fundamentos de programación')).toBeNull();
    expect(matchSyllabusKeyword('Slides 14 - Local storage')).toBeNull();
  });

  it('recognises generic welcome / intro titles', () => {
    expect(matchIntroKeyword('Welcome')).toBe('welcome');
    expect(matchIntroKeyword('Bienvenida')).toBe('bienvenida');
    expect(matchIntroKeyword('Información general')).toBe('informacion general');
    expect(matchIntroKeyword('Presentación')).toBe('presentacion');
    expect(matchIntroKeyword('Presentaciones')).toBeNull();
    expect(matchIntroKeyword('Introducción a NumPy')).toBeNull();
  });
});

describe('findSyllabusCandidates', () => {
  it('ranks a topic whose title matches above generic intro pages', () => {
    const modules = [
      mod(1, 'Welcome', { topics: [topic({ id: 10, title: 'Welcome', url: `${DIR}/Welcome.html` })] }),
      mod(2, 'Contenido', {
        topics: [
          topic({ id: 20, title: 'Clase 1', url: `${DIR}/Clase 1.pdf` }),
          topic({ id: 21, title: 'Programa', url: `${DIR}/Programa ABCD 1234 202620.docx.pdf` }),
        ],
      }),
    ];
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU });
    expect(out.map((c) => c.target)).toEqual([
      { type: 'topic', topicId: 21 },
      { type: 'topic', topicId: 10 },
    ]);
    expect(out[0]?.match).toEqual({ on: 'title', keyword: 'programa' });
    expect(out[0]?.location).toEqual({ modulePath: ['Contenido'], topicTitle: null });
    expect(out[1]?.match.on).toBe('intro');
  });

  it('finds the syllabus linked from an intro HTML page and resolves absolute tenant URLs to course paths', () => {
    const welcome = topic({ id: 10, title: 'Welcome', url: `${DIR}/Welcome.html` });
    const modules = [mod(1, 'Welcome', { topics: [welcome] })];
    const html =
      '<div class="banner"><img src="https://school.example/content/enforced/101-202620_ABCD1234_1/assets/banner.png"></div>' +
      '<a href="https://school.example/content/enforced/101-202620_ABCD1234_1/1_RECURSOS/Welcome/ABCD1234-syllabus.pdf?isCourseFile=true">' +
      '¡¡ CHECK THE SYLLABUS HERE !!</a>';
    expect(syllabusPagesToScan(modules).map((t) => t.id)).toEqual([10]);
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU, pages: new Map([[10, html]]) });
    expect(out[0]).toMatchObject({
      target: { type: 'course_file', path: `${DIR}/1_RECURSOS/Welcome/ABCD1234-syllabus.pdf` },
      title: 'ABCD1234-syllabus.pdf',
      label: '¡¡ CHECK THE SYLLABUS HERE !!',
      match: { on: 'filename', keyword: 'syllabus' },
      location: { modulePath: ['Welcome'], topicTitle: 'Welcome' },
    });
    // The page itself stays as a (lower-ranked) fallback; the Welcome module is subsumed.
    expect(out.map((c) => c.target)).toEqual([
      { type: 'course_file', path: `${DIR}/1_RECURSOS/Welcome/ABCD1234-syllabus.pdf` },
      { type: 'topic', topicId: 10 },
    ]);
  });

  it('uses link text when the filename says nothing, and resolves coursefile quicklinks', () => {
    const modules = [
      mod(1, 'Introducción al curso', {
        descriptionHtml:
          '<ul><li><a href="https://school.example/d2l/common/dialogs/quickLink/quickLink.d2l?ou=101&amp;type=coursefile&amp;fileId=ABCD-1234-2026-20_Rev.pdf">Programa Curso 2026-20</a></li>' +
          '<li><a href="https://school.example/d2l/common/dialogs/quickLink/quickLink.d2l?ou=101&amp;type=coursefile&amp;fileId=C1+Introducci%c3%b3n.pdf">Presentación primera clase</a></li>' +
          '<li><a href="https://zoom.example/j/1">Link zoom</a></li></ul>',
      }),
      mod(2, 'Unidad 1', { topics: [topic({ id: 30, title: 'C2 Principios', url: `${DIR}/C2 Principios.html` })] }),
    ];
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU });
    // The intro module itself is subsumed by the candidate found inside it.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      target: { type: 'course_file', path: `${DIR}/ABCD-1234-2026-20_Rev.pdf` },
      title: 'ABCD-1234-2026-20_Rev.pdf',
      match: { on: 'link_text', keyword: 'programa' },
      location: { modulePath: ['Introducción al curso'], topicTitle: null },
    });
  });

  it('suggests an intro module when nothing more specific is found', () => {
    const modules = [mod(1, 'Información general', { descriptionHtml: '<p>Horario y reglas.</p>' })];
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU });
    expect(out).toEqual([
      expect.objectContaining({ target: { type: 'module', moduleId: 1 }, match: { on: 'intro', keyword: 'informacion general' } }),
    ]);
  });

  it('keeps links in module descriptions whose module title is the syllabus', () => {
    const modules = [
      mod(1, 'CONTENU', {
        submodules: [
          mod(2, 'PROGRAMME', {
            descriptionHtml: `<p><a href="${DIR}/Leng%201201-01%20Franc%C3%A9s%201%202026-20%20(1).docx">Leng 1201-01 Francés 1 2026-20</a></p>`,
          }),
          mod(3, 'SEMAINE 1', { descriptionHtml: `<a href="${DIR}/semaine1.docx">Semaine 1</a>` }),
        ],
      }),
    ];
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      target: { type: 'course_file', path: `${DIR}/Leng%201201-01%20Franc%C3%A9s%201%202026-20%20(1).docx` },
      title: 'Leng 1201-01 Francés 1 2026-20 (1).docx',
      match: { on: 'module_title', keyword: 'programme' },
      location: { modulePath: ['CONTENU', 'PROGRAMME'], topicTitle: null },
    });
  });

  it('prefers the topic over a description link to the same file, and drops links into other courses', () => {
    const modules = [
      mod(1, 'Programa del Curso', {
        descriptionHtml:
          `<a href="${DIR}/Programa%20ABCD.pdf">Programa del curso (PDF)</a>` +
          '<a href="/content/enforced/999-OLD_COURSE/Programa.pdf">Programa viejo</a>',
        topics: [
          topic({ id: 40, title: 'Programa del Curso', url: `${DIR}/Programa ABCD.pdf` }),
          topic({ id: 41, title: 'Cronograma', url: `${DIR}/Cronograma.pdf` }),
        ],
      }),
    ];
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU });
    expect(out.map((c) => c.target)).toEqual([{ type: 'topic', topicId: 40 }]);
  });

  it('reports external links (e.g. SharePoint) whose text matches', () => {
    const page = topic({ id: 50, title: 'Bienvenida', url: `${DIR}/Sin título.html` });
    const modules = [mod(1, 'Presentación', { topics: [page] })];
    const html = '<h3>Programa del curso</h3><a href="https://sharepoint.example/:w:/g/doc?e=1">Programa del curso</a>';
    const out = findSyllabusCandidates(modules, { courseOrgUnitId: OU, pages: new Map([[50, html]]) });
    expect(out[0]).toMatchObject({
      target: { type: 'external', url: 'https://sharepoint.example/:w:/g/doc?e=1' },
      match: { on: 'link_text', keyword: 'programa del curso' },
    });
    expect(out[1]?.target).toEqual({ type: 'topic', topicId: 50 });
  });

  it('returns nothing for a course without syllabus-like content and honours the limit', () => {
    const plain = [mod(1, 'Laboratorios', { topics: [topic({ id: 60, title: 'Lab 1', url: `${DIR}/Lab 1.pdf` })] })];
    expect(findSyllabusCandidates(plain, { courseOrgUnitId: OU })).toEqual([]);

    const many = [mod(1, 'Programas', {
      topics: Array.from({ length: 8 }, (_, i) => topic({ id: 70 + i, title: `Programa v${i}`, url: `${DIR}/p${i}.pdf` })),
    })];
    expect(findSyllabusCandidates(many, { courseOrgUnitId: OU, limit: 3 })).toHaveLength(3);
  });

  it('ignores intro-like titles deep in the tree', () => {
    const modules = [mod(1, 'Módulos', { submodules: [mod(2, 'Unidad 4', { submodules: [
      mod(3, 'Material adicional', { topics: [topic({ id: 90, title: 'Getting started with DevOps', kind: 'link', url: 'https://example.test/devops' })] }),
    ] })] })];
    expect(findSyllabusCandidates(modules, { courseOrgUnitId: OU })).toEqual([]);
  });

  it('skips broken topics', () => {
    const modules = [mod(1, 'X', { topics: [topic({ id: 80, title: 'Syllabus', url: null, isBroken: true })] })];
    expect(findSyllabusCandidates(modules, { courseOrgUnitId: OU })).toEqual([]);
  });
});

describe('syllabusPagesToScan', () => {
  it('picks syllabus-titled HTML pages first, then intro pages, capped', () => {
    const modules = [
      mod(1, 'Presentación del Curso', { topics: [topic({ id: 1, title: 'Programa del Curso', url: `${DIR}/Programa del Curso.html` })] }),
      mod(2, 'Welcome', { topics: [topic({ id: 2, title: 'Welcome', url: `${DIR}/Welcome.html` })] }),
      mod(3, 'Bienvenida', { topics: [topic({ id: 3, title: 'Inicio', url: `${DIR}/inicio.html` })] }),
      mod(4, 'Semana 1', { topics: [topic({ id: 4, title: 'Clase', url: `${DIR}/clase.html` })] }),
      mod(5, 'Syllabus', { topics: [topic({ id: 5, title: 'Syllabus', url: `${DIR}/syllabus.pdf` })] }),
    ];
    expect(syllabusPagesToScan(modules).map((t) => t.id)).toEqual([1, 2]);
    expect(syllabusPagesToScan(modules, 5).map((t) => t.id)).toEqual([1, 2, 3]);
  });
});
