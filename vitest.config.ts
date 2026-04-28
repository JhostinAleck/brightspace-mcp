import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@tests': resolve(__dirname, 'tests'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    globalSetup: ['./tests/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/main.ts',
        'src/cli/commands/**',
        'src/composition-root.ts',
        'src/mcp/registry.ts',
        'src/mcp/server.ts',
        'src/mcp/tools/**',
        'src/shared-kernel/types/Brand.ts',
        'src/shared-kernel/observability/DiagnosticsSnapshot.ts',
        'src/contexts/assignments/infrastructure/D2lAssignmentRepository.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 70,
        statements: 85,
      },
    },
  },
});
