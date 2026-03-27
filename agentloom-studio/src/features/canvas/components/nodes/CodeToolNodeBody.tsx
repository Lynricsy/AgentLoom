import { memo } from 'react'
import { Code } from 'lucide-react'

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: 'bg-blue-500/15 text-blue-400',
  javascript: 'bg-yellow-500/15 text-yellow-400',
  python: 'bg-green-500/15 text-green-400',
  bash: 'bg-gray-500/15 text-gray-400',
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TS',
  javascript: 'JS',
  python: 'PY',
  bash: 'SH',
}

export const CodeToolNodeBody = memo(function CodeToolNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const language = typeof config.language === 'string' ? config.language : ''
  const code = typeof config.code === 'string' ? config.code : ''

  const lines = code
    ? code.split('\n').slice(0, 3)
    : []

  return (
    <div className="flex flex-col gap-1" data-testid="code-tool-node-body">
      <div className="flex items-center gap-1.5">
        <Code className="h-3.5 w-3.5 shrink-0 text-type-tool" />
        {language ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              LANGUAGE_COLORS[language] ?? 'bg-muted text-muted-foreground'
            }`}
          >
            {LANGUAGE_LABELS[language] ?? language.toUpperCase()}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">
            未选择语言
          </span>
        )}
      </div>
      {lines.length > 0 ? (
        <div className="space-y-0 font-mono text-[10px] leading-[14px] text-muted-foreground">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-1.5 truncate">
              <span className="w-3 shrink-0 text-right text-muted-foreground/40">
                {i + 1}
              </span>
              <span className="truncate">{line || ' '}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/60">未编写代码</p>
      )}
    </div>
  )
})
