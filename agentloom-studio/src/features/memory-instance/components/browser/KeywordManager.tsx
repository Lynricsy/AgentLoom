import { useState, useEffect, useRef } from 'react'
import { Tag, X, Save, Plus } from 'lucide-react'
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
      <Tag size={13} className="mt-0.5 shrink-0" style={{ color: GLOSSARY_TONE }} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium" style={{ color: GLOSSARY_TONE }}>
          Glossary:
        </span>
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs"
            style={{
              border: `1px solid color-mix(in srgb, ${GLOSSARY_TONE} 30%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${GLOSSARY_TONE} 12%, transparent)`,
              color: GLOSSARY_TONE,
            }}
          >
            {kw}
            <Button
              variant="ghost"
              aria-label={`移除关键词 ${kw}`}
              onClick={() => handleRemove(kw)}
              className="h-auto p-0 text-inherit opacity-70 transition-opacity hover:bg-transparent hover:opacity-100 [&_svg]:size-[9px]"
            >
              <X size={9} />
            </Button>
          </span>
        ))}
        {adding ? (
          <span className="inline-flex items-center gap-1">
            <Input
              ref={inputRef}
              type="text"
              aria-label="新增 Glossary 关键词"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newKeyword.trim()) setAdding(false)
              }}
              placeholder="keyword..."
              className="h-auto w-28 bg-background px-1.5 py-0.5 font-mono text-2xs shadow-none"
            />
            <Button
              variant="ghost"
              aria-label="保存关键词"
              onClick={handleAdd}
              className="h-auto p-0 opacity-70 transition-opacity hover:bg-transparent hover:opacity-100 [&_svg]:size-[11px]"
              style={{ color: GLOSSARY_TONE }}
            >
              <Save size={11} />
            </Button>
          </span>
        ) : (
          <Button
            variant="outline"
            onClick={() => setAdding(true)}
            className="h-auto gap-0.5 border-dashed bg-transparent px-1.5 py-0.5 text-2xs font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground [&_svg]:size-[9px]"
          >
            <Plus size={9} /> add
          </Button>
        )}
      </div>
    </div>
  )
}
