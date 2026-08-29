import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import { Course, type CourseProps } from '@/contexts/courses/domain/Course.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { Classmate } from '@/contexts/courses/domain/Classmate.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

interface EnrollmentDto {
  OrgUnit: { Id: number; Name: string; Code: string; Type: { Code: string } };
  Access: { IsActive: boolean; StartDate?: string | null; EndDate?: string | null };
}
interface EnrollmentsPage {
  PagingInfo?: { Bookmark?: string; HasMoreItems?: boolean };
  Items: EnrollmentDto[];
}

interface ClasslistUserDto {
  Identifier: string;
  DisplayName: string;
  UserName: string;
  Email?: string | null;
  RoleId?: number | null;
  OrgDefinedId?: string | null;
}

interface ClasslistEmailDto {
  Identifier: string;
  EmailAddress: string | null;
}

export interface D2lCourseRepositoryOptions {
  le: string;
  lp: string;
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

    const now = new Date();
    const courses = allItems
      .filter((e) => {
        const code = e.OrgUnit.Type.Code;
        return code === 'Course' || code === 'Course Offering';
      })
      .map((e) => {
        const props: CourseProps = {
          id: CourseId.of(e.OrgUnit.Id),
          name: e.OrgUnit.Name,
          code: e.OrgUnit.Code,
          active: e.Access.IsActive,
        };
        if (e.Access.StartDate) props.startDate = new Date(e.Access.StartDate);
        if (e.Access.EndDate) props.endDate = new Date(e.Access.EndDate);
        return new Course(props);
      });

    if (!opts?.activeOnly) return courses;
    return courses.filter((c) => {
      // Access.IsActive reflects whether the offering is enabled, not whether
      // it is currently in session — some tenants leave it true on every past
      // enrollment. Treat the term window as authoritative whenever D2L gives
      // us one, and fall back to IsActive only for undated org units (student
      // hubs, training shells, resource sites).
      if (c.startDate && c.endDate) return now >= c.startDate && now <= c.endDate;
      if (c.startDate) return now >= c.startDate;
      if (c.endDate) return now <= c.endDate;
      return c.active;
    });
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

  async findRoster(id: CourseId): Promise<Classmate[]> {
    const orgUnit = CourseId.toNumber(id);
    const users = await this.client.get<ClasslistUserDto[]>(
      `/d2l/api/lp/${this.versions.lp}/${orgUnit}/classlist/`,
    );
    return users.map((u) => this.toClassmate(u));
  }

  async findClasslistEmails(id: CourseId): Promise<string[]> {
    const orgUnit = CourseId.toNumber(id);
    const emails = await this.client.get<ClasslistEmailDto[]>(
      `/d2l/api/lp/${this.versions.lp}/${orgUnit}/classlist/email/`,
    );
    return emails
      .map((e) => e.EmailAddress)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
  }

  private toClassmate(dto: ClasslistUserDto): Classmate {
    const role = this.classifyRole(dto.RoleId);
    return new Classmate({
      userId: UserId.of(Number.parseInt(dto.Identifier, 10)),
      displayName: dto.DisplayName,
      uniqueName: dto.UserName,
      email: dto.Email ?? null,
      role,
    });
  }

  private classifyRole(
    roleId: number | null | undefined,
  ): 'student' | 'instructor' | 'ta' | 'other' {
    if (roleId === 109) return 'student';
    if (roleId === 103) return 'instructor';
    if (roleId === 112) return 'ta';
    return 'other';
  }
}
