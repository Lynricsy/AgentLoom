import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/utils'

let mermaidInitialized = false

async function initMermaid() {
  if (mermaidInitialized) return
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'JetBrains Mono Variable, monospace',
  })
  mermaidInitialized = true
}

let mermaidCounter = 0

interface MermaidBlockProps {
  code: string
  className?: string
}

export const MermaidBlock = memo(function MermaidBlock({
  code,
  className,
}: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${Date.now()}-${++mermaidCounter}`)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        await initMermaid()
        const { default: mermaid } = await import('mermaid')
        const { svg: rendered } = await mermaid.render(idRef.current, code)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setSvg(null)
        }
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className={cn('rounded-lg border border-border', className)}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span>Mermaid (render failed)</span>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {code}
        </pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-border p-6',
          className,
        )}
      >
        <span className="text-xs text-muted-foreground">
          Rendering diagram...
        </span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-x-auto rounded-lg border border-border p-4 [&_svg]:max-w-full',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
})
