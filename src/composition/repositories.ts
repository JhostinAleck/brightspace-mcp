import type { Profile } from '@/shared-kernel/config/schema.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { createPlaywrightLoader } from '@/shared-kernel/playwright/lazy-playwright.js';
import type { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lCourseRepository } from '@/contexts/courses/infrastructure/D2lCourseRepository.js';
import { CachedCourseRepository } from '@/contexts/courses/infrastructure/CachedCourseRepository.js';
import { D2lGradeRepository } from '@/contexts/grades/infrastructure/D2lGradeRepository.js';
import { CachedGradeRepository } from '@/contexts/grades/infrastructure/CachedGradeRepository.js';
import { D2lAssignmentRepository } from '@/contexts/assignments/infrastructure/D2lAssignmentRepository.js';
import { CachedAssignmentRepository } from '@/contexts/assignments/infrastructure/CachedAssignmentRepository.js';
import { D2lUiSubmitter } from '@/contexts/assignments/infrastructure/D2lUiSubmitter.js';
import { D2lContentRepository } from '@/contexts/content/infrastructure/D2lContentRepository.js';
import { CachedContentRepository } from '@/contexts/content/infrastructure/CachedContentRepository.js';
import { D2lCommunicationsRepository } from '@/contexts/communications/infrastructure/D2lCommunicationsRepository.js';
import { CachedCommunicationsRepository } from '@/contexts/communications/infrastructure/CachedCommunicationsRepository.js';
import { D2lCalendarRepository } from '@/contexts/calendar/infrastructure/D2lCalendarRepository.js';
import { CachedCalendarRepository } from '@/contexts/calendar/infrastructure/CachedCalendarRepository.js';
import { D2lQuizRepository } from '@/contexts/quizzes/infrastructure/D2lQuizRepository.js';
import { D2lGroupRepository } from '@/contexts/groups/infrastructure/D2lGroupRepository.js';
import { D2lNotificationRepository } from '@/contexts/notifications/infrastructure/D2lNotificationRepository.js';

export interface RepositoriesInput {
  apiClient: D2lApiClient;
  versions: { lp: string; le: string };
  /** Shared domain cache; TTLs per repository are tuned below. */
  cache: Cache;
  profile: Profile;
  baseUrl: string;
  getToken: () => Promise<AccessToken>;
  playwrightLoader: ReturnType<typeof createPlaywrightLoader>;
}

export function buildRepositories(input: RepositoriesInput) {
  const { apiClient, versions, cache, profile, baseUrl, getToken, playwrightLoader } = input;

  const rawCourseRepo = new D2lCourseRepository(apiClient, { le: versions.le, lp: versions.lp });
  const courseRepo = new CachedCourseRepository(rawCourseRepo, cache, {
    listTtlMs: 5 * 60 * 1000,
    byIdTtlMs: 10 * 60 * 1000,
  });

  const rawGradeRepo = new D2lGradeRepository(apiClient, { le: versions.le });
  const gradeRepo = new CachedGradeRepository(rawGradeRepo, cache, { ttlMs: 60 * 1000 });

  // UI submitter (Playwright fallback for tenants where the Valence API is
  // restricted). Always wired but lazy: playwrightLoader is only invoked when
  // .submit() is actually called, so read-only flows never pay for it.
  // Selectors and locale come from `profile.ui_submit` if set; otherwise the
  // submitter falls back to its English-first defaults (which work for stock
  // Brightspace tenants).
  const uiSubmitCfg = profile.ui_submit;
  const cfgSelectors = uiSubmitCfg?.selectors;
  const uiSubmitter = new D2lUiSubmitter({
    playwrightLoader,
    baseUrl,
    le: versions.le,
    getToken,
    headless: profile.auth.browser?.headless ?? true,
    ...(cfgSelectors
      ? {
          selectors: {
            ...(cfgSelectors.add_file_button !== undefined ? { addFileButton: cfgSelectors.add_file_button } : {}),
            ...(cfgSelectors.my_computer_link !== undefined ? { myComputerLink: cfgSelectors.my_computer_link } : {}),
            ...(cfgSelectors.upload_button !== undefined ? { uploadButton: cfgSelectors.upload_button } : {}),
            ...(cfgSelectors.commit_button !== undefined ? { commitButton: cfgSelectors.commit_button } : {}),
            ...(cfgSelectors.submit_button !== undefined ? { submitButton: cfgSelectors.submit_button } : {}),
            ...(cfgSelectors.confirm_button !== undefined ? { confirmButton: cfgSelectors.confirm_button } : {}),
          },
        }
      : {}),
    ...(uiSubmitCfg?.force_locale !== undefined ? { forceLocale: uiSubmitCfg.force_locale } : {}),
  });
  const rawAssignmentRepo = new D2lAssignmentRepository(
    apiClient,
    { le: versions.le, lp: versions.lp },
    uiSubmitter,
  );
  const assignmentRepo = new CachedAssignmentRepository(rawAssignmentRepo, cache, {
    listTtlMs: 60 * 1000,
    feedbackTtlMs: 5 * 60 * 1000,
  });

  const rawContentRepo = new D2lContentRepository(apiClient, { le: versions.le });
  const contentRepo = new CachedContentRepository(rawContentRepo, cache, {
    syllabusTtlMs: 15 * 60 * 1000,
    modulesTtlMs: 5 * 60 * 1000,
  });

  const rawCommunicationsRepo = new D2lCommunicationsRepository(apiClient, { le: versions.le });
  const communicationsRepo = new CachedCommunicationsRepository(rawCommunicationsRepo, cache, {
    announcementsTtlMs: 60 * 1000,
    discussionsTtlMs: 2 * 60 * 1000,
  });

  const rawCalendarRepo = new D2lCalendarRepository(apiClient, { le: versions.le });
  const calendarRepo = new CachedCalendarRepository(rawCalendarRepo, cache, {
    ttlMs: 5 * 60 * 1000,
  });


  return {
    courseRepo,
    gradeRepo,
    assignmentRepo,
    contentRepo,
    communicationsRepo,
    calendarRepo,
    quizRepo: new D2lQuizRepository(apiClient, { le: versions.le }),
    groupRepo: new D2lGroupRepository(apiClient, { lp: versions.lp, le: versions.le }),
    notificationRepo: new D2lNotificationRepository(apiClient, { lp: versions.lp }),
  };
}
