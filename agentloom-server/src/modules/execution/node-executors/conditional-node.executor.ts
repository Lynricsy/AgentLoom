/**
 * 条件节点执行器：拥有 condition/conditional 分支求值与结果持久化实现。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../../database/schema';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { evaluateConditionBranch, resolveConditionBranches } from '../condition-evaluator.util';
import { flattenInput, getRuntimeNodeData } from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class ConditionalNodeExecutor implements NodeExecutor {
  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeConditional(context.step, context.input, context.tenantId, context.executionId, context.runtime);
  }

  async executeConditional(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const flatInput = flattenInput(input);

      // 检测新格式（branches 数组）vs 旧格式（mode + expression/conditionField）
      const branches = resolveConditionBranches(nodeData);

      // 顺序评估每个分支，找到第一个匹配的
      let matchedBranchId: string | null = null;

      for (const branch of branches) {
        const matches = evaluateConditionBranch(branch, input, flatInput);
        if (matches) {
          matchedBranchId = branch.id;
          break;
        }
      }

      // 构建 result：匹配分支获得 payload，其他为 null
      const winnerBranchId = matchedBranchId ?? 'else';
      const result: Record<string, unknown> = {
        branch: winnerBranchId,
      };

      for (const branch of branches) {
        result[branch.id] = branch.id === matchedBranchId ? input : null;
      }
      result['else'] = matchedBranchId === null ? input : null;

      // 向后兼容旧 matched/unmatched 键名
      if (branches.length === 1) {
        const isMatched = matchedBranchId === branches[0].id;
        result['matched-out'] = isMatched ? input : null;
        result['unmatched-out'] = isMatched ? null : input;
        result['matched'] = result['matched-out'];
        result['unmatched'] = result['unmatched-out'];
        result['true'] = result['matched-out'];
        result['false'] = result['unmatched-out'];
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result },
      );

      await runtime.onNodeCompleted(executionId, step.id, tenantId);
    } catch (error) {
      await this.failurePolicy.handle(error, {
        tenantId,
        executionId,
        step,
        onNodeFailed: runtime.onNodeFailed.bind(runtime),
      });
    }
  }
}
