import http from 'node:http';
import type { AddressInfo } from 'node:net';

export function startMockD2l(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
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
      if (req.url?.startsWith('/d2l/api/le/1.91/enrollments/myenrollments/')) {
        res.end(
          JSON.stringify({
            Items: [
              {
                OrgUnit: { Id: 1, Name: 'Smoke 101', Code: 'SMK', Type: { Id: 3, Code: 'Course' } },
                Access: { IsActive: true },
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
      if (req.url?.match(/\/d2l\/api\/lp\/1\.56\/1\/classlist\/$/)) {
        res.end(JSON.stringify([
          { Identifier: '42', DisplayName: 'Test User', UserName: 'test', Email: 'test@x.edu', RoleId: 109 },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/overview$/)) {
        res.end(JSON.stringify({ Description: { Html: '<p>Smoke syllabus body</p>' } }));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/news\/$/)) {
        res.end(JSON.stringify([
          { Id: 900, Title: 'Smoke Announcement', Body: { Html: '<p>hi</p>' }, Author: { DisplayName: 'Prof' }, StartDate: new Date().toISOString() },
        ]));
        return;
      }
      if (req.url?.match(/\/d2l\/api\/le\/1\.91\/1\/calendar\/events\//)) {
        res.end(JSON.stringify([
          { Id: 9500, Name: 'Smoke Midterm', Description: null, StartDate: new Date(Date.now() + 86400000).toISOString(), EndDate: null, Location: 'Smoke Hall' },
        ]));
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
