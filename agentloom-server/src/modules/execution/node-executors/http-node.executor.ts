/**
 * HTTP 工具节点执行器：拥有请求构造、执行与结果持久化实现。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../../database/schema';
import { executeHttpToolRequest } from '../../agent/http-tool-request.util';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import { buildHttpToolRequestInput } from '../http-tool-request.util';
import { getRuntimeNodeData, readFirstString, readHttpMethod, readOptionalNumber } from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class HttpNodeExecutor implements NodeExecutor {
  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.executeHttpToolNode(context.step, context.input, context.tenantId, context.executionId, context.runtime);
  }

  async executeHttpToolNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const url = readFirstString(nodeData.url);
      if (!url) {
        throw new Error('HTTP Tool 节点缺少 URL 配置');
      }

      const method = readHttpMethod(nodeData.method);
      const timeout = readOptionalNumber(
        nodeData.timeout,
        nodeData.timeoutSeconds,
        nodeData.timeout_seconds,
      );
      const request = buildHttpToolRequestInput(nodeData, input);
      const response = await executeHttpToolRequest(
        {
          url,
          method,
          ...(timeout !== undefined ? { timeout } : {}),
        },
        request,
      );
      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        response,
        'response-out': response.body,
        'exec-out': {
          triggered: true,
          success: response.ok,
          status: response.status,
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
