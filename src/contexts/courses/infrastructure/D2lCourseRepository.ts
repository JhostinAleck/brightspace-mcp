import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { Course, type CourseProps } from '@/contexts/courses/domain/Course.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { Classmate } from '@/contexts/courses/domain/Classmate.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import { isCurrentEnrollment, type EnrollmentWindow } from '@/contexts/courses/domain/currentCourses.js';

interface EnrollmentDto {
  OrgUnit: { Id: number; Name: string; Code: string; Type: { Code: string } };
  Access: {
    IsActive: boolean;
    StartDate?: string | null;
    EndDate?: string | null;
    CanAccess?: boolean;
    LastAccessed?: string | null;
  };
}
interface EnrollmentsPage {
  PagingInfo?: { Bookmark?: string; HasMoreItems?: boolean };
  Items: EnrollmentDto[];
}

interface ClasslistUserDto {
  Identifier: string;
  DisplayName: string;
  Username?: string | null;
  Email?: string | null;
  RoleId?: number | null;
  ClasslistRoleDisplayName?: string | null;
  OrgDefinedId?: string | null;
}

export interface D2lCourseRepositoryOptions {
  le: string;
  lp: string;
  /** Clock used to decide which enrollments are current (tests inject one). */
  now?: () => Date;
}

export class D2lCourseRepository implements CourseRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCourseRepositoryOptions,
  ) {}

  async findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]> {
    const allItems: EnrollmentDto[] = [];
    let bookmark: string | undefined;
    let pages = 0;
    const MAX_PAGES = 200;
    const seenBookmarks = new Set<string>();
    do {
      if (pages++ >= MAX_PAGES) {
        throw new Error(
          `findMyCourses: aborting after ${MAX_PAGES} pages — server may be returning a cyclic bookmark.`,
        );
      }
      const qs = bookmark ? `?bookmark=${encodeURIComponent(bookmark)}` : '';
      const page = await this.client.get<EnrollmentsPage>(
        `/d2l/api/lp/${this.versions.lp}/enrollments/myenrollments/${qs}`,
      );
      allItems.push(...page.Items);
      const next = page.PagingInfo?.HasMoreItems ? page.PagingInfo.Bookmark : undefined;
      if (next !== undefined && seenBookmarks.has(next)) {
        // Cycle detected — stop instead of looping forever.
        break;
      }
      if (next !== undefined) seenBookmarks.add(next);
      bookmark = next;
    } while (bookmark !== undefined);

    const now = this.versions.now?.() ?? new Date();
    const offerings = allItems
      .filter((e) => {
        const code = e.OrgUnit.Type.Code;
        return code === 'Course' || code === 'Course Offering';
      })
      .map((e) => {
        const window: EnrollmentWindow = { code: e.OrgUnit.Code };
        if (e.Access.StartDate) window.startDate = new Date(e.Access.StartDate);
        if (e.Access.EndDate) window.endDate = new Date(e.Access.EndDate);
        if (e.Access.LastAccessed) window.lastAccessed = new Date(e.Access.LastAccessed);
        return { e, window };
      });
    const windows = offerings.map((o) => o.window);

    // `Access.IsActive` is true for every past enrollment too, so "active"
    // here means usable *and* current by the rule in currentCourses.ts.
    const courses = offerings.map(({ e, window }) => {
      const props: CourseProps = {
        id: CourseId.of(e.OrgUnit.Id),
        name: e.OrgUnit.Name,
        code: e.OrgUnit.Code,
        active: e.Access.IsActive && e.Access.CanAccess !== false && isCurrentEnrollment(window, now, windows),
      };
      if (window.startDate) props.startDate = window.startDate;
      if (window.endDate) props.endDate = window.endDate;
      return new Course(props);
    });

    return opts?.activeOnly ? courses.filter((c) => c.active) : courses;
  }

  async findById(id: CourseId): Promise<Course | null> {
    // Direct orgstructure lookup — O(1) per call instead of paging the full
    // enrollments list (which can be hundreds of pages for instructors).
    const orgUnit = CourseId.toNumber(id);
    try {
      const dto = await this.client.get<{
        Identifier: number;
        Name: string;
        Code: string;
        Type: { Code: string };
      }>(`/d2l/api/lp/${this.versions.lp}/orgstructure/${orgUnit}`);
      const code = dto.Type?.Code;
      if (code !== 'Course' && code !== 'Course Offering') return null;
      return new Course({
        id: CourseId.of(dto.Identifier),
        name: dto.Name,
        code: dto.Code,
        active: true,
      });
    } catch (err) {
      // 403/404 → unknown or restricted. Fall back to enrollments scan so we
      // keep parity with the previous behaviour for tenants whose orgstructure
      // endpoint is locked down for student tokens.
      if (err instanceof D2lApiError && (err.status === 403 || err.status === 404)) {
        const all = await this.findMyCourses();
        return all.find((c) => CourseId.toNumber(c.id) === CourseId.toNumber(id)) ?? null;
      }
      throw err;
    }
  }

  // The LP classlist route (/lp/{v}/{ou}/classlist/) is 404 on real tenants;
  // the LE one is what students can read.
  private async fetchClasslist(orgUnit: number): Promise<ClasslistUserDto[]> {
    return this.client.get<ClasslistUserDto[]>(`/d2l/api/le/${this.versions.le}/${orgUnit}/classlist/`);
  }

  async findRoster(id: CourseId): Promise<Classmate[]> {
    const users = await this.fetchClasslist(CourseId.toNumber(id));
    return users.map((u) => this.toClassmate(u));
  }

  // There is no student-readable email route (classlist/email/ is 404 on both
  // LP and LE); emails come from the classlist and are often hidden by policy.
  async findClasslistEmails(id: CourseId): Promise<string[]> {
    const users = await this.fetchClasslist(CourseId.toNumber(id));
    return users
      .map((u) => u.Email)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
  }

  private toClassmate(dto: ClasslistUserDto): Classmate {
    const role = this.classifyRole(dto.RoleId, dto.ClasslistRoleDisplayName);
    return new Classmate({
      userId: UserId.of(Number.parseInt(dto.Identifier, 10)),
      displayName: dto.DisplayName,
      uniqueName: dto.Username ?? '',
      email: dto.Email ?? null,
      role,
    });
  }

  /**
   * Role ids are tenant-specific (Uniandes: 109 = "Profesor", 110 =
   * "Estudiante"), so classify by the role's display name and only fall back
   * to D2L's stock ids when no name is given.
   */
  private classifyRole(
    roleId: number | null | undefined,
    roleName: string | null | undefined,
  ): 'student' | 'instructor' | 'ta' | 'other' {
    const name = (roleName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (name) {
      if (/\b(asistente|assistant|monitor|ta|tutor)\b/.test(name)) return 'ta';
      if (/\b(profesor|professor|instructor|teacher|docente)\b/.test(name)) return 'instructor';
      if (/\b(estudiante|student|learner|alumno)\b/.test(name)) return 'student';
      return 'other';
    }
    if (roleId === 110) return 'student';
    if (roleId === 109) return 'instructor';
    return 'other';
  }

}
