import { describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorkerPersistenceService } from '../agent-execution-worker-persistence.service';

/**
 * 子代理会话不注册团队工具：子代理在覆盖其整个执行的租户事务里运行，
 * 若持有团队成员身份，团队写入会长期持有 team_runs 行锁、推迟投递并阻塞截止/取消。
 */
describe('executeSubAgent 与团队工具', () => {
  it('团队成员对话派生的子代理会话不注册团队工具', async () => {
    const runtime = {
      createSession: vi.fn().mockResolvedValue({ id: 'sub-session' }),
      registerSessionToolProvider: vi.fn(),
      unregisterSessionToolProvider: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const teamToolsProvider = {
      createForConversation: vi.fn().mockResolvedValue(() => ({})),
    };
    const service = new AgentExecutionWorkerPersistenceService(
      {} as never,
      {} as never,
      { selectAdapter: () => runtime } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        resolveSystemPromptFromNodes: () => '子代理提示词',
        buildRuntimeConfigFromNodes: () => ({ runtimeMode: 'no_sandbox' }),
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      teamToolsProvider as never,
    );
    vi.spyOn(service, 'runSubAgentPrompt').mockResolvedValue({
      content: '完成',
    } as never);

    await service.executeSubAgent(
      {
        handle: 'sa_000000000001',
        invocationMode: 'call',
        alias: 'helper',
        subAgentRef: { agentDefinitionId: 'agent-sub', alias: 'helper' },
        task: '帮忙',
        parentContext: {
          conversationId: 'team-member-conversation',
          depth: 0,
          tenantId: 'tenant-1',
          parentUsesSandboxRuntime: false,
          visitedAgentIds: new Set(['agent-parent']),
          // 父对话是团队成员对话：即便上下文带有来源，子代理会话也不得获得团队身份
          conversationSource: 'team',
        },
        parentToolCallId: 'call-1',
        depth: 1,
        agentDefinition: {
          id: 'agent-sub',
          name: 'Helper',
          runtimeMode: 'no_sandbox',
          nodes: [],
          edges: [],
          sandboxConfig: null,
        },
        versionSnapshot: {
          snapshot: { nodes: [], edges: [], runtimeMode: 'no_sandbox' },
        },
        abortSignal: new AbortController().signal,
      } as never,
      { abortControllers: new Map() },
    );

    expect(runtime.createSession).toHaveBeenCalled();
    expect(teamToolsProvider.createForConversation).not.toHaveBeenCalled();
    expect(runtime.registerSessionToolProvider).not.toHaveBeenCalled();
  });
});
