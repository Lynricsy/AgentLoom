import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AgentApiStreamEvent } from '@agentloom/contracts';

import {
  ExecutionEventName,
  type ExecutionStatusChangedPayload,
  type OutputChunkPayload,
  type ToolCallStatusPayload,
} from '../execution/types/execution-event.types';
import { AgentApiEventStreamService } from './agent-api-event-stream.service';
import { AgentApiRunService } from './agent-api-run.service';

type ExecutionScoped<T> = T & { tenantId: string; executionId: string };

/** 只有这些非终态状态会映射为 `run.status`；终态事件只由 run 服务在提交后写入 */
const MIRRORED_EXECUTION_STATUSES = new Set(['queued', 'preparing', 'running']);

/**
 * 在执行进程内把对话执行事件映射为对外 run 事件并写入 run 事件流。
 *
 * 只处理进程内登记过 run 的对话（对话执行时 `executionId === conversationId`）；
 * 任何异常都在这里吞掉，不能影响 worker。
 */
@Injectable()
export class AgentApiEventMirrorListener {
  private readonly logger = new Logger(AgentApiEventMirrorListener.name);
  /** 未登记对话的活跃 run 查找；同一对话的后续状态事件排在同一查找之后，保持顺序 */
  private readonly pendingLookups = new Map<string, Promise<string | null>>();

  constructor(
    private readonly runService: AgentApiRunService,
    private readonly eventStream: AgentApiEventStreamService,
  ) {}

  @OnEvent(ExecutionEventName.OUTPUT_CHUNK)
  handleOutputChunk(payload: ExecutionScoped<OutputChunkPayload>): void {
    if (payload.executionType !== 'conversation') {
      return;
    }

    const runId = this.runService.getLocalRunId(payload.executionId);
    if (!runId) {
      return;
    }

    this.append(runId, {
      event: 'message.delta',
      data: { runId, index: payload.index, delta: payload.chunk },
    });
  }

  @OnEvent(ExecutionEventName.NODE_TOOL_CALL_STATUS)
  handleToolCallStatus(payload: ExecutionScoped<ToolCallStatusPayload>): void {
    if (payload.executionType !== 'conversation') {
      return;
    }

    const runId = this.runService.getLocalRunId(payload.executionId);
    if (!runId) {
      return;
    }

    // 不带 args / result：内部工具参数与结果不对第三方暴露
    this.append(runId, {
      event: 'tool_call',
      data: {
        runId,
        toolCallId: payload.toolCallId,
        tool: payload.tool,
        status: payload.status,
        ...(payload.error ? { error: payload.error } : {}),
      },
    });
  }

  @OnEvent('execution.status.changed')
  handleStatusChanged(
    payload: ExecutionStatusChangedPayload & { tenantId: string },
  ): void {
    const { phase } = payload;
    if (
      payload.executionType !== 'conversation' ||
      !phase ||
      !MIRRORED_EXECUTION_STATUSES.has(payload.status)
    ) {
      return;
    }

    const conversationId = payload.executionId;
    const status = payload.status === 'running' ? 'running' : 'queued';
    const appendStatus = (runId: string | null | undefined) => {
      if (runId) {
        this.append(runId, {
          event: 'run.status',
          data: { runId, status, phase },
        });
      }
    };

    const localRunId = this.runService.getLocalRunId(conversationId);
    if (localRunId) {
      appendStatus(localRunId);
      return;
    }

    // 准备阶段先于 markRunning 触发，此时进程内尚无登记，按对话查找活跃 run
    void this.lookupActiveRun(payload.tenantId, conversationId)
      .then(appendStatus)
      .catch((error: unknown) => {
        this.logger.warn(
          `查找对话 ${conversationId} 的活跃 run 失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private lookupActiveRun(
    tenantId: string,
    conversationId: string,
  ): Promise<string | null> {
    const pending = this.pendingLookups.get(conversationId);
    if (pending) {
      return pending;
    }

    const lookup = this.runService
      .findActiveRunId(tenantId, conversationId)
      .then((runId) => {
        // markRunning 可能已在查找期间登记，以它为准
        const registered = this.runService.getLocalRunId(conversationId);
        if (registered) {
          return registered;
        }
        if (runId) {
          this.runService.registerLocalRun(conversationId, runId);
        }
        return runId;
      })
      .finally(() => {
        this.pendingLookups.delete(conversationId);
      });

    this.pendingLookups.set(conversationId, lookup);
    return lookup;
  }

  private append(runId: string, event: AgentApiStreamEvent): void {
    // append 是 async 方法，同步异常也会变成 rejection
    void this.eventStream.append(runId, event).catch((error: unknown) => {
      this.logger.warn(
        `写入 run ${runId} 事件 ${event.event} 失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
