import { describe, expect, it } from 'vitest';

import { testMcpConnectionSchema } from '../../mcp/dto/test-mcp-connection.dto';
import {
  AGENT_RUNTIME,
  ContentBlockSchema,
  isDoneEvent,
  type AgentEvent,
  type AgentSession,
  type ContentBlock,
  type CreateSessionParams,
  type IAgentRuntime,
  type McpServerConfig,
  type McpTransportType,
  type ToolCallEvent,
} from '../index';

describe('agent 模块 barrel 导出契约', () => {
  it('应导出运行时入口与核心 schema', () => {
    expect(typeof AGENT_RUNTIME).toBe('symbol');
    expect(ContentBlockSchema.parse({ type: 'text', text: 'hello' }).type).toBe(
      'text',
    );
    expect(isDoneEvent({ type: 'done', stopReason: 'end_turn' })).toBe(true);
  });

  it('应通过 barrel 暴露关键类型契约', () => {
    const transportType: McpTransportType = 'streamable_http';
    const content: ContentBlock = { type: 'text', text: 'hello' };
    const toolCall: ToolCallEvent = {
      id: 'tc_barrel_001',
      tool: 'noop',
      args: {},
      status: 'pending',
    };
    const event: AgentEvent = { type: 'tool_call', call: toolCall };
    const session: AgentSession = {
      id: 'ses_barrel_001',
      agentId: 'agent_barrel',
      mode: 'workflow',
      context: {
        history: [],
        workflowState: { foo: 'bar' },
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const params: CreateSessionParams = {
      agentId: 'agent_barrel',
      mode: 'workflow',
      context: { foo: 'bar' },
    };
    const runtime: IAgentRuntime | null = null;

    expect(transportType).toBe('streamable_http');
    expect(content.type).toBe('text');
    expect(event.type).toBe('tool_call');
    expect(session.context.workflowState).toEqual({ foo: 'bar' });
    expect(params.context).toEqual({ foo: 'bar' });
    expect(runtime).toBeNull();
  });
});

describe('Story 3.7 与 MCP 模块契约兼容性', () => {
  it('应兼容 MCP HTTP 连接 DTO 的字段命名与头部配置', () => {
    const parsed = testMcpConnectionSchema.parse({
      transportType: 'streamable_http',
      url: 'https://example.com/mcp',
      headers: {
        Authorization: 'Bearer token',
      },
    });

    const config: McpServerConfig = parsed;

    expect(config.transportType).toBe('streamable_http');
    expect(config.url).toBe('https://example.com/mcp');
    expect(config.headers?.Authorization).toBe('Bearer token');
  });
});
