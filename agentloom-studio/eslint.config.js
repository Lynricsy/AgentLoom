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

/**
 * Tailwind 原生调色板 — 不随主题切换，light/dark 必有一侧不可读。
 * 一律改用语义 token（primary / success / warning / error / info / muted…）。
 */
const PALETTE_CLASS =
  /(^|[\s"'`:(])(\w+:)*(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|accent|decoration|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d{1,3})?(?![\w-])/

/**
 * 已废弃的样式类：旧圆角/阴影档位、已删除的 token、未安装插件的动画类、
 * 以及绕过层级阶梯的 arbitrary z-index / blur 与 dark: 变体。
 */
const LEGACY_CLASS =
  /(^|[\s"'`:(])(\w+:)*(rounded(-[trblse]{1,2})?-(2xl|3xl|4xl|card|panel|\[\d)|shadow-(2xl|node|node-selected|panel|popover|\[)|surface-elevated|text-muted(?![\w-])|bg-card|text-card-foreground|border-input|bg-accent|text-\[1[01]px\]|animate-in|animate-out|fade-in-0|fade-out-0|zoom-in-95|zoom-out-95|backdrop-blur-\[|z-\[|dark:)/

const DESIGN_TOKEN_MESSAGE =
  '禁止 Tailwind 原生调色板，请改用语义 token（primary/success/warning/error/info/muted…）。见 agentloom-docs/dev/studio/design-system.md'
const LEGACY_CLASS_MESSAGE =
  '已废弃的样式类，请查阅 agentloom-docs/dev/studio/design-system.md 选择对应档位'

/** 生成 no-restricted-syntax 规则值：基础的类名守卫 + 可选的额外选择器 */
function restrictedSyntax(extra = []) {
  return [
    'error',
    {
      selector: `Literal[value=/${PALETTE_CLASS.source}/]`,
      message: DESIGN_TOKEN_MESSAGE,
    },
    {
      selector: `TemplateElement[value.raw=/${PALETTE_CLASS.source}/]`,
      message: DESIGN_TOKEN_MESSAGE,
    },
    {
      selector: `Literal[value=/${LEGACY_CLASS.source}/]`,
      message: LEGACY_CLASS_MESSAGE,
    },
    {
      selector: `TemplateElement[value.raw=/${LEGACY_CLASS.source}/]`,
      message: LEGACY_CLASS_MESSAGE,
    },
    ...extra,
  ]
}

/** features / shared-components / routes 内禁止绕过 shared/ui 的原生元素 */
const NATIVE_ELEMENT_SELECTORS = [
  {
    selector: "JSXOpeningElement[name.name='button']",
    message: '请使用 @/shared/ui/button 的 <Button>',
  },
  {
    selector: "JSXOpeningElement[name.name='textarea']",
    message: '请使用 @/shared/ui/textarea 的 <Textarea>',
  },
  {
    selector: "JSXOpeningElement[name.name='select']",
    message: '请使用 @/shared/ui/select 的 <Select>',
  },
  {
    selector:
      "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'][value.value=/^(hidden|file)$/]))",
    message: '请使用 @/shared/ui/input 的 <Input>（type=hidden/file 除外）',
  },
  {
    selector: "JSXOpeningElement[name.name='h1']",
    message: '页面标题只能由 PageHeader / WorkbenchHeader 产生',
  },
]

/** Radix 只能在 shared/ui 内封装 —— 与各 feature 的边界 pattern 合并到同一数组 */
const RADIX_IMPORT_PATTERN = {
  group: ['@radix-ui/*'],
  message: 'Radix 只能在 src/shared/ui 内封装后使用，业务层请用 shared/ui 原语。',
}

const TEST_IGNORES = [
  '**/*.test.{ts,tsx}',
  '**/__tests__/**',
  'src/test-setup.ts',
]

const NATIVE_ELEMENT_IGNORES = [
  ...TEST_IGNORES,
  // 画布节点是高密度自定义渲染，允许原生 button
  'src/features/canvas/components/nodes/**',
  'src/features/canvas/components/node/**',
  // 全站唯一两个 h1 生产者本身
  'src/shared/components/page-header/**',
  'src/shared/components/workbench-header/**',
]

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
          RADIX_IMPORT_PATTERN,
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
            RADIX_IMPORT_PATTERN,
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [RADIX_IMPORT_PATTERN] }],
    },
  },

  // ── 设计语言守卫 ─────────────────────────────────────────
  // 全 src：调色板 + 废弃类
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: TEST_IGNORES,
    rules: { 'no-restricted-syntax': restrictedSyntax() },
  },
  // 业务层额外禁止原生控件（同一规则名会被覆盖，故此处重复基础守卫）
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'src/shared/components/**/*.{ts,tsx}',
      'src/app/**/*.{ts,tsx}',
    ],
    ignores: NATIVE_ELEMENT_IGNORES,
    rules: {
      'no-restricted-syntax': restrictedSyntax(NATIVE_ELEMENT_SELECTORS),
    },
  },
])
