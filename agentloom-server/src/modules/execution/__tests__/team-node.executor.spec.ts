import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionStep } from '../../../database/schema';
import { TeamConfigInvalidException } from '../../team/team.exceptions';
import { TEAM_RUN_START_REQUESTED_EVENT } from '../../team/team.events';
import { TeamNodeExecutor } from '../node-executors/team-node.executor';
import type { NodeExecutionContext } from '../node-executors/node-executor.interface';

const AGENT_A = '019577a0-0000-7000-8000-00000000000a';
const AGENT_B = '019577a0-0000-7000-8000-00000000000b';

const validConfig = {
  members: [
    {
      role: 'locator',
      agentDefinitionId: AGENT_A,
      canMessage: ['implementer'],
    },
    { role: 'implementer', agentDefinitionId: AGENT_B, isLead: true },
  ],
};

function makeContext(
  nodeData: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const runtime = {
    failUnschedulableNode: vi.fn().mockResolvedValue(undefined),
  };
  const step = {
    id: 'step-1',
    executionId: 'execution-1',
    nodeId: 'team-1',
    nodeType: 'team',
    nodeData,
    status: 'pending',
  } as unknown as ExecutionStep;
  const context = {
    executionId: 'execution-1',
    tenantId: 'tenant-1',
    step,
    input,
    snapshot: { nodes: [], edges: [] },
    steps: [step],
    memorySessionIds: [],
    runtime,
  } as unknown as NodeExecutionContext;
  return { context, runtime, step };
}

describe('TeamNodeExecutor', () => {
  const stepStateMachine = { updateStepStatus: vi.fn() };
  const eventEmitter = { emitAsync: vi.fn() };
  const executor = new TeamNodeExecutor(
    stepStateMachine as never,
    eventEmitter as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('配置有效时置 running 并请求启动团队，不等待完成', async () => {
    eventEmitter.emitAsync.mockResolvedValue([{ teamRunId: 'run-1' }]);
    const { context, runtime } = makeContext(
      { config: validConfig },
      { 'task-in': '  修复登录  ', 'context-in': { ticket: 1 } },
    );

    await executor.execute(context);

    expect(stepStateMachine.updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      'step-1',
      'running',
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      TEAM_RUN_START_REQUESTED_EVENT,
      expect.objectContaining({
        tenantId: 'tenant-1',
        executionId: 'execution-1',
        stepId: 'step-1',
        nodeId: 'team-1',
        taskText: '修复登录',
        context: { ticket: 1 },
        config: expect.objectContaining({
          budget: {
            maxTotalTokens: 500_000,
            maxMessages: 200,
            deadlineMinutes: 60,
          },
        }),
      }),
    );
    expect(runtime.failUnschedulableNode).not.toHaveBeenCalled();
  });

  it('配置无效时节点失败且不启动', async () => {
    const { context, runtime, step } = makeContext(
      { config: { members: [] } },
      { 'task-in': '任务' },
    );

    await executor.execute(context);

    expect(runtime.failUnschedulableNode).toHaveBeenCalledWith(
      'tenant-1',
      'execution-1',
      step,
      expect.stringContaining('Team 节点配置无效'),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('缺少任务文本时节点失败', async () => {
    const { context, runtime } = makeContext({ config: validConfig }, {});

    await executor.execute(context);

    expect(runtime.failUnschedulableNode).toHaveBeenCalledWith(
      'tenant-1',
      'execution-1',
      expect.anything(),
      'Team 节点缺少任务文本',
    );
    expect(stepStateMachine.updateStepStatus).not.toHaveBeenCalled();
  });

  it('团队启动失败时以领域错误详情使节点失败', async () => {
    eventEmitter.emitAsync.mockRejectedValue(
      new TeamConfigInvalidException('成员 locator 的 Agent「A」未发布'),
    );
    const { context, runtime } = makeContext(
      { config: validConfig },
      { 'task-in': '任务' },
    );

    await executor.execute(context);

    expect(runtime.failUnschedulableNode).toHaveBeenCalledWith(
      'tenant-1',
      'execution-1',
      expect.anything(),
      '团队启动失败：成员 locator 的 Agent「A」未发布',
    );
  });

  it('没有团队运行时监听器时节点失败', async () => {
    eventEmitter.emitAsync.mockResolvedValue([]);
    const { context, runtime } = makeContext(
      { config: validConfig },
      { 'task-in': '任务' },
    );

    await executor.execute(context);

    expect(runtime.failUnschedulableNode).toHaveBeenCalledWith(
      'tenant-1',
      'execution-1',
      expect.anything(),
      '团队运行时未加载，无法启动 Team 节点',
    );
  });
});
