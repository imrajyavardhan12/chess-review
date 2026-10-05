import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'reference/**', // Python reference implementation
      'apps/web/public/**', // third-party engine build
      'packages/core/src/data/**', // generated
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // each package's tsconfig, so test files are type-aware too
        project: [
          'packages/core/tsconfig.test.json',
          'packages/engine/tsconfig.json',
          'apps/web/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused arguments prefixed with _ are intentional.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // A promise nobody awaits is a bug waiting to happen; `void` marks the deliberate ones.
      '@typescript-eslint/no-floating-promises': 'error',
      // Async adapters that return promises (stores, fakes) legitimately have no await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['packages/engine/src/node.ts', '**/*.test.ts', 'packages/*/test/**'],
    languageOptions: { globals: globals.node },
  },
  {
    // Test matchers like expect.stringMatching() are typed `any`; that is fine in assertions.
    files: ['**/test/**', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Config and scripts are plain JS/MJS or outside any tsconfig: lint without type information.
    ...tseslint.configs.disableTypeChecked,
    files: ['*.js', '*.ts', 'scripts/**'],
    languageOptions: { ...tseslint.configs.disableTypeChecked.languageOptions, globals: globals.node },
  },
  {
    // The service worker is plain JS that runs in its own global scope.
    ...tseslint.configs.disableTypeChecked,
    files: ['apps/web/sw/**'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.serviceworker,
    },
  },
)
