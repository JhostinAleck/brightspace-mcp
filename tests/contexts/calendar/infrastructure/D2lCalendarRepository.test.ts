import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCalendarRepository } from '@/contexts/calendar/infrastructure/D2lCalendarRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const BASE = 'https://x.com';
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/calendar/events.json'), 'utf-8'));

afterEach(() => nock.cleanAll());

describe('D2lCalendarRepository', () => {
  it('parses events with locations and end dates', async () => {
    nock(BASE).get(/\/d2l\/api\/le\/1\.91\/101\/calendar\/events\//).reply(200, fixture);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCalendarRepository(client, { le: '1.91' });
    const out = await repo.findEvents(OrgUnitId.of(101), new Date('2026-04-01'), new Date('2026-06-01'));
    expect(out).toHaveLength(2);
    const midterm = out.find((e) => e.title === 'Midterm Exam');
    expect(midterm?.location).toBe('MSEE B012');
    expect(midterm?.endAt?.toISOString()).toBe('2026-05-01T16:00:00.000Z');
  });
});
