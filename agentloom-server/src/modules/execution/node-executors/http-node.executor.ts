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
      // 默认 true：验收口径要求 HTTP 非 2xx 让节点失败（fail-closed），
      // 只有显式配置 false 才保留「探测型」用法（非 2xx 也算成功继续往下走）。
      const failOnHttpError = nodeData.failOnHttpError !== false;
      // 只用它分流**节点状态**，不参与 result 内容构造。
      const shouldFailStep = failOnHttpError && !response.ok;
      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        response,
        'response-out': response.body,
        'exec-out': {
          triggered: true,
          // 如实记录 HTTP 结果：探测型用法只是允许节点 completed，
          // 不代表这次请求成功；否则同一个 result 里 ok=false 却 success=true，
          // 下游按 success 分支会被误导。
          success: response.ok,
          status: response.status,
        },
      };

      if (shouldFailStep) {
        // 完整响应 payload 仍写入 result 供排障与下游读取，错误信封只带定位信息。
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          step.id,
          'failed',
          {
            result,
            errorMessage: {
              message: `HTTP ${method} ${url} 返回 ${response.status} ${response.statusText}`,
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
