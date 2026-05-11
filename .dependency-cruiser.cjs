module.exports = {
  forbidden: [
    {
      name: 'domain-no-infra-import',
      comment: 'Domain layer must not depend on infrastructure or application',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/' },
      to: { path: '^src/contexts/[^/]+/(infrastructure|application)/' },
    },
    {
      name: 'no-cross-context-imports',
      comment: 'Contexts cannot import from each other (use shared-kernel or MCP layer)',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/' },
      to: {
        path: '^src/contexts/([^/]+)/',
        pathNot: ['^src/contexts/$1/', '^src/contexts/http-api/', '^src/contexts/authentication/domain/'],
      },
    },
    {
      name: 'shared-kernel-pure',
      comment: 'shared-kernel must not depend on contexts, except SecretResolver which needs the CredentialStore interface',
      severity: 'error',
      from: {
        path: '^src/shared-kernel/',
        pathNot: ['^src/shared-kernel/config/SecretResolver\\.ts$'],
      },
      to: { path: '^src/(contexts|mcp|cli)/' },
    },
    {
      name: 'tools-no-infra',
      comment: 'MCP tools import only from application layer, never infrastructure',
      severity: 'error',
      from: { path: '^src/mcp/tools/' },
      to: { path: '^src/contexts/[^/]+/infrastructure/' },
    },
    {
      name: 'resources-no-infra',
      comment: 'MCP resources import only from application layer, never infrastructure',
      severity: 'error',
      from: { path: '^src/mcp/resources/' },
      to: { path: '^src/contexts/[^/]+/infrastructure/' },
    },
    {
      name: 'prompts-no-infra',
      comment: 'MCP prompts import only from application layer, never infrastructure',
      severity: 'error',
      from: { path: '^src/mcp/prompts/' },
      to: { path: '^src/contexts/[^/]+/infrastructure/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
};
