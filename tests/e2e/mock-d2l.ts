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
