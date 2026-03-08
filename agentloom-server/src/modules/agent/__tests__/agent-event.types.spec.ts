import { describe, expect, it } from 'vitest'

import type { AgentEvent } from '../types/agent-event.types'
import {
  isDoneEvent,
  isMessageChunkEvent,
  isPlanEvent,
  isToolCallEvent,
} from '../types/agent-event.types'
import type { ToolCallEvent } from '../types/tool-call-event.types'

describe('AgentEvent 类型守卫', () => {
  const planEvent: AgentEvent = {
    type: 'plan',
    title: '分析需求',
    content: '正在分析用户输入...',
  }

  const messageChunkEvent: AgentEvent = {
    type: 'message_chunk',
    content: '这是一段回复文本',
  }

  const toolCallEvent: AgentEvent = {
    type: 'tool_call',
    call: {
      id: 'tc_001',
      tool: 'readFile',
      args: { path: '/tmp/test.txt' },
      status: 'pending',
    } satisfies ToolCallEvent,
  }

  const doneEvent: AgentEvent = {
    type: 'done',
    stopReason: 'end_turn',
  }

  describe('isPlanEvent', () => {
    it('应识别 plan 事件', () => {
      expect(isPlanEvent(planEvent)).toBe(true)
    })

    it('应排除非 plan 事件', () => {
      expect(isPlanEvent(messageChunkEvent)).toBe(false)
      expect(isPlanEvent(toolCallEvent)).toBe(false)
      expect(isPlanEvent(doneEvent)).toBe(false)
    })
  })

  describe('isMessageChunkEvent', () => {
    it('应识别 message_chunk 事件', () => {
      expect(isMessageChunkEvent(messageChunkEvent)).toBe(true)
    })

    it('应排除非 message_chunk 事件', () => {
      expect(isMessageChunkEvent(planEvent)).toBe(false)
    })
  })

  describe('isToolCallEvent', () => {
    it('应识别 tool_call 事件', () => {
      expect(isToolCallEvent(toolCallEvent)).toBe(true)
    })

    it('应排除非 tool_call 事件', () => {
      expect(isToolCallEvent(doneEvent)).toBe(false)
    })
  })

  describe('isDoneEvent', () => {
    it('应识别 done 事件', () => {
      expect(isDoneEvent(doneEvent)).toBe(true)
    })

    it('应排除非 done 事件', () => {
      expect(isDoneEvent(planEvent)).toBe(false)
    })
  })
})

describe('ToolCallEvent 类型验证', () => {
  it('应支持完整的 ToolCallEvent 结构', () => {
    const event: ToolCallEvent = {
      id: 'tc_002',
      tool: 'writeFile',
      args: { path: '/tmp/out.txt', content: 'hello' },
      status: 'completed',
      result: { bytesWritten: 5 },
    }
    expect(event.status).toBe('completed')
    expect(event.result).toBeDefined()
  })

  it('应支持 awaiting_permission 状态', () => {
    const event: ToolCallEvent = {
      id: 'tc_003',
      tool: 'deleteFile',
      args: { path: '/important/file.txt' },
      status: 'awaiting_permission',
      permissionRequest: {
        description: '删除重要文件需要确认',
        resourcePaths: ['/important/file.txt'],
      },
    }
    expect(event.status).toBe('awaiting_permission')
    expect(event.permissionRequest?.description).toBeTruthy()
    expect(event.permissionRequest?.resourcePaths).toHaveLength(1)
  })

  it('应支持 failed 状态带错误信息', () => {
    const event: ToolCallEvent = {
      id: 'tc_004',
      tool: 'runCommand',
      args: { cmd: 'npm test' },
      status: 'failed',
      error: 'Command exited with code 1',
    }
    expect(event.status).toBe('failed')
    expect(event.error).toBeTruthy()
  })

  it('应支持所有 StopReason 值', () => {
    const reasons = ['end_turn', 'max_tokens', 'tool_use', 'cancelled'] as const
    for (const reason of reasons) {
      const event: AgentEvent = { type: 'done', stopReason: reason }
      expect(isDoneEvent(event)).toBe(true)
    }
  })
})
