import { memo, useCallback, useRef, useState } from 'react'
import { Bot, Brain, ChevronDown, ChevronRight, User } from 'lucide-react'
import { motion } from 'motion/react'
import { DUR, EASE } from '@/shared/lib/motion'
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer'
import { ToolCallCard } from '@/shared/components/tool-renderers'
import type { ToolCallData } from '@/shared/components/tool-renderers/types'
import {
  SubAgentStreamView,
  type ConversationMessage,
  type MessageSegment,
  type SubAgentStream,
} from '@/features/agent-conversation'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'

function toToolCallData(toolCall: ConversationMessage['toolCalls'][number]): ToolCallData {
  return {
    id: toolCall.id,
    tool: toolCall.tool,
    args: toolCall.args,
    result: toolCall.result,
    error: toolCall.error,
    status: toolCall.status,
    permissionDescription: toolCall.permissionRequest?.description,
    permissionResourcePaths: toolCall.permissionRequest?.resourcePaths,
    permissionDomain: toolCall.permissionRequest?.domain,
    permissionCategory: toolCall.permissionRequest?.category,
    permissionRiskLevel: toolCall.permissionRequest?.riskLevel,
    permissionSourceLabel: toolCall.permissionRequest?.sourceLabel,
    permissionTargetType: toolCall.permissionRequest?.targetType,
    permissionTargetLabel: toolCall.permissionRequest?.targetLabel,
    permissionApproveEffect: toolCall.permissionRequest?.approveEffect,
    permissionDenyEffect: toolCall.permissionRequest?.denyEffect,
    permissionDiffPreview: toolCall.permissionRequest?.diffPreview,
    permissionRememberable: toolCall.permissionRequest?.rememberable,
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: 0.25 }}
          transition={{
            duration: DUR.slow,
            ease: EASE,
            repeat: Infinity,
            repeatType: 'reverse',
            delay: index * DUR.fast,
          }}
        />
      ))}
    </div>
  )
}

const ThinkingBlock = memo(function ThinkingBlock({
  content,
}: {
  content: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-card border border-border bg-surface-elevated px-3 py-2">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Brain className="size-3 text-primary" />
        <span className="font-medium">思考过程</span>
        {!open && content.length > 0 && (
          <span className="ml-auto max-w-[200px] truncate text-[10px] text-muted">
            {content.slice(0, 60)}...
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 border-l-2 border-primary/20 pl-5">
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">
            {content}
          </p>
        </div>
      )}
    </div>
  )
})

const UserBubble = memo(function UserBubble({
  message,
}: {
  message: ConversationMessage
}) {
  return (
    <div className="flex flex-row-reverse gap-3 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-foreground">
        <User className="size-4" />
      </div>
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <div className="rounded-2xl rounded-br-md bg-surface-elevated px-4 py-2.5 text-sm leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="px-1 text-[10px] text-muted">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
})

const SegmentRenderer = memo(function SegmentRenderer({
  segment,
  message,
}: {
  segment: MessageSegment
  message: ConversationMessage
}) {
  switch (segment.type) {
    case 'text':
      return <MarkdownRenderer content={segment.content} />
    case 'thinking':
      return <ThinkingBlock content={segment.content} />
    case 'tool_call': {
      const toolCall = message.toolCalls.find(
        (entry) => entry.id === segment.toolCallId,
      )
      if (!toolCall) {
        return null
      }

      const isActive =
        toolCall.status === 'pending' ||
        toolCall.status === 'in_progress' ||
        toolCall.status === 'awaiting_permission'

      return (
        <ToolCallCard
          toolCall={toToolCallData(toolCall)}
          defaultExpanded={isActive}
        />
      )
    }
  }
})

const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: ConversationMessage
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
        <Bot className="size-4" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {message.segments.length > 0 ? (
          message.segments.map((segment, index) => (
            <SegmentRenderer
              key={
                segment.type === 'tool_call'
                  ? `tool-${segment.toolCallId}`
                  : `${segment.type}-${index}`
              }
              segment={segment}
              message={message}
            />
          ))
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : null}

        {message.isStreaming && <TypingIndicator />}

        <span className="block px-1 text-[10px] text-muted">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
})

export interface ExecutionAgentMessageListProps {
  messages: ConversationMessage[]
  subAgentStreams?: Record<string, SubAgentStream>
  isExecuting: boolean
  emptyTitle?: string
  emptyDescription?: string
}

export const ExecutionAgentMessageList = memo(function ExecutionAgentMessageList({
  messages,
  subAgentStreams = {},
  isExecuting,
  emptyTitle = 'Agent 运行尚未开始',
  emptyDescription = '当该节点开始产出文本、工具或思考事件后，这里会显示完整瀑布流。',
}: ExecutionAgentMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const prevMessageCount = useRef(messages.length)

  if (messages.length !== prevMessageCount.current) {
    prevMessageCount.current = messages.length
    if (autoScroll) {
      queueMicrotask(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) {
      return
    }

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAutoScroll(atBottom)
  }, [])

  const childStreams = Object.values(subAgentStreams).sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth
    }

    return a.startedAt - b.startedAt
  })

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      {messages.length === 0 && childStreams.length === 0 ? (
        <div className="flex h-full items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <EmptyState
              className="border-0 px-0 py-0"
              icon={Bot}
              title={emptyTitle}
              description={emptyDescription}
            />
            {isExecuting && <TypingIndicator />}
          </div>
        </div>
      ) : (
        <div className="space-y-1 py-4">
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <AssistantMessage key={message.id} message={message} />
            ),
          )}
          {childStreams.length > 0 && (
            <div className="space-y-3 px-4 py-2">
              <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-muted">
                子 Agent 瀑布流
              </div>
              {childStreams.map((stream) => (
                <SubAgentStreamView key={stream.handle} stream={stream} />
              ))}
            </div>
          )}
          {isExecuting &&
            !messages.some(
              (message) => message.role === 'assistant' && message.isStreaming,
            ) && (
              <div className="flex gap-3 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
                  <Bot className="size-4" />
                </div>
                <div className="py-2.5">
                  <TypingIndicator />
                </div>
              </div>
            )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
})
