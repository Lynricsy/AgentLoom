/**
 * 数据处理节点执行器：拥有数据转换与输入预处理节点的完整执行实现。
 */
import { Injectable } from '@nestjs/common';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import {
  InputPreprocessorHandlerImpl,
  type InputPreprocessorConfig,
  normalizeInputPreprocessorConfig,
} from '../node-handlers/input-preprocessor.handler';
import { evaluateExpression } from '../condition-evaluator.util';
import {
  getRuntimeNodeData,
  normalizeTransformResult,
  resolveJsonPath,
} from '../node-value.util';
import type { ExecutionStep } from '../../../database/schema';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class DataTransformNodeExecutor implements NodeExecutor {
  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    if (context.step.nodeType === 'data_transform') {
      await this.executeDataTransform(context.step, context.input, context.tenantId, context.executionId, context.runtime);
      return;
    }
    await this.executeInputPreprocessor(context.step, context.input, context.tenantId, context.executionId, context.runtime);
  }

  async executeDataTransform(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = step.nodeData ?? {};
      const expression =
        typeof nodeData.expression === 'string'
          ? nodeData.expression.trim()
          : '';
      const mapping = nodeData.mapping as Record<string, string> | undefined;

      let result: Record<string, unknown>;

      if (expression) {
        result = normalizeTransformResult(
          evaluateExpression(expression, input),
        );
      } else if (mapping) {
        result = {};
        for (const [outputKey, inputPath] of Object.entries(mapping)) {
          result[outputKey] = resolveJsonPath(input, inputPath);
        }
      } else {
        // 无映射配置 → 透传
        result = { ...input };
      }

      await this.stepStateMachine.updateStepStatus(
        tenantId,
        step.id,
        'completed',
        { result: result },
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

  async executeInputPreprocessor(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const config: InputPreprocessorConfig =
        normalizeInputPreprocessorConfig(nodeData);

      const handler = new InputPreprocessorHandlerImpl();
      const { output, outputFormat } = await handler.execute(input, config);

      const result: Record<string, unknown> =
        typeof output === 'string'
          ? {
              text: output,
              'text-out': output,
              'exec-out': { triggered: true },
            }
          : {
              ...output,
              json: output,
              'json-out': output,
              'exec-out': { triggered: true },
            };

      if (outputFormat) {
        result._outputFormat = outputFormat;
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
