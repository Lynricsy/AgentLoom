import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Textarea } from '@/shared/ui/textarea'
import { FormField } from '@/shared/components/form-field/FormField'
import { Badge } from '@/shared/ui/badge'

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
        <FileText className="size-4 shrink-0 text-type-text" />
        <Badge tone="var(--color-type-text)">文本常量</Badge>
      </div>

      <FormField
        label="文本内容"
        htmlFor="text-node-content"
        hint={
          <>
            会自动保存为 <code className="rounded-xs bg-muted px-1 font-mono">text</code> 节点内容，可连接到 <code className="rounded-xs bg-muted px-1 font-mono">system-prompt-in</code> 或任意文本输入端口。
          </>
        }
      >
        <Textarea
          id="text-node-content"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={handleBlur}
          rows={10}
          placeholder="输入系统提示词、固定说明或其他可复用文本…"
          className="font-mono leading-6"
        />
      </FormField>
    </div>
  )
})
