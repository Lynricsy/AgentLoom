import {
  memo,
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import { cn } from '@/shared/lib/utils'
import { MermaidBlock } from './MermaidBlock'

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex, rehypeHighlight]

/* ─── 复制按钮 ─────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
        copied
          ? 'text-success'
          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/10',
      )}
    >
      {copied ? (
        <>
          <Check className="size-3" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>复制</span>
        </>
      )}
    </button>
  )
}

/* ─── 代码块包裹器（语言标签 + 复制按钮） ────────────────── */

function CodeBlockWrapper({
  language,
  children,
  raw,
}: {
  language?: string
  children: ReactNode
  raw: string
}) {
  return (
    <div className="group relative rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-surface-elevated/60 px-3 py-1 border-b border-border">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {language || 'code'}
        </span>
        <CopyButton text={raw} />
      </div>
      {children}
    </div>
  )
}

/* ─── 自定义 code 组件 ─────────────────────────────────── */

type PreProps = ComponentPropsWithoutRef<'pre'> & { node?: unknown }

function PreBlock({ children, node: _node, ...rest }: PreProps) {
  // 从 children 中提取 code 元素信息
  const codeChild = Array.isArray(children) ? children[0] : children
  const codeProps =
    codeChild &&
    typeof codeChild === 'object' &&
    'props' in codeChild
      ? (codeChild as { props: Record<string, unknown> }).props
      : null

  const className = (codeProps?.className as string) ?? ''
  const match = /language-(\w+)/.exec(className)
  const language = match?.[1]
  const raw = String(codeProps?.children ?? '').replace(/\n$/, '')

  // Mermaid 特殊处理
  if (language === 'mermaid') {
    return <MermaidBlock code={raw} />
  }

  return (
    <CodeBlockWrapper language={language} raw={raw}>
      <pre
        className={cn('!m-0 !rounded-none !border-0 overflow-x-auto', className)}
        {...rest}
      >
        {children}
      </pre>
    </CodeBlockWrapper>
  )
}

type CodeComponentProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean
  node?: unknown
}

function InlineCode({ className, children, inline, node: _node, ...rest }: CodeComponentProps) {
  // 行内 code 不做特殊处理，样式由 prose-agent CSS 控制
  if (inline) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  }

  // 块级 code（在 pre 内部），保持原样
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  )
}

/* ─── Markdown 组件映射 ────────────────────────────────── */

const markdownComponents = {
  pre: PreBlock,
  code: InlineCode,
} as const

/* ─── MarkdownRenderer ─────────────────────────────────── */

export interface MarkdownRendererProps {
  content: string
  className?: string
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert prose-agent',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-p:leading-relaxed',
        'prose-li:leading-relaxed',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
