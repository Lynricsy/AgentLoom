/**
 * 触发器节点执行器：拥有执行输入读取与触发器结果持久化实现。
 */
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import * as schema from '../../../database/schema';
import type { ExecutionStep } from '../../../database/schema';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { extractExecutionInputPayload } from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class TriggerNodeExecutor implements NodeExecutor {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  private get tenantDb(): DrizzleDB { return getTenantDb(this.db); }

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeTriggerNode(context.step, context.tenantId, context.executionId, context.runtime);
  }

  async executeTriggerNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const [execution] = await this.tenantDb
        .select({
          inputParams: schema.workflowExecutions.inputParams,
          triggerType: schema.workflowExecutions.triggerType,
        })
        .from(schema.workflowExecutions)
        .where(eq(schema.workflowExecutions.id, executionId))
        .limit(1);

      const payload = extractExecutionInputPayload(execution?.inputParams);
      const result = {
        triggerType: execution?.triggerType ?? step.nodeType,
        payload,
        'exec-out': {
          triggerType: execution?.triggerType ?? step.nodeType,
          triggered: true,
        },
      };

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
