import { memo, useEffect, useRef, useState } from 'react'
import { useTheme, type ResolvedTheme } from '@/shared/hooks/use-theme'
import { cn } from '@/shared/lib/utils'

/** 已按哪个主题初始化；主题切换后需重新 initialize 再渲染 */
let mermaidInitializedTheme: ResolvedTheme | null = null

async function initMermaid(theme: ResolvedTheme) {
  if (mermaidInitializedTheme === theme) return
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'neutral',
    securityLevel: 'loose',
    fontFamily: 'JetBrains Mono Variable, monospace',
  })
  mermaidInitializedTheme = theme
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
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        await initMermaid(resolvedTheme)
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
  }, [code, resolvedTheme])

  if (error) {
    return (
      <div className={cn('rounded-lg border border-border', className)}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span>Mermaid 渲染失败</span>
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
          'flex min-h-24 items-center justify-center rounded-lg border border-border p-4',
          className,
        )}
      >
        <span className="text-xs text-muted-foreground">
          正在渲染图表…
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
