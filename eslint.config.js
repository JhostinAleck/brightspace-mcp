import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import js from '@eslint/js';

// Wire the two recommended rulesets the original plan intended via
// `extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"]`.
// In flat-config land those become `js.configs.recommended` (spread as a
// config block) and `tsPlugin.configs['flat/recommended']` (a 3-block array
// that registers the plugin/parser, disables conflicting core rules on TS
// files, and adds the @typescript-eslint recommended rules).
export default [
  { ignores: ['build/**', 'node_modules/**', 'coverage/**', 'docs/**'] },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        Response: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
    },
  },
];
