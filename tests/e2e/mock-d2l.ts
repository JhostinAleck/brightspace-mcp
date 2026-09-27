import http from 'node:http';
import type { AddressInfo } from 'node:net';

export function startMockD2l(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') {
        // POST: submit assignment (multipart body — ignored, just return canned response)
        if (req.url?.match(/\/d2l\/api\/le\/[^/]+\/[^/]+\/dropbox\/folders\/[^/]+\/submissions\/mysubmissions\/$/)) {
          // Drain body but don't parse it
          req.on('data', () => {});
          req.on('end', () => {
            res.end(JSON.stringify({ SubmissionId: 'sub-e2e', SubmittedOn: '2026-04-23T10:00:00Z' }));
          });
          return;
        }
        // POST: discussion reply
        if (req.url?.match(/\/d2l\/api\/le\/[^/]+\/[^/]+\/discussions\/forums\/[^/]+\/topics\/[^/]+\/posts\/$/)) {
          req.on('data', () => {});
          req.on('end', () => {
            res.end(JSON.stringify({ Id: 999, DatePosted: '2026-04-23T10:00:00Z' }));
          });
          return;
        }
        // POST: mark announcement read
        if (req.url?.match(/\/d2l\/api\/le\/[^/]+\/[^/]+\/news\/[^/]+\/mark-read$/)) {
          req.on('data', () => {});
          req.on('end', () => {
            res.end('{}');
          });
          return;
        }
        res.statusCode = 404;
        res.end('{}');
        return;
      }
      if (req.url === '/d2l/api/versions/') {
        res.end(
          JSON.stringify([
            { ProductCode: 'lp', LatestVersion: '1.56' },
            { ProductCode: 'le', LatestVersion: '1.91' },
          ]),
        );
        return;
      }
      if (req.url?.startsWith('/d2l/api/lp/1.56/users/whoami')) {
        res.end(
          JSON.stringify({
            Identifier: '42',
            FirstName: 'Test',
            LastName: 'User',
            UniqueName: 'test@x',
          }),
        );
        return;
      }
      if (req.url?.startsWith('/d2l/api/lp/1.56/enrollments/myenrollments/')) {
        res.end(
          JSON.stringify({
            Items: [
              {
                OrgUnit: { Id: 1, Name: 'Smoke 101', Code: 'SMK', Type: { Id: 3, Code: 'Course Offering' } },
                // Real shape: IsActive is true even for past terms; the access window decides "current".
                Access: {
                  IsActive: true,
                  StartDate: new Date(Date.now() - 30 * 86400000).toISOString(),
                  EndDate: new Date(Date.now() + 90 * 86400000).toISOString(),
                  CanAccess: true,
                  LastAccessed: null,
                },
              },
            ],
          }),
        );
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/grades\/$/)) {
        res.end(JSON.stringify([
          { Id: 10, Name: 'Smoke Exam', GradeType: 'Numeric', MaxPoints: 100, Weight: 100 },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/grades\/values\/myGradeValues\/$/)) {
        res.end(JSON.stringify([
          { GradeObjectIdentifier: '10', PointsNumerator: 92, PointsDenominator: 100, DisplayedGrade: '92' },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/dropbox\/folders\/$/)) {
        res.end(JSON.stringify([
          {
            Id: 9001,
            Name: 'Smoke Assignment',
            CustomInstructions: { Html: '<p>Do the thing</p>' },
            DueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            Submissions: [],
          },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/overview$/)) {
        res.end(JSON.stringify({ Description: { Html: '<p>Smoke syllabus body</p>' } }));
        return;
      }
      // Real LE news shape: the author is only a user id (CreatedBy), resolved via the LE classlist.
      const smokeNews = {
        PinnedDate: null, Id: 900, IsHidden: false,
        Attachments: [{ FileId: 9001, FileName: 'smoke.txt', Size: 11 }],
        CreatedBy: 7, CreatedDate: new Date().toISOString(), LastModifiedBy: null, LastModifiedDate: new Date().toISOString(),
        Title: 'Smoke Announcement', Body: { Text: 'hi', Html: '<p>hi</p>' },
        StartDate: new Date().toISOString(), EndDate: null, IsGlobal: false, IsPublished: true,
        ShowOnlyInCourseOfferings: false, IsAuthorInfoShown: true, IsPinned: false, IsStartDateShown: true, SortOrder: 0,
      };
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/news\/$/)) {
        res.end(JSON.stringify([smokeNews]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/news\/900$/)) {
        res.end(JSON.stringify(smokeNews));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/news\/900\/attachments\/9001$/)) {
        res.setHeader('Content-Type', 'text/plain');
        res.end('smoke file\n');
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/classlist\/$/)) {
        res.end(JSON.stringify([
          { Identifier: '42', ProfileIdentifier: 'p42', DisplayName: 'Test User', Username: 'test', OrgDefinedId: null, Email: 'test@x.edu', FirstName: 'Test', LastName: 'User', RoleId: 110, LastAccessed: null, IsOnline: false, ClasslistRoleDisplayName: 'Student', Pronouns: null },
          { Identifier: '7', ProfileIdentifier: 'p7', DisplayName: 'Smoke Instructor', Username: 'si', OrgDefinedId: null, Email: null, FirstName: 'Smoke', LastName: 'Instructor', RoleId: 103, LastAccessed: null, IsOnline: false, ClasslistRoleDisplayName: 'Instructor', Pronouns: null },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/calendar\/events\//)) {
        // Real LE shape; myEvents/ is paged ({ Objects, Next }), events/ is a bare array.
        const event = {
          CalendarEventId: 9500, OrgUnitId: 1, Title: 'Smoke Midterm', Description: '',
          StartDateTime: new Date(Date.now() + 86400000).toISOString(), EndDateTime: null,
          IsAllDayEvent: false, LocationName: 'Smoke Hall',
        };
        res.end(JSON.stringify(req.url.includes('/myEvents/') ? { Objects: [event], Next: null } : [event]));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => {
              r();
            });
          }),
      });
    });
  });
}
