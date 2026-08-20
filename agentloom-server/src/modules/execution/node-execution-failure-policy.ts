/**
 * 节点执行失败策略：统一异常结构化、step 失败落库与 workflow failure 推进语义。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../database/schema';
import { DomainException } from '../../common/exceptions/domain.exception';
import { InvalidStepTransitionException } from './execution.exceptions';
import { StepStateMachineService } from './step-state-machine.service';

export interface NodeExecutionFailureContext {
  readonly tenantId: string;
  readonly executionId: string;
  readonly step: ExecutionStep;
  readonly onNodeFailed: (
    executionId: string,
    stepId: string,
    tenantId: string,
  ) => Promise<void>;
  readonly checkpointData?: Record<string, unknown>;
}

@Injectable()
export class NodeExecutionFailurePolicy {
  constructor(private readonly stepStateMachine: StepStateMachineService) {}

  /** 状态机非法转换必须向上抛出；其他执行错误落库后由调度器推进 workflow failure。 */
  async handle(error: unknown, context: NodeExecutionFailureContext): Promise<void> {
    if (error instanceof InvalidStepTransitionException) throw error;

    const message = error instanceof Error ? error.message : String(error);
    await this.stepStateMachine.updateStepStatus(
      context.tenantId,
      context.step.id,
      'failed',
      {
        errorMessage: {
          message,
          ...(error instanceof Error ? { stack: error.stack } : {}),
          ...(error instanceof DomainException
            ? {
                type: error.type,
                title: error.message,
                detail: error.detail,
              }
            : {}),
          nodeId: context.step.nodeId,
        },
        ...(context.checkpointData
          ? { checkpointData: context.checkpointData }
          : {}),
      },
    );
    await context.onNodeFailed(
      context.executionId,
      context.step.id,
      context.tenantId,
    );
  }
}
