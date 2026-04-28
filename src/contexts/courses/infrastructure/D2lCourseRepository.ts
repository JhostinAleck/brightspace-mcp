import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import { Course, type CourseProps } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import { Classmate } from '@/contexts/courses/Classmate.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
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
    do {
      const qs = bookmark ? `?bookmark=${encodeURIComponent(bookmark)}` : '';
      const page = await this.client.get<EnrollmentsPage>(
        `/d2l/api/lp/${this.versions.lp}/enrollments/myenrollments/${qs}`,
      );
      allItems.push(...page.Items);
      bookmark = page.PagingInfo?.HasMoreItems ? page.PagingInfo.Bookmark : undefined;
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
      if (c.active) return true;
      if (c.startDate && c.endDate) return now >= c.startDate && now <= c.endDate;
      return false;
    });
  }

  async findById(id: CourseId): Promise<Course | null> {
    const all = await this.findMyCourses();
    return all.find((c) => CourseId.toNumber(c.id) === CourseId.toNumber(id)) ?? null;
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
