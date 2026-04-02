import { memo, useCallback, type ChangeEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'

export interface DynamicPortEntry {
  id: string
  label: string
}

interface DynamicPortEditorProps {
  ports: DynamicPortEntry[]
  onChange: (ports: DynamicPortEntry[]) => void
  minPorts?: number
  maxPorts?: number
  createPortId: (index: number) => string
  createDefaultLabel: (index: number) => string
  addLabel?: string
}

/**
 * 通用可复用的端口编辑器组件。
 * 支持添加、删除、重命名端口，可被多种节点的 config panel 复用。
 */
export const DynamicPortEditor = memo(function DynamicPortEditor({
  ports,
  onChange,
  minPorts = 1,
  maxPorts = 10,
  createPortId,
  createDefaultLabel,
  addLabel = '添加端口',
}: DynamicPortEditorProps) {
  const handleLabelChange = useCallback(
    (index: number, e: ChangeEvent<HTMLInputElement>) => {
      const next = [...ports]
      next[index] = { ...next[index]!, label: e.target.value }
      onChange(next)
    },
    [ports, onChange],
  )

  const handleAdd = useCallback(() => {
    if (ports.length >= maxPorts) {
      return
    }

    const nextIndex = ports.length
    onChange([
      ...ports,
      { id: createPortId(nextIndex), label: createDefaultLabel(nextIndex) },
    ])
  }, [ports, maxPorts, createPortId, createDefaultLabel, onChange])

  const handleRemove = useCallback(
    (index: number) => {
      if (ports.length <= minPorts) {
        return
      }

      onChange(ports.filter((_, i) => i !== index))
    },
    [ports, minPorts, onChange],
  )

  return (
    <div className="space-y-2">
      {ports.map((port, index) => (
        <div key={port.id} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          <input
            type="text"
            value={port.label}
            onChange={(e) => handleLabelChange(index, e)}
            placeholder={createDefaultLabel(index)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            disabled={ports.length <= minPorts}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            aria-label={`删除 ${port.label}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {ports.length < maxPorts ? (
        <button
          type="button"
          onClick={handleAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
})
