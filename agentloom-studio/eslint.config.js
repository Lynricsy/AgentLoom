import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { readdirSync } from 'node:fs'

const featureNames = readdirSync(new URL('./src/features', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const featureBoundaryConfigs = featureNames.map((featureName) => ({
  files: [`src/features/${featureName}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: featureNames
              .filter((candidate) => candidate !== featureName)
              .flatMap((candidate) => [
                `@/features/${candidate}/components/**`,
                `@/features/${candidate}/stores/**`,
                `@/features/${candidate}/api/**`,
                `@/features/${candidate}/lib/**`,
                `@/features/${candidate}/hooks/**`,
                `@/features/${candidate}/types/**`,
                `@/features/${candidate}/components/*`,
                `@/features/${candidate}/stores/*`,
                `@/features/${candidate}/api/*`,
                `@/features/${candidate}/lib/*`,
                `@/features/${candidate}/hooks/*`,
                `@/features/${candidate}/types/*`,
                `@/features/${candidate}/components`,
                `@/features/${candidate}/stores`,
                `@/features/${candidate}/api`,
                `@/features/${candidate}/lib`,
                `@/features/${candidate}/hooks`,
                `@/features/${candidate}/types`,
              ]),
            message: '跨 feature 依赖必须通过目标 feature 的公开 barrel。',
          },
        ],
      },
    ],
  },
}))

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
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/globals': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  ...featureBoundaryConfigs,
  {
    files: ['src/app/routes/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/**'],
              message: '路由只能通过 feature 的公开 barrel 导入。',
            },
          ],
        },
      ],
    },
  },
])
