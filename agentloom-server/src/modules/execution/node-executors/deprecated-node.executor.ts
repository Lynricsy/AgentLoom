/**
 * 已废弃节点执行器：为不可迁移的发布快照提供明确失败诊断。
 */
import { Injectable } from '@nestjs/common';
import type {
  NodeExecutionContext,
  NodeExecutor,
} from './node-executor.interface';

@Injectable()
export class DeprecatedNodeExecutor implements NodeExecutor {
  async execute(context: NodeExecutionContext): Promise<void> {
    await context.runtime.failUnschedulableNode(
      context.tenantId,
      context.executionId,
      context.step,
      'llm-agent 是已废弃的内联 Agent 节点类型；请在画布中改用 agent 节点并绑定已发布的 Agent Definition，然后重新发布工作流',
    );
  }
}
