import { memo, useMemo, useState, useCallback, Suspense, lazy } from 'react'
import { Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import { detectLanguage } from '../primitives/CodeViewer'
import type { ToolRendererDefinition, ToolRendererProps, ToolSummaryProps } from '../types'

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.DiffEditor })),
)

interface EditEntry {
  oldText: string
  newText: string
}

interface EditArgs {
  path: string
  edits: EditEntry[]
}

function parseArgs(raw: unknown): EditArgs {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return normalizeEditArgs(parsed)
    } catch {
      return { path: '', edits: [] }
    }
  }
  if (raw && typeof raw === 'object') {
    return normalizeEditArgs(raw as Record<string, unknown>)
  }
  return { path: '', edits: [] }
}

function normalizeEditArgs(obj: Record<string, unknown>): EditArgs {
  const path = typeof obj.path === 'string' ? obj.path : ''

  // Batch edits format
  if (Array.isArray(obj.edits)) {
    const edits = obj.edits.map((e: unknown) => {
      const entry = (e ?? {}) as Record<string, unknown>
      return {
        oldText: typeof entry.oldText === 'string' ? entry.oldText : '',
        newText: typeof entry.newText === 'string' ? entry.newText : '',
      }
    })
    return { path, edits }
  }

  // Legacy single-edit format
  const oldText = typeof obj.oldText === 'string' ? obj.oldText : (typeof obj.old_text === 'string' ? obj.old_text : '')
  const newText = typeof obj.newText === 'string' ? obj.newText : (typeof obj.new_text === 'string' ? obj.new_text : '')
  if (oldText || newText) {
    return { path, edits: [{ oldText, newText }] }
  }

  return { path, edits: [] }
}

function TextDiffFallback({ oldText, newText }: { oldText: string; newText: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 font-mono text-xs">
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          原始内容
        </div>
        <pre className="overflow-auto rounded-md bg-error/10 p-2 text-error leading-relaxed whitespace-pre-wrap break-all">
          {oldText || '\u00A0'}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          修改后
        </div>
        <pre className="overflow-auto rounded-md bg-success/10 p-2 text-success leading-relaxed whitespace-pre-wrap break-all">
          {newText || '\u00A0'}
        </pre>
      </div>
    </div>
  )
}

function DiffEditorFallback() {
  return (
    <div className="flex items-center justify-center rounded-md bg-background p-8">
      <span className="text-xs text-muted-foreground">正在加载对比编辑器...</span>
    </div>
  )
}

const DiffView = memo(function DiffView({
  oldText,
  newText,
  language,
}: {
  oldText: string
  newText: string
  language?: string
}) {
  const lineCount = Math.max(
    oldText.split('\n').length,
    newText.split('\n').length,
  )
  const height = Math.min(Math.max(lineCount * 20 + 40, 120), 480)

  return (
    <Suspense fallback={<DiffEditorFallback />}>
      <div className="overflow-hidden rounded-md border border-border">
        <DiffEditor
          height={height}
          original={oldText}
          modified={newText}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            fontSize: 12,
            wordWrap: 'on',
            contextmenu: false,
          }}
        />
      </div>
    </Suspense>
  )
})

const EditSummary = memo(function EditSummary({ toolCall }: ToolSummaryProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const editCount = args.edits.length

  return (
    <span className="truncate font-mono text-xs text-foreground">
      Edit {args.path || '文件'} ({editCount} 项更改)
    </span>
  )
})

const EditDetail = memo(function EditDetail({ toolCall, state }: ToolRendererProps) {
  const args = useMemo(() => parseArgs(toolCall.args), [toolCall.args])
  const [currentIndex, setCurrentIndex] = useState(0)

  const language = useMemo(
    () => (args.path ? detectLanguage(args.path) : undefined),
    [args.path],
  )

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [])

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(args.edits.length - 1, i + 1))
  }, [args.edits.length])

  if (state === 'pending') {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        正在编辑文件...
      </div>
    )
  }

  if (state === 'failed' && toolCall.error) {
    return (
      <pre className="overflow-auto rounded-md bg-error/10 p-3 font-mono text-xs leading-relaxed text-error">
        {toolCall.error}
      </pre>
    )
  }

  if (args.edits.length === 0) {
    return (
      <TextDiffFallback oldText="" newText="" />
    )
  }

  const currentEdit = args.edits[currentIndex]
  if (!currentEdit) return null

  return (
    <div className="space-y-2">
      {args.edits.length > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground">
            第 {currentIndex + 1} / {args.edits.length} 项
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= args.edits.length - 1}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <DiffView
        oldText={currentEdit.oldText}
        newText={currentEdit.newText}
        language={language}
      />
    </div>
  )
})

export const editRendererDefinition: ToolRendererDefinition = {
  Summary: EditSummary,
  Detail: EditDetail,
  icon: Pencil,
}
