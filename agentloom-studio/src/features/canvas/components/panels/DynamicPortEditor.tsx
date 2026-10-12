import { memo, useCallback, type ChangeEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { fadeInUp } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

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
      <AnimatePresence initial={false}>
        {ports.map((port, index) => (
          <motion.div
            key={port.id}
            layout
            {...fadeInUp}
            className="flex items-center gap-2"
          >
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
            <Input
              type="text"
              value={port.label}
              onChange={(e) => handleLabelChange(index, e)}
              placeholder={createDefaultLabel(index)}
              className="h-7 min-w-0 flex-1 px-2 py-1 text-xs placeholder:text-subtle-foreground/50"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleRemove(index)}
              disabled={ports.length <= minPorts}
              className="shrink-0 text-muted-foreground hover:bg-error/10 hover:text-error disabled:opacity-30"
              aria-label={`删除 ${port.label}`}
            >
              <Trash2 />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
      {ports.length < maxPorts ? (
        <Button
          variant="outline"
          size="xs"
          onClick={handleAdd}
          className="w-full border-dashed font-normal text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus />
          {addLabel}
        </Button>
      ) : null}
    </div>
  )
})
