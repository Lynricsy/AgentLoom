import { describe, expect, it, vi } from 'vitest'

import type { AgentEvent } from '../types/agent-event.types'
import type { AgentSession, CreateSessionParams, SessionContext } from '../types/agent-session.types'
import type { ContentBlock } from '../types/content-block.types'
import { AGENT_RUNTIME, type IAgentRuntime } from '../ports/agent-runtime.port'

describe('IAgentRuntime 接口契约', () => {
  function createMockSession(params: CreateSessionParams): AgentSession {
    const context: SessionContext = {
      history: [],
      cwd: params.cwd,
      mcpServers: params.mcpServers,
      workflowState: params.context,
    }
    return {
      id: 'ses_mock_001',
      agentId: params.agentId,
      mode: params.mode,
      context,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function createMockRuntime(): IAgentRuntime {
    return {
      createSession: vi.fn(async (params: CreateSessionParams) => createMockSession(params)),
      loadSession: vi.fn(async (_sessionId: string) => createMockSession({
        agentId: 'agent_loaded',
        mode: 'conversation',
      })),
      prompt: vi.fn(async function* (_sessionId: string, _content: ContentBlock[]) {
        yield { type: 'plan', title: '分析', content: '分析中...' } satisfies AgentEvent
        yield { type: 'message_chunk', content: '回复内容' } satisfies AgentEvent
        yield { type: 'done', stopReason: 'end_turn' } satisfies AgentEvent
      }),
      cancel: vi.fn(async () => undefined),
    }
  }

  describe('AGENT_RUNTIME 注入令牌', () => {
    it('应为 Symbol 类型', () => {
      expect(typeof AGENT_RUNTIME).toBe('symbol')
    })

    it('应包含描述性名称', () => {
      expect(AGENT_RUNTIME.toString()).toContain('AGENT_RUNTIME')
    })
  })

  describe('createSession', () => {
    it('应创建 workflow 模式会话', async () => {
      const runtime = createMockRuntime()
      const params: CreateSessionParams = {
        agentId: 'agent_001',
        mode: 'workflow',
        cwd: '/workspace',
      }

      const session = await runtime.createSession(params)

      expect(session.id).toBeTruthy()
      expect(session.agentId).toBe('agent_001')
      expect(session.mode).toBe('workflow')
      expect(session.status).toBe('active')
      expect(session.context.cwd).toBe('/workspace')
      expect(runtime.createSession).toHaveBeenCalledWith(params)
    })

    it('应创建 conversation 模式会话', async () => {
      const runtime = createMockRuntime()
      const session = await runtime.createSession({
        agentId: 'agent_002',
        mode: 'conversation',
      })

      expect(session.mode).toBe('conversation')
    })

    it('应兼容 MCP 模块的 streamable_http 传输类型', async () => {
      const runtime = createMockRuntime()
      const session = await runtime.createSession({
        agentId: 'agent_003',
        mode: 'workflow',
        mcpServers: {
          docs: {
            transportType: 'streamable_http',
            url: 'https://example.com/mcp',
            headers: {
              Authorization: 'Bearer token',
            },
          },
        },
      })

      expect(session.context.mcpServers?.docs?.transportType).toBe('streamable_http')
      expect(session.context.mcpServers?.docs?.url).toBe('https://example.com/mcp')
      expect(session.context.mcpServers?.docs?.headers?.Authorization).toBe('Bearer token')
    })

    it('应将初始 context 映射为 workflowState', async () => {
      const runtime = createMockRuntime()
      const session = await runtime.createSession({
        agentId: 'agent_004',
        mode: 'workflow',
        context: {
          stepId: 'node_1',
          retryCount: 1,
        },
      })

      expect(session.context.workflowState).toEqual({
        stepId: 'node_1',
        retryCount: 1,
      })
    })
  })

  describe('loadSession', () => {
    it('应加载已有会话', async () => {
      const runtime = createMockRuntime()
      const session = await runtime.loadSession('ses_existing')

      expect(session.status).toBe('active')
      expect(runtime.loadSession).toHaveBeenCalledWith('ses_existing')
    })
  })

  describe('prompt', () => {
    it('应返回 AsyncIterable<AgentEvent> 并按序产出事件', async () => {
      const runtime = createMockRuntime()
      const content: ContentBlock[] = [{ type: 'text', text: '你好' }]
      const events: AgentEvent[] = []

      for await (const event of runtime.prompt('ses_001', content)) {
        events.push(event)
      }

      expect(events).toHaveLength(3)
      expect(events[0]!.type).toBe('plan')
      expect(events[1]!.type).toBe('message_chunk')
      expect(events[2]!.type).toBe('done')
      expect(runtime.prompt).toHaveBeenCalledWith('ses_001', content)
    })

    it('应支持多种 ContentBlock 类型作为输入', async () => {
      const runtime = createMockRuntime()
      const content: ContentBlock[] = [
        { type: 'text', text: '请分析这张图片' },
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
        { type: 'resource_link', uri: 'https://docs.example.com' },
      ]

      const events: AgentEvent[] = []
      for await (const event of runtime.prompt('ses_002', content)) {
        events.push(event)
      }

      expect(events.length).toBeGreaterThan(0)
      expect(runtime.prompt).toHaveBeenCalledWith('ses_002', content)
    })
  })

  describe('cancel', () => {
    it('应取消指定会话', async () => {
      const runtime = createMockRuntime()
      await runtime.cancel('ses_001')

      expect(runtime.cancel).toHaveBeenCalledWith('ses_001')
    })
  })
})
