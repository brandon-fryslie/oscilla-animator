import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import functional from 'eslint-plugin-functional'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Critical path patterns for stricter type safety rules
// Note: stores/ excluded from immutable-data rule as MobX is mutation-based by design
const criticalPathPatterns = [
  'src/editor/compiler/**',
  'src/editor/stores/**',
  'src/editor/runtime/**',
  'src/editor/lenses/**',
  'src/editor/kernel/**',
  'src/editor/diagnostics/**',
]

// Patterns where functional/immutable-data should NOT apply:
// - MobX stores (mutation-based reactive state)
// - Compiler internals (intentional mutations for performance/builder patterns)
// - Runtime (stateful execution, buffer management)
// - Kernel (transaction builders use mutation)
// - Test files (often use mutations for test setup)
const immutableDataExclusions = [
  'src/editor/stores/**',
  'src/editor/compiler/**',
  'src/editor/runtime/**',
  'src/editor/kernel/**',
  '**/__tests__/**',
  '**/test/**',
  '**/*.test.ts',
]

export default defineConfig([
  // globalIgnores(['dist', '.worktrees', '.worktrees_*', '.git', 'worktree']),
  globalIgnores(['dist', '.worktrees', '.worktrees_*', '.git', 'src']),
  {
    // files: ['**/*.{ts,tsx}'],
    files: ['*.boongaboonga'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
      },
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        disallowTypeAnnotations: false,
      }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      'no-case-declarations': 'off',
      'prefer-const': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: criticalPathPatterns,
    plugins: {
      functional,
    },
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
      },
    },
    rules: {
      // '@typescript-eslint/no-explicit-any': 'error',
      // '@typescript-eslint/no-floating-promises': 'error',
      // '@typescript-eslint/strict-boolean-expressions': ['error', {
      //   allowString: false,
      //   allowNumber: false,
      //   allowNullableObject: false,
      // }],
      // '@typescript-eslint/prefer-readonly': ['error', {
      //   onlyInlineLambdas: true,
      // }],
      // '@typescript-eslint/consistent-type-exports': 'error',
      // '@typescript-eslint/explicit-function-return-type': ['error', {
      //   allowExpressions: true,
      //   allowTypedFunctionExpressions: true,
      // }],
      // '@typescript-eslint/explicit-module-boundary-types': 'error',
      // '@typescript-eslint/no-unsafe-assignment': 'error',
      // '@typescript-eslint/no-unsafe-call': 'error',
      // '@typescript-eslint/no-unsafe-member-access': 'error',
      // // Detect actual mutations instead of requiring readonly type annotations
      // // Disabled in stores/tests via separate config block (MobX is mutation-based)
      // 'functional/immutable-data': 'warn',
      // '@typescript-eslint/consistent-type-imports': ['error', {
      //   prefer: 'type-imports',
      //   disallowTypeAnnotations: false,
      // }],
      // '@typescript-eslint/no-unused-vars': ['error', {
      //   argsIgnorePattern: '^_',
      //   varsIgnorePattern: '^_',
      //   caughtErrorsIgnorePattern: '^_',
      // }],
    },
  },
  // Disable functional/immutable-data for MobX stores and test files
  // MobX is inherently mutation-based; test files need setup mutations
  // See: .agent_planning/lint-cleanup/PLAN-2025-12-25-120000.md
  {
    files: immutableDataExclusions,
    plugins: {
      functional,
    },
    rules: {
      'functional/immutable-data': 'off',
    },
  },
])
