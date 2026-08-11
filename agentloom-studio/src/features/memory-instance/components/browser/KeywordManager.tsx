import { useState, useEffect, useRef } from 'react'
import { Tag, X, Save, Plus } from 'lucide-react'
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
    <div className="flex items-start gap-2 text-xs text-muted">
      <Tag size={13} className="mt-0.5 shrink-0" style={{ color: GLOSSARY_TONE }} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium" style={{ color: GLOSSARY_TONE }}>
          Glossary:
        </span>
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px]"
            style={{
              border: `1px solid color-mix(in srgb, ${GLOSSARY_TONE} 30%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${GLOSSARY_TONE} 12%, transparent)`,
              color: GLOSSARY_TONE,
            }}
          >
            {kw}
            <button
              type="button"
              aria-label={`移除关键词 ${kw}`}
              onClick={() => handleRemove(kw)}
              className="opacity-70 transition-opacity hover:opacity-100"
            >
              <X size={9} />
            </button>
          </span>
        ))}
        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
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
              className="w-28 rounded-md border border-input bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              aria-label="保存关键词"
              onClick={handleAdd}
              className="opacity-70 transition-opacity hover:opacity-100"
              style={{ color: GLOSSARY_TONE }}
            >
              <Save size={11} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-border-hover hover:text-foreground"
          >
            <Plus size={9} /> add
          </button>
        )}
      </div>
    </div>
  )
}
