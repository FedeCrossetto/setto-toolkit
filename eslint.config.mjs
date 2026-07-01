import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

/** @type {import('typescript-eslint').Config} */
export default tseslint.config(
  {
    ignores: ['out/**', 'release/**', 'node_modules/**', 'dist/**', '.claude/**'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  // ── Base ───────────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Renderer (src/) ────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // ── TypeScript ────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Non-null assertions are intentional (all added with explanatory comments)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Allow void calls as statements (e.g. `void somePromise()`)
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',

      // ── React hooks (keep the two rules that catch real bugs) ─────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',

      // ── React Refresh (Vite HMR) ──────────────────────────────────────
      'react-refresh/only-export-components': 'off', // many files intentionally mix

      // ── Accessibility (icon-only buttons, img alt text, ARIA) ─────────
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/control-has-associated-label': 'off',

      // ── ES basics ─────────────────────────────────────────────────────
      'no-console': 'off', // logger.ts handles structured logging; direct console is intentional in some spots
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ── Main process (electron/) ───────────────────────────────────────────
  {
    files: ['electron/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ── Tests ──────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ── Scripts + config files (Node.js, plain JS/MJS) ────────────────────
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.config.js', '*.config.mjs', '*.config.cjs', 'postcss.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ── Global rule overrides (new ESLint 10 rules too strict for this codebase) ──
  {
    rules: {
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
)
