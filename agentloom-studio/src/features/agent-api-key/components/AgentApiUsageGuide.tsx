import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { API_BASE_URL } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'

import { copyText } from '../lib/clipboard'

/** `VITE_API_BASE_URL` 可能是相对路径（默认 `/api/v1`），示例里需要可直接粘贴的绝对地址 */
function resolveApiBaseUrl(): string {
  const origin = globalThis.location?.origin ?? 'http://localhost'

  return new URL(API_BASE_URL, origin).toString().replace(/\/+$/, '')
}

function buildSnippets(baseUrl: string) {
  return [
    {
      id: 'conversation',
      title: '创建对话',
      description:
        '为终端用户开一个对话。externalUserId 是你系统里的用户标识，只用于筛选与审计。响应里的 data.id 就是对话 ID。',
      code: [
        'export AGENTLOOM_API_KEY="<你的 API Key>"',
        '',
        `curl -X POST "${baseUrl}/agent-api/conversations" \\`,
        '  -H "Authorization: Bearer $AGENTLOOM_API_KEY" \\',
        '  -H "Content-Type: application/json" \\',
        '  -d \'{"externalUserId": "user-1024"}\'',
      ].join('\n'),
    },
    {
      id: 'run',
      title: '发起 run 并接收流式输出',
      description:
        '带上 Accept: text/event-stream 即可通过 SSE 实时接收输出；同一对话同一时刻只能有一个进行中的 run，否则返回 409。',
      code: [
        'export CONVERSATION_ID="<上一步返回的 data.id>"',
        '',
        `curl -N -X POST "${baseUrl}/agent-api/conversations/$CONVERSATION_ID/runs" \\`,
        '  -H "Authorization: Bearer $AGENTLOOM_API_KEY" \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "Accept: text/event-stream" \\',
        '  -d \'{"input": {"content": "我的订单还没发货"}}\'',
      ].join('\n'),
    },
  ]
}

const SSE_EVENTS = [
  'run.created',
  'run.status',
  'message.delta',
  'tool_call',
  'run.completed',
  'run.failed',
  'run.cancelled',
]

interface CodeSnippetProps {
  step: number
  title: string
  description: string
  code: string
}

function CodeSnippet({ step, title, description, code }: CodeSnippetProps) {
  const { notify } = useToast()
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const outcome = await copyText(code, codeRef.current)

    if (outcome === 'copied') {
      setCopied(true)
      return
    }

    notify({
      variant: 'warning',
      title: '无法自动复制',
      description:
        outcome === 'selected'
          ? '已为你选中示例代码，请按 Ctrl / Cmd + C 手动复制。'
          : '请手动选中示例代码后复制。',
    })
  }

  return (
    <section className="space-y-2" aria-labelledby={`agent-api-step-${step}`}>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
        >
          {step}
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3
            id={`agent-api-step-${step}`}
            className="text-sm font-medium text-foreground"
          >
            {title}
          </h3>
          <p className="text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-card border border-border bg-surface-elevated py-3 pr-12 pl-3 text-xs leading-relaxed">
          <code ref={codeRef} className="font-mono text-foreground">
            {code}
          </code>
        </pre>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 text-muted hover:text-foreground"
          aria-label={`复制「${title}」示例`}
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
      </div>
    </section>
  )
}

export function AgentApiUsageGuide() {
  const snippets = buildSnippets(resolveApiBaseUrl())

  return (
    <div className="space-y-5" data-testid="agent-api-usage-guide">
      {snippets.map((snippet, index) => (
        <CodeSnippet
          key={snippet.id}
          step={index + 1}
          title={snippet.title}
          description={snippet.description}
          code={snippet.code}
        />
      ))}

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">SSE 事件</h3>
        <p className="text-xs leading-relaxed text-muted">
          流中依次出现以下事件，收到 run.completed、run.failed 或 run.cancelled
          后服务端关闭连接。断线后可用 Last-Event-ID 请求
          /runs/&#123;runId&#125;/events 续传。
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="SSE 事件类型">
          {SSE_EVENTS.map((event) => (
            <li key={event}>
              <code className="rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {event}
              </code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
