/**
 * Compound 节点执行器：把循环与内部控制节点交给独立 compound 生命周期服务。
 */
import { Injectable } from '@nestjs/common';
import { CompoundExecutionService } from '../compound-execution.service';
import type {
  NodeExecutionContext,
  NodeExecutor,
} from './node-executor.interface';

@Injectable()
export class CompoundNodeExecutor implements NodeExecutor {
  constructor(private readonly compoundExecution: CompoundExecutionService) {}

  private readonly handlers = {
    loop: (c: NodeExecutionContext) =>
      this.compoundExecution.executeLoopNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    iteration: (c: NodeExecutionContext) =>
      this.compoundExecution.executeIterationNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    'loop-start': (c: NodeExecutionContext) =>
      this.compoundExecution.executeLoopStartNode(
        c.step,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    'iteration-start': (c: NodeExecutionContext) =>
      this.compoundExecution.executeIterationStartNode(
        c.step,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    'loop-state': (c: NodeExecutionContext) =>
      this.compoundExecution.executeLoopStateNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    result: (c: NodeExecutionContext) =>
      this.compoundExecution.executeResultNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    break: (c: NodeExecutionContext) =>
      this.compoundExecution.executeBreakNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
    continue: (c: NodeExecutionContext) =>
      this.compoundExecution.executeContinueNode(
        c.step,
        c.input,
        c.tenantId,
        c.executionId,
        c.runtime,
      ),
  } satisfies Record<string, (context: NodeExecutionContext) => Promise<void>>;

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.handlers[context.step.nodeType as keyof typeof this.handlers](
      context,
    );
  }
}
