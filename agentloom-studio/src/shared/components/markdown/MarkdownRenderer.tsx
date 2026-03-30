import { memo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import { cn } from '@/shared/lib/utils'
import { MermaidBlock } from './MermaidBlock'

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex, rehypeHighlight]

type CodeComponentProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean
  node?: unknown
}

function CodeBlock({ className, children, inline, ...rest }: CodeComponentProps) {
  const match = /language-(\w+)/.exec(className ?? '')
  const language = match?.[1]

  // Collect text content from children
  const textContent = String(children).replace(/\n$/, '')

  if (!inline && language === 'mermaid') {
    return <MermaidBlock code={textContent} />
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  )
}

const markdownComponents = {
  code: CodeBlock,
} as const

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
        'prose prose-invert prose-sm max-w-none',
        // Code blocks
        '[&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        // Inline code
        '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-zinc-800 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-info [&_:not(pre)>code]:text-xs',
        // Links
        '[&_a]:text-info [&_a]:no-underline hover:[&_a]:underline',
        // Tables
        '[&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface-elevated [&_th]:px-3 [&_th]:py-1.5',
        '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5',
        // Task lists
        '[&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-primary',
        // Blockquotes
        '[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
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
