import { memo, useCallback, Suspense, lazy, type ChangeEvent } from 'react'
import { Code } from 'lucide-react'
import { useTheme } from '@/shared/hooks/use-theme'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

const LANGUAGES = ['typescript', 'javascript', 'python', 'bash'] as const
type Language = (typeof LANGUAGES)[number]

const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  bash: 'Bash',
}

const MONACO_LANGUAGE_MAP: Record<Language, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  python: 'python',
  bash: 'shell',
}

interface CodeToolConfig {
  language: Language
  code: string
  description: string
  timeout: number
}

interface CodeToolConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

function parseConfig(config: Record<string, unknown>): CodeToolConfig {
  const language = config.language
  const timeout = config.timeout

  return {
    language:
      typeof language === 'string' && LANGUAGES.includes(language as Language)
        ? (language as Language)
        : 'typescript',
    code: typeof config.code === 'string' ? config.code : '',
    description: typeof config.description === 'string' ? config.description : '',
    timeout: typeof timeout === 'number' && timeout > 0 ? timeout : 30,
  }
}

export const CodeToolConfigPanel = memo(function CodeToolConfigPanel({
  config,
  onApply,
  onValidationChange,
}: CodeToolConfigPanelProps) {
  const { resolvedTheme } = useTheme()
  const parsed = parseConfig(config)

  const applyPatch = useCallback(
    (patch: Partial<CodeToolConfig>) => {
      const next = { ...parseConfig(config), ...patch }
      const hasErrors = !next.language
      onValidationChange?.(hasErrors)
      onApply({ config: next })
    },
    [config, onApply, onValidationChange],
  )

  const handleLanguage = useCallback(
    (value: string) => {
      applyPatch({ language: value as Language })
    },
    [applyPatch],
  )

  const handleDescription = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ description: e.target.value })
    },
    [applyPatch],
  )

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      applyPatch({ code: value ?? '' })
    },
    [applyPatch],
  )

  const handleTimeout = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value, 10)
      applyPatch({ timeout: Number.isNaN(v) || v <= 0 ? 30 : Math.min(v, 300) })
    },
    [applyPatch],
  )

  return (
    <div className="space-y-5 px-4 py-4" data-testid="code-tool-config-panel">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4 text-type-tool" />
        <span className="text-xs font-medium text-foreground">Code Executor</span>
      </div>

      {/* 语言选择 */}
      <div>
        <label htmlFor="code-language" className="mb-1 block text-xs font-medium text-foreground">
          语言 <span className="text-error">*</span>
        </label>
        <Select value={parsed.language} onValueChange={handleLanguage}>
          <SelectTrigger id="code-language" aria-label="语言">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {LANGUAGE_LABELS[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 描述 */}
      <div>
        <label htmlFor="code-description" className="mb-1 block text-xs font-medium text-foreground">
          描述
        </label>
        <input
          id="code-description"
          type="text"
          value={parsed.description}
          onChange={handleDescription}
          placeholder="简要描述代码功能"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <hr className="border-border" />

      {/* 代码编辑器 */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          代码
        </label>
        <Suspense
          fallback={
            <div
              className="flex h-[300px] flex-col gap-2 rounded-md border border-border bg-surface p-4"
              data-testid="code-tool-editor-fallback"
            >
              <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted/40" />
            </div>
          }
        >
          <div className="overflow-hidden rounded-md border border-border">
            <MonacoEditor
              height="300px"
              language={MONACO_LANGUAGE_MAP[parsed.language]}
              value={parsed.code}
              onChange={handleCodeChange}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </Suspense>
        <p className="mt-1 text-xs text-muted-foreground">
          通过 input 变量获取上游数据，将结果赋值给 output 变量
        </p>
      </div>

      <hr className="border-border" />

      {/* 超时时间 */}
      <div>
        <label
          htmlFor="code-timeout"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          超时时间（秒）
        </label>
        <input
          id="code-timeout"
          type="number"
          min={1}
          max={300}
          value={parsed.timeout}
          onChange={handleTimeout}
          className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          代码执行超时时间，默认 30 秒，最长 300 秒
        </p>
      </div>
    </div>
  )
})
