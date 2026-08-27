/**
 * 代码工具节点执行器：拥有代码校验、运行与结果持久化实现。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../../database/schema';
import { CodeExecutionService } from '../../agent/code-execution.service';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { extractCodeToolInputPayload, getRuntimeNodeData, readFirstString, readOptionalNumber } from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class CodeNodeExecutor implements NodeExecutor {
  constructor(
    private readonly codeExecutionService: CodeExecutionService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeCodeToolNode(context.step, context.input, context.tenantId, context.executionId, context.runtime);
  }

  async executeCodeToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const language = readFirstString(nodeData.language);
      const rawCode = typeof nodeData.code === 'string' ? nodeData.code : '';
      const timeout = readOptionalNumber(
        nodeData.timeout,
        nodeData.timeoutSeconds,
        nodeData.timeout_seconds,
      );

      if (
        language !== 'typescript' &&
        language !== 'javascript' &&
        language !== 'python' &&
        language !== 'bash'
      ) {
        throw new Error('Code Tool 节点缺少受支持的 language 配置');
      }

      if (!rawCode.trim()) {
        throw new Error('Code Tool 节点缺少 code 配置');
      }

      const executionResult = await this.codeExecutionService.execute({
        language,
        code: rawCode,
        input: extractCodeToolInputPayload(input),
        ...(timeout !== undefined ? { timeout } : {}),
      });

      const result = {
        success: executionResult.success,
        result: executionResult.output,
        output: executionResult.output,
        stdout: executionResult.stdout,
        stderr: executionResult.stderr,
        executionTimeMs: executionResult.executionTimeMs,
        'exec-out': {
          triggered: true,
          success: executionResult.success,
        },
        ...(executionResult.error ? { error: executionResult.error } : {}),
      };

      if (!executionResult.success) {
        // CodeExecutionService 对 ENOENT / 超时 / 非零退出码统一返回 success:false，
        // 这里必须 fail-closed：否则解释器缺失或脚本抛错的节点会被记成 completed，
        // 下游节点继续读到空 output，整条 workflow 假绿。
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'failed',
          {
            result,
            errorMessage: {
              message: executionResult.error ?? '代码执行失败',
              nodeId: step.nodeId,
            },
          },
        );
        await runtime.onNodeFailed(executionId, step.id, tenantId);
        return;
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
