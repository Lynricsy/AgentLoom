import { useState, useEffect, useRef } from 'react'
import { Tag, X, Save, Plus } from 'lucide-react'
import { useAddGlossaryKeyword, useRemoveGlossaryKeyword } from '../../api/memoryInstanceMutations'

interface KeywordManagerProps {
  keywords: string[]
  instanceId: string
  nodeId: string
  onUpdate?: () => void
}

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
      <Tag size={13} className="mt-0.5 shrink-0 text-amber-700" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-amber-700">Glossary:</span>
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded border border-amber-800/30 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[11px] text-amber-400/80"
          >
            {kw}
            <button
              type="button"
              onClick={() => handleRemove(kw)}
              className="text-amber-700 transition-colors hover:text-amber-400"
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
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newKeyword.trim()) setAdding(false)
              }}
              placeholder="keyword..."
              className="w-28 rounded border border-amber-800/40 bg-background px-1.5 py-0.5 font-mono text-[11px] text-amber-300 focus:border-amber-500/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="text-amber-600 transition-colors hover:text-amber-400"
            >
              <Save size={11} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-amber-800/30 px-1.5 py-0.5 text-[11px] text-amber-700 transition-colors hover:border-amber-600/40 hover:text-amber-400"
          >
            <Plus size={9} /> add
          </button>
        )}
      </div>
    </div>
  )
}
