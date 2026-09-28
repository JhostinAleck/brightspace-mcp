import { afterEach, describe, expect, it, beforeAll } from 'vitest';
import { warmPdfParser } from '@tests/helpers/zip';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';

import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { CourseFilePath } from '@/contexts/content/domain/CourseFilePath.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

beforeAll(warmPdfParser, 60_000);

const BASE = 'https://x.com';
const toc = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/content/toc.json'), 'utf-8'));

function repo(): D2lContentRepository {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lContentRepository(client, { le: '1.99' });
}

afterEach(() => nock.cleanAll());

describe('D2lContentRepository.findModules (table of contents)', () => {
  it('builds the whole tree from ONE /content/toc call', async () => {
    const scope = nock(BASE).get('/d2l/api/le/1.99/101/content/toc').reply(200, toc);
    const modules = await repo().findModules(OrgUnitId.of(101));
    expect(scope.isDone()).toBe(true);
    expect(modules.map((m) => m.title)).toEqual(['Welcome', 'Diapositivas']);
    expect(modules[0]?.submodules[0]?.title).toBe('Sprint 1');
    expect(modules[1]?.submodules.map((m) => m.id)).toEqual([911, 912]);
  });

  it('classifies topics by ActivityType instead of reporting everything as [other]', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/content/toc').reply(200, toc);
    const [welcome] = await repo().findModules(OrgUnitId.of(101));
    const kinds = Object.fromEntries(welcome!.topics.map((t) => [t.id, t.kind]));
    expect(kinds).toEqual({ 9001: 'file', 9002: 'link', 9003: 'quiz', 9004: 'lti', 9005: 'file' });
  });

  it('maps IsBroken and a null Url', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/content/toc').reply(200, toc);
    const [welcome] = await repo().findModules(OrgUnitId.of(101));
    const broken = welcome!.submodules[0]!.topics.find((t) => t.id === 9012)!;
    expect(broken.isBroken).toBe(true);
    expect(broken.url).toBeNull();
    expect(welcome!.topics.find((t) => t.id === 9001)!.isBroken).toBe(false);
  });

  it('derives the file extension from the topic Url', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/content/toc').reply(200, toc);
    const [welcome] = await repo().findModules(OrgUnitId.of(101));
    expect(welcome!.topics.find((t) => t.id === 9001)!.fileExtension).toBe('html');
    expect(welcome!.topics.find((t) => t.id === 9002)!.fileExtension).toBeNull();
  });

  it('keeps module descriptions (they hold the real content in some courses)', async () => {
    nock(BASE).get('/d2l/api/le/1.99/101/content/toc').reply(200, toc);
    const modules = await repo().findModules(OrgUnitId.of(101));
    const cap1 = modules[1]!.submodules[0]!;
    expect(cap1.descriptionHtml).toContain('/content/enforced/101-202620_TEST1010_1/Capi%CC%81tulo%201.pdf');
    expect(modules[1]!.descriptionHtml).toBeNull();
  });

  it('falls back to root + structure when the toc endpoint is unavailable', async () => {
    nock(BASE)
      .get('/d2l/api/le/1.99/101/content/toc').reply(404, '')
      .get('/d2l/api/le/1.99/101/content/root/').reply(200, [
        { Id: 500, Title: 'Semaine 1', Description: { Text: '', Html: '<p>Intro</p>' }, Type: 0 },
      ])
      .get('/d2l/api/le/1.99/101/content/modules/500/structure/').reply(200, [
        { Id: 1, Title: 'Video', Type: 1, TopicType: 1, ActivityType: 1, IsBroken: false, Url: '/content/enforced/101-X/v.mp4' },
        { Id: 2, Title: 'Kahoot', Type: 1, TopicType: 3, ActivityType: 2, IsBroken: false, Url: 'https://kahoot.it/x' },
        { Id: 3, Title: 'Devoir', Type: 1, TopicType: 3, ActivityType: 7, IsBroken: false, Url: '/d2l/common/dialogs/quickLink/quickLink.d2l?ou=101&type=lti' },
        { Id: 4, Title: 'Exercice', Type: 0, Description: { Text: '', Html: '<a href="https://wordwall.net/x">ww</a>' } },
      ])
      .get('/d2l/api/le/1.99/101/content/modules/4/structure/').reply(200, []);
    const [m] = await repo().findModules(OrgUnitId.of(101));
    expect(m!.descriptionHtml).toBe('<p>Intro</p>');
    expect(m!.topics.map((t) => t.kind)).toEqual(['file', 'link', 'lti']);
    expect(m!.submodules[0]!.descriptionHtml).toContain('wordwall');
  });
});

describe('D2lContentRepository.findCourseFile', () => {
  it('downloads the validated /content/enforced path as raw bytes', async () => {
    nock(BASE)
      .get('/content/enforced/101-X/Sprint%201/a.pdf')
      .reply(200, Buffer.from('%PDF-1.4'));
    const path = CourseFilePath.parse('/content/enforced/101-X/Sprint 1/a.pdf', 101);
    const buf = await repo().findCourseFile(OrgUnitId.of(101), path);
    expect(buf.toString()).toBe('%PDF-1.4');
  });
});
