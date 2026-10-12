import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Tag, X, Save, Plus } from 'lucide-react'
import { fadeIn } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useAddGlossaryKeyword, useRemoveGlossaryKeyword } from '../../api/memoryInstanceMutations'

interface KeywordManagerProps {
  keywords: string[]
  instanceId: string
  nodeId: string
  onUpdate?: () => void
}

const GLOSSARY_TONE = 'var(--color-type-knowledge)'

export function KeywordManager({
  keywords,
  instanceId,
  nodeId,
  onUpdate,
}: KeywordManagerProps) {
  const [adding, setAdding] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addMutation = useAddGlossaryKeyword(instanceId)
  const removeMutation = useRemoveGlossaryKeyword(instanceId)

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  function handleAdd() {
    const kw = newKeyword.trim()
    if (!kw || !nodeId) return
    addMutation.mutate(
      { nodeId, keyword: kw },
      {
        onSuccess: () => {
          setNewKeyword('')
          setAdding(false)
          onUpdate?.()
        },
      },
    )
  }

  function handleRemove(kw: string) {
    if (!nodeId) return
    removeMutation.mutate(
      { nodeId, keyword: kw },
      { onSuccess: () => onUpdate?.() },
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAdd()
    if (e.key === 'Escape') {
      setAdding(false)
      setNewKeyword('')
    }
  }

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Tag className="mt-1.5 size-3.5 shrink-0" style={{ color: GLOSSARY_TONE }} />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="font-medium" style={{ color: GLOSSARY_TONE }}>
          术语表：
        </span>
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md py-0.5 pl-1.5 pr-0.5 font-mono text-2xs"
            style={{
              border: `1px solid color-mix(in srgb, ${GLOSSARY_TONE} 30%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${GLOSSARY_TONE} 12%, transparent)`,
              color: GLOSSARY_TONE,
            }}
          >
            <span className="min-w-0 truncate" title={kw}>
              {kw}
            </span>
            {/* 24px 点击区（icon-2xs），不再是 9px 的图标本身 */}
            <Button
              variant="ghost"
              size="icon-2xs"
              aria-label={`移除关键词 ${kw}`}
              onClick={() => handleRemove(kw)}
              className="shrink-0 text-inherit opacity-70 transition-opacity duration-150 hover:bg-transparent hover:opacity-100"
            >
              <X />
            </Button>
          </span>
        ))}
        <AnimatePresence mode="wait" initial={false}>
          {adding ? (
            <motion.span key="input" {...fadeIn} className="inline-flex items-center gap-1">
              <Input
                ref={inputRef}
                type="text"
                aria-label="新增术语表关键词"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newKeyword.trim()) setAdding(false)
                }}
                placeholder="关键词…"
                className="h-7 w-32 px-2 font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="保存关键词"
                onClick={handleAdd}
                style={{ color: GLOSSARY_TONE }}
              >
                <Save />
              </Button>
            </motion.span>
          ) : (
            <motion.span key="add" {...fadeIn} className="inline-flex">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setAdding(true)}
                className="border-dashed font-normal text-muted-foreground hover:text-foreground"
              >
                <Plus />
                添加
              </Button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
