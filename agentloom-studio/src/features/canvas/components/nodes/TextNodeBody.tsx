import { memo } from 'react'
import { FileText } from 'lucide-react'

interface TextNodeBodyProps {
  config: Record<string, unknown>
}

function readText(config: Record<string, unknown>): string {
  return typeof config.text === 'string' ? config.text.trim() : ''
}

export const TextNodeBody = memo(function TextNodeBody({
  config,
}: TextNodeBodyProps) {
  const text = readText(config)

  if (!text) {
    return (
      <div className="flex items-center gap-2 text-xs italic text-muted-foreground/60">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>输入文本内容</span>
      </div>
    )
  }

  const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-type-text" />
        <span className="rounded bg-type-text/15 px-1.5 py-0.5 text-[10px] font-medium text-type-text">
          Text
        </span>
      </div>
      <p className="max-h-24 overflow-hidden whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {preview}
      </p>
    </div>
  )
})
