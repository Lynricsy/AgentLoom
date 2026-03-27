import { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionPromptHandler } from '../handlers/session-prompt.handler';
import type { AcpConnectionState } from '../acp-types';

describe('SessionPromptHandler', () => {
  it('应映射 runtime events、向 ACP client 请求工具授权并返回终态 stopReason', async () => {
    const runtime = {
      prompt: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            type: 'plan',
            title: '先读取上下文',
            content: '确认需求后再回复',
          };
          yield {
            type: 'message_chunk',
            content: '你好，主人',
          };
          yield {
            type: 'tool_call',
            call: {
              id: 'tool-1',
              tool: 'filesystem.read',
              args: {
                path: '/workspace/demo.txt',
              },
              status: 'awaiting_permission',
              permissionRequest: {
                description: '需要读取 demo 文件',
              },
            },
          };
          yield {
            type: 'done',
            stopReason: 'end_turn',
          };
        })(),
      ),
      resolveToolPermission: vi.fn().mockResolvedValue(undefined),
    };
    const moduleRef = {
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef;
    const handler = new SessionPromptHandler(moduleRef);
    const emitNotification = vi.fn().mockResolvedValue(undefined);
    const requestClient = vi.fn().mockReturnValue({
      requestId: 'acp-server-1',
      response: Promise.resolve({
        outcome: {
          outcome: 'selected',
          optionId: 'allow-once',
        },
      }),
    });
    const state: AcpConnectionState = {
      initialized: true,
      authContext: {
        userId: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        tenantRole: 'owner',
        orgId: 'org-1',
        authMethod: 'jwt',
      },
      sessions: new Map([
        [
          'session-001',
          {
            sessionId: 'session-001',
            runtimeSessionId: 'runtime-session-001',
            agentId: 'agent-001',
            tenantId: 'tenant-1',
          },
        ],
      ]),
      emitNotification,
      requestClient,
    };

    const result = await handler.handle(
      {
        sessionId: 'session-001',
        content: [
          {
            type: 'text',
            text: '你好',
          },
        ],
      },
      state,
      42,
    );

    expect(runtime.prompt).toHaveBeenCalledWith('runtime-session-001', [
      {
        type: 'text',
        text: '你好',
      },
    ]);
    expect(emitNotification).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-001',
        update: {
          type: 'plan',
          title: '先读取上下文',
          content: '确认需求后再回复',
        },
      },
    });
    expect(emitNotification).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-001',
        update: {
          type: 'agent_message_chunk',
          content: '你好，主人',
        },
      },
    });
    expect(emitNotification).toHaveBeenNthCalledWith(3, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-001',
        update: {
          type: 'tool_call',
          call: {
            id: 'tool-1',
            tool: 'filesystem.read',
            args: {
              path: '/workspace/demo.txt',
            },
            status: 'awaiting_permission',
            permissionRequest: {
              description: '需要读取 demo 文件',
            },
          },
        },
      },
    });
    expect(requestClient).toHaveBeenCalledWith('session/request_permission', {
      sessionId: 'session-001',
      toolCall: {
        toolCallId: 'tool-1',
        title: 'filesystem.read',
        kind: 'tool_call',
        status: 'awaiting_permission',
        content: [
          {
            type: 'text',
            text: '需要读取 demo 文件',
          },
        ],
      },
      options: [
        {
          optionId: 'allow-once',
          name: '允许一次',
          kind: 'allow_once',
        },
        {
          optionId: 'allow-always',
          name: '始终允许',
          kind: 'allow_always',
        },
        {
          optionId: 'reject-once',
          name: '拒绝一次',
          kind: 'reject_once',
        },
        {
          optionId: 'reject-always',
          name: '始终拒绝',
          kind: 'reject_always',
        },
      ],
    });
    expect(runtime.resolveToolPermission).toHaveBeenCalledWith(
      'runtime-session-001',
      'tool-1',
      'approve',
    );
    expect(result).toEqual({
      stopReason: 'end_turn',
    });
    expect(
      state.sessions?.get('session-001')?.activePromptRequestId,
    ).toBeUndefined();
    expect(
      state.sessions?.get('session-001')?.pendingPermissionRequestId,
    ).toBeUndefined();
  });

  it('应显式保留 intervention_required 终态并发出 decision 更新', async () => {
    const runtime = {
      prompt: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            type: 'decision',
            suggestedContent: '请先授权工具调用',
            rationale: '需要主人确认',
            selectedAction: 'request-approval',
          };
          yield {
            type: 'done',
            stopReason: 'intervention_required',
          };
        })(),
      ),
    };
    const handler = new SessionPromptHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);
    const emitNotification = vi.fn().mockResolvedValue(undefined);

    const result = await handler.handle(
      {
        sessionId: 'session-002',
        content: [
          {
            type: 'text',
            text: '继续',
          },
        ],
      },
      {
        initialized: true,
        authContext: {
          userId: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          tenantRole: 'owner',
          orgId: 'org-1',
          authMethod: 'jwt',
        },
        sessions: new Map([
          [
            'session-002',
            {
              sessionId: 'session-002',
              runtimeSessionId: 'runtime-session-002',
              agentId: 'agent-001',
              tenantId: 'tenant-1',
            },
          ],
        ]),
        emitNotification,
      },
      7,
    );

    expect(emitNotification).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-002',
        update: {
          type: 'decision',
          suggestedContent: '请先授权工具调用',
          rationale: '需要主人确认',
          selectedAction: 'request-approval',
        },
      },
    });
    expect(result).toEqual({
      stopReason: 'intervention_required',
    });
  });

  it('应拒绝空 content', async () => {
    const handler = new SessionPromptHandler({
      get: vi.fn(),
    } as unknown as ModuleRef);

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
          content: [],
        },
        {
          initialized: true,
          authContext: {
            userId: 'user-1',
            email: 'user@example.com',
            tenantId: 'tenant-1',
            tenantRole: 'owner',
            orgId: 'org-1',
            authMethod: 'jwt',
          },
          sessions: new Map([
            [
              'session-001',
              {
                sessionId: 'session-001',
                runtimeSessionId: 'runtime-session-001',
                agentId: 'agent-001',
                tenantId: 'tenant-1',
              },
            ],
          ]),
        },
        1,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });

  it('应在当前连接 tenant 与已跟踪 session 不一致时拒绝 prompt', async () => {
    const runtime = {
      prompt: vi.fn(),
    };
    const handler = new SessionPromptHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);

    await expect(
      handler.handle(
        {
          sessionId: 'session-tenant-a',
          content: [
            {
              type: 'text',
              text: '继续',
            },
          ],
        },
        {
          initialized: true,
          authContext: {
            userId: 'user-2',
            email: 'user@example.com',
            tenantId: 'tenant-b',
            tenantRole: 'owner',
            orgId: 'org-2',
            authMethod: 'jwt',
          },
          sessions: new Map([
            [
              'session-tenant-a',
              {
                sessionId: 'session-tenant-a',
                runtimeSessionId: 'runtime-session-a',
                agentId: 'agent-001',
                tenantId: 'tenant-a',
              },
            ],
          ]),
        },
        9,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: {
        sessionId: 'session-tenant-a',
        reason: 'Session not found',
      },
    });

    expect(runtime.prompt).not.toHaveBeenCalled();
  });

  it('应在 ACP client 返回 cancelled 时取消当前 runtime prompt', async () => {
    let cancelled = false;
    const runtime = {
      prompt: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            type: 'tool_call',
            call: {
              id: 'tool-cancel',
              tool: 'filesystem.read',
              args: {},
              status: 'awaiting_permission',
              permissionRequest: {
                description: '等待主人取消',
              },
            },
          };
          yield {
            type: 'done',
            stopReason: cancelled ? 'cancelled' : 'end_turn',
          };
        })(),
      ),
      cancel: vi.fn().mockImplementation(async () => {
        cancelled = true;
      }),
      resolveToolPermission: vi.fn(),
    };
    const handler = new SessionPromptHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);

    const result = await handler.handle(
      {
        sessionId: 'session-cancel',
        content: [
          {
            type: 'text',
            text: '继续',
          },
        ],
      },
      {
        initialized: true,
        authContext: {
          userId: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          tenantRole: 'owner',
          orgId: 'org-1',
          authMethod: 'jwt',
        },
        sessions: new Map([
          [
            'session-cancel',
            {
              sessionId: 'session-cancel',
              runtimeSessionId: 'runtime-session-cancel',
              agentId: 'agent-001',
              tenantId: 'tenant-1',
            },
          ],
        ]),
        emitNotification: vi.fn().mockResolvedValue(undefined),
        requestClient: vi.fn().mockReturnValue({
          requestId: 'acp-server-2',
          response: Promise.resolve({
            outcome: {
              outcome: 'cancelled',
            },
          }),
        }),
      },
      11,
    );

    expect(runtime.cancel).toHaveBeenCalledWith('runtime-session-cancel');
    expect(runtime.resolveToolPermission).not.toHaveBeenCalled();
    expect(result).toEqual({
      stopReason: 'cancelled',
    });
  });
});
