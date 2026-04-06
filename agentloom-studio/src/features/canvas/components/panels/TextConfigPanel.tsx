import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'

interface TextConfigPanelProps {
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
}

function readTextValue(config: Record<string, unknown>): string {
  return typeof config.text === 'string' ? config.text : ''
}

export const TextConfigPanel = memo(function TextConfigPanel({
  config,
  onApply,
}: TextConfigPanelProps) {
  const externalText = useMemo(() => readTextValue(config), [config])
  const [text, setText] = useState(externalText)

  useEffect(() => {
    setText(externalText)
  }, [externalText])

  useEffect(() => {
    if (text === externalText) {
      return
    }

    const timer = window.setTimeout(() => {
      onApply({
        ...config,
        text,
      })
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [config, externalText, onApply, text])

  const handleBlur = useCallback(() => {
    if (text === externalText) {
      return
    }

    onApply({
      ...config,
      text,
    })
  }, [config, externalText, onApply, text])

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-type-text" />
        <span className="rounded-full bg-type-text/10 px-2 py-0.5 text-xs font-medium text-type-text">
          文本常量
        </span>
      </div>

      <div>
        <label
          htmlFor="text-node-content"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          文本内容
        </label>
        <textarea
          id="text-node-content"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={handleBlur}
          rows={10}
          placeholder="输入系统提示词、固定说明或其他可复用文本..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-6 text-foreground outline-none focus:border-info"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          会自动保存为 `text` 节点内容，可连接到 `system-prompt-in` 或任意文本输入端口。
        </p>
      </div>
    </div>
  )
})
