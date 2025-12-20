import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow explicit any (legacy code uses this)
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Allow @ts-ignore comments
      '@typescript-eslint/ban-ts-comment': 'off',
      // Allow empty interfaces
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow case declarations (used in switch statements)
      'no-case-declarations': 'off',
      // Allow let for potentially reassignable vars
      'prefer-const': 'warn',
      // Downgrade React hooks warnings
      'react-hooks/exhaustive-deps': 'warn',
      // Allow setState in effects (MobX patterns)
      'react-hooks/set-state-in-effect': 'off',
      // Allow manual memoization patterns
      'react-hooks/preserve-manual-memoization': 'off',
      // Allow non-component exports (store exports)
      'react-refresh/only-export-components': 'off',
    },
  },
])
