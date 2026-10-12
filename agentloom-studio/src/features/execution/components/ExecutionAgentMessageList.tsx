import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Brain, ChevronDown, User } from 'lucide-react'
import { motion } from 'motion/react'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { formatTime } from '@/shared/lib/format'
import { DUR, EASE, fadeInUp } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
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

/** 思考摘要最多展示的字符数，超出才追加省略号 */
const THINKING_PREVIEW_LENGTH = 60

/** 距底部小于该距离时视为「贴底」，新内容到达时继续跟随滚动 */
const FOLLOW_THRESHOLD_PX = 80

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
  const preview =
    content.length > THINKING_PREVIEW_LENGTH
      ? `${content.slice(0, THINKING_PREVIEW_LENGTH)}…`
      : content

  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-1">
      <Button
        variant="ghost"
        size="xs"
        aria-expanded={open}
        className="w-full justify-start px-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-150',
            !open && '-rotate-90',
          )}
        />
        <Brain className="text-primary" />
        <span className="shrink-0 font-medium">思考过程</span>
        {!open && content.length > 0 && (
          <span className="ml-auto min-w-0 max-w-48 truncate text-2xs text-muted-foreground">
            {preview}
          </span>
        )}
      </Button>

      <Collapse open={open}>
        <div className="mb-1 mt-1 border-l-2 border-primary/20 pl-5">
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
            {content}
          </p>
        </div>
      </Collapse>
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
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <User className="size-4" />
      </div>
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <div className="rounded-xl rounded-br-md bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="px-1 text-2xs text-muted-foreground tabular-nums">
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

        <span className="block px-1 text-2xs text-muted-foreground tabular-nums">
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
  const followRef = useRef(true)
  /** 首次渲染时已存在的消息视为历史，不播放入场；之后追加的消息淡入 */
  const historyIdsRef = useRef<Set<string> | null>(null)
  if (historyIdsRef.current === null) {
    historyIdsRef.current = new Set(messages.map((message) => message.id))
  }
  const historyIds = historyIdsRef.current

  // 内容变化（包括流式增长）后，仅在用户贴底时跟随到底部
  useLayoutEffect(() => {
    const el = containerRef.current
    if (el && followRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, subAgentStreams, isExecuting])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) {
      return
    }

    followRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX
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
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={historyIds.has(message.id) ? false : fadeInUp.initial}
              animate={fadeInUp.animate}
              transition={fadeInUp.transition}
            >
              {message.role === 'user' ? (
                <UserBubble message={message} />
              ) : (
                <AssistantMessage message={message} />
              )}
            </motion.div>
          ))}
          {childStreams.length > 0 && (
            <div className="space-y-3 px-4 py-2">
              <div className="px-1 text-2xs font-medium tracking-wide text-muted-foreground">
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
    </div>
  )
})
