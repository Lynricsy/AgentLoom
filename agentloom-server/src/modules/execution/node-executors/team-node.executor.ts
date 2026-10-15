/**
 * Team 节点执行器：校验配置与任务输入，把步骤置为 running 后请求团队运行时启动，不等待完成。
 *
 * 团队运行由 TeamModule 承载（它依赖本模块的调度器与状态机），本模块不能反向导入，
 * 因此经 `team.run.start-requested` 事件请求启动；团队结束时由 TeamRunService 推进步骤。
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { TeamNodeConfigSchema } from '@agentloom/contracts';

import { DomainException } from '../../../common/exceptions/domain.exception';
import {
  TEAM_RUN_START_REQUESTED_EVENT,
  type TeamRunStartedResult,
  type TeamRunStartRequestedEvent,
} from '../../team/team.events';
import { getRuntimeNodeData, isRecord } from '../node-value.util';
import { StepStateMachineService } from '../step-state-machine.service';
import type {
  NodeExecutionContext,
  NodeExecutor,
} from './node-executor.interface';

@Injectable()
export class TeamNodeExecutor implements NodeExecutor {
  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    const { tenantId, executionId, step, input } = context;
    const nodeData = step.nodeData ?? {};
    // 配置存于 node.data.config；兼容直接落在节点数据顶层的写法
    const parsed = TeamNodeConfigSchema.safeParse(
      isRecord(nodeData.config)
        ? nodeData.config
        : getRuntimeNodeData(nodeData),
    );
    if (!parsed.success) {
      await context.runtime.failUnschedulableNode(
        tenantId,
        executionId,
        step,
        `Team 节点配置无效：${z.prettifyError(parsed.error)}`,
      );
      return;
    }

    const taskInput = input['task-in'] ?? input.task;
    const taskText = typeof taskInput === 'string' ? taskInput.trim() : '';
    if (!taskText) {
      await context.runtime.failUnschedulableNode(
        tenantId,
        executionId,
        step,
        'Team 节点缺少任务文本',
      );
      return;
    }

    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    const request: TeamRunStartRequestedEvent = {
      tenantId,
      executionId,
      stepId: step.id,
      nodeId: step.nodeId,
      config: parsed.data,
      taskText,
      context: input['context-in'] ?? null,
    };
    let started: TeamRunStartedResult[];
    try {
      started = (await this.eventEmitter.emitAsync(
        TEAM_RUN_START_REQUESTED_EVENT,
        request,
      )) as TeamRunStartedResult[];
    } catch (error) {
      const detail =
        error instanceof DomainException
          ? error.detail
          : error instanceof Error
            ? error.message
            : String(error);
      await context.runtime.failUnschedulableNode(
        tenantId,
        executionId,
        step,
        `团队启动失败：${detail}`,
      );
      return;
    }

    if (started.length === 0) {
      await context.runtime.failUnschedulableNode(
        tenantId,
        executionId,
        step,
        '团队运行时未加载，无法启动 Team 节点',
      );
    }
  }
}
