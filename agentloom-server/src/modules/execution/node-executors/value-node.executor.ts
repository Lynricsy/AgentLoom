/**
 * 值处理节点执行器：拥有 merge、text 与输出节点的完整执行实现。
 */
import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '../../../database/schema';
import type { NodeSchedulerService } from '../node-scheduler.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { StepStateMachineService } from '../step-state-machine.service';
import {
  extractOutputValue,
  getRuntimeNodeData,
  isRecord,
  normalizeJsonOutputValue,
  readFirstString,
  readOptionalNumber,
  resolveTextNodeContent,
  stringifyOutputValue,
} from '../node-value.util';
import type { NodeExecutionContext, NodeExecutor } from './node-executor.interface';

@Injectable()
export class ValueNodeExecutor implements NodeExecutor {
  private readonly handlers = {
    merge: (c: NodeExecutionContext) => this.executeMerge(c.step, c.input, c.tenantId, c.executionId, c.runtime),
    text: (c: NodeExecutionContext) => this.executeTextNode(c.step, c.tenantId, c.executionId, c.runtime),
    'text-output': (c: NodeExecutionContext) => this.executeOutputNode(c.step, c.input, c.tenantId, c.executionId, c.runtime),
    'json-output': (c: NodeExecutionContext) => this.executeOutputNode(c.step, c.input, c.tenantId, c.executionId, c.runtime),
  } satisfies Record<string, (context: NodeExecutionContext) => Promise<void>>;

  constructor(
    private readonly stepStateMachine: StepStateMachineService,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {}

  async execute(context: NodeExecutionContext): Promise<void> {
    await this.handlers[context.step.nodeType as keyof typeof this.handlers](context);
  }

  async executeMerge(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = getRuntimeNodeData(step.nodeData ?? {});
      const mode =
        readFirstString(nodeData.mode) === 'merge-by-key'
          ? 'merge-by-key'
          : 'append';
      const mergeKey = readFirstString(nodeData.mergeKey, nodeData.merge_key);
      const rawInputCount = readOptionalNumber(
        nodeData.inputCount,
        nodeData.input_count,
      );
      const inputCount =
        rawInputCount && rawInputCount >= 2 ? Math.floor(rawInputCount) : 2;

      // 按端口 ID 顺序收集输入（input-0, input-1, ...）
      const collectedInputs: unknown[] = [];
      for (let i = 0; i < inputCount; i += 1) {
        const portId = `input-${i}`;
        const value = input[portId];
        if (value !== undefined && value !== null) {
          collectedInputs.push(value);
        }
      }

      // 如果按端口 ID 没有收到数据，尝试从整体 input 收集
      if (collectedInputs.length === 0) {
        for (const value of Object.values(input)) {
          if (value !== undefined && value !== null) {
            collectedInputs.push(value);
          }
        }
      }

      let merged: unknown;

      if (mode === 'merge-by-key' && mergeKey) {
        // 按键合并: 将具有相同 key 值的对象合并
        const mergeMap = new Map<string, Record<string, unknown>>();
        const orderKeys: string[] = [];

        for (const item of collectedInputs) {
          if (Array.isArray(item)) {
            for (const element of item) {
              this.mergeByKey(element, mergeKey, mergeMap, orderKeys);
            }
          } else {
            this.mergeByKey(item, mergeKey, mergeMap, orderKeys);
          }
        }

        merged = orderKeys
          .map((k) => mergeMap.get(k))
          .filter((v): v is Record<string, unknown> => v !== undefined);
      } else {
        // 追加拼接: 将所有输入展平为一个数组
        const items: unknown[] = [];
        for (const item of collectedInputs) {
          if (Array.isArray(item)) {
            items.push(...item);
          } else {
            items.push(item);
          }
        }
        merged = items;
      }

      const result = {
        merged,
        'merged-out': merged,
        mode,
        inputCount,
        collectedCount: collectedInputs.length,
        'exec-out': {
          triggered: true,
          collectedCount: collectedInputs.length,
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

  private mergeByKey(
    item: unknown,
    mergeKey: string,
    mergeMap: Map<string, Record<string, unknown>>,
    orderKeys: string[],
  ): void {
    if (!isRecord(item)) return;

    const keyValue = item[mergeKey];
    if (keyValue === undefined || keyValue === null) return;

    const keyStr = String(keyValue);
    const existing = mergeMap.get(keyStr);
    if (existing) {
      Object.assign(existing, item);
    } else {
      mergeMap.set(keyStr, { ...item });
      orderKeys.push(keyStr);
    }
  }

  async executeTextNode(
    step: ExecutionStep,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const nodeData = isRecord(step.nodeData) ? step.nodeData : {};
      const content = resolveTextNodeContent(nodeData);
      const result = {
        content,
        text: content,
        'text-out': content,
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

  async executeOutputNode(
    step: ExecutionStep,
    input: Record<string, unknown>,
    tenantId: string,
    executionId: string,
    runtime: NodeSchedulerService,
  ): Promise<void> {
    await this.stepStateMachine.updateStepStatus(tenantId, step.id, 'running');

    try {
      const rawOutput = extractOutputValue(input);
      const content =
        step.nodeType === 'text-output'
          ? stringifyOutputValue(rawOutput)
          : normalizeJsonOutputValue(rawOutput);
      const result =
        step.nodeType === 'text-output' ? { content } : { json: content };

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
