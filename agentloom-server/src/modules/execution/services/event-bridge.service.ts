import {
  Optional,
  Injectable,
  Logger,
  Inject,
  forwardRef,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionGateway } from '../execution.gateway';
import { ThrottleService } from './throttle.service';
import {
  ExecutionEventName,
  type ExecutionEvent,
  type ExecutionEventPayloadMap,
  type ExecutionStatusChangedPayload,
  type StepStatusChangedPayload,
  type StepAgentEventPayload,
  type StepRetryingPayload,
  type OutputChunkPayload,
  type InterventionRequiredPayload,
  type InterventionResolvedPayload,
  type ToolCallStatusPayload,
  type ToolPermissionRequiredPayload,
  type ToolPermissionResolvedPayload,
  type LegacyEventName,
  LEGACY_EVENT_MAP,
} from '../types/execution-event.types';

const EVENT_BUFFER_CAPACITY = 500;
const TERMINAL_EVENT_RETENTION_MS = 30_000;
const TERMINAL_EXECUTION_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/**
 * 事件桥接服务。
 * 将内部遗留事件格式转换为标准化 ExecutionEvent 信封，
 * 并维护每个执行实例的单调递增 eventId 计数器（用于断线重连回放追踪）。
 * 同时保存最近 N 个事件用于断线重连时的增量回放。
 */
@Injectable()
export class EventBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(EventBridgeService.name);

  /** 每个执行实例独立的事件计数器 */
  private readonly eventCounters = new Map<string, number>();

  /** 每个执行实例的事件环形缓冲区（用于断线重连增量回放） */
  private readonly eventBuffers = new Map<string, ExecutionEvent[]>();

  private readonly cleanupTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    @Inject(forwardRef(() => ExecutionGateway))
    private readonly executionGateway: ExecutionGateway,
    private readonly throttleService: ThrottleService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  emitStepStatusChanged(
    tenantId: string,
    executionId: string,
    payload: StepStatusChangedPayload,
  ): ExecutionEvent<typeof ExecutionEventName.STEP_STATUS_CHANGED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.STEP_STATUS_CHANGED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);

    // 将失败事件传播到 NestJS EventEmitter 供证据模块等监听
    if (payload.to === 'failed') {
      this.eventEmitter?.emit(ExecutionEventName.STEP_STATUS_CHANGED, {
        tenantId,
        executionId,
        ...payload,
      });
    }

    return envelope;
  }

  emitExecutionStatusChanged(
    tenantId: string,
    executionId: string,
    payload: ExecutionStatusChangedPayload,
  ): ExecutionEvent<typeof ExecutionEventName.EXECUTION_STATUS_CHANGED> {
    const isTerminal = TERMINAL_EXECUTION_STATUSES.has(payload.status);
    if (isTerminal) {
      this.flushTerminalExecutionState(tenantId, executionId);
    }

    const envelope = this.createEnvelope(
      ExecutionEventName.EXECUTION_STATUS_CHANGED,
      tenantId,
      executionId,
      payload,
    );

    if (isTerminal) {
      this.broadcastImmediately(tenantId, executionId, envelope);
      this.throttleService.clearExecution(executionId, tenantId);
      this.executionGateway.clearExecutionQueue(tenantId, executionId);
      this.scheduleTerminalCleanup(executionId);
    } else {
      this.broadcast(tenantId, executionId, envelope);
    }

    this.eventEmitter?.emit('execution.status.changed', {
      tenantId,
      ...payload,
    });

    return envelope;
  }

  emitStepAgentEvent(
    tenantId: string,
    executionId: string,
    payload: StepAgentEventPayload,
  ): ExecutionEvent<typeof ExecutionEventName.STEP_AGENT_EVENT> {
    const envelope = this.createEnvelope(
      ExecutionEventName.STEP_AGENT_EVENT,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    this.eventEmitter?.emit(ExecutionEventName.STEP_AGENT_EVENT, {
      tenantId,
      executionId,
      ...payload,
    });
    return envelope;
  }

  emitStepRetrying(
    tenantId: string,
    executionId: string,
    payload: StepRetryingPayload,
  ): ExecutionEvent<typeof ExecutionEventName.STEP_RETRYING> {
    const envelope = this.createEnvelope(
      ExecutionEventName.STEP_RETRYING,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    return envelope;
  }

  emitOutputChunk(
    tenantId: string,
    executionId: string,
    payload: OutputChunkPayload,
  ): ExecutionEvent<typeof ExecutionEventName.OUTPUT_CHUNK> {
    const envelope = this.createEnvelope(
      ExecutionEventName.OUTPUT_CHUNK,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    return envelope;
  }

  emitInterventionRequired(
    tenantId: string,
    executionId: string,
    payload: InterventionRequiredPayload,
  ): ExecutionEvent<typeof ExecutionEventName.NODE_INTERVENTION_REQUIRED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.NODE_INTERVENTION_REQUIRED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    this.eventEmitter?.emit(ExecutionEventName.NODE_INTERVENTION_REQUIRED, {
      tenantId,
      executionId,
      ...payload,
    });
    return envelope;
  }

  emitInterventionResolved(
    tenantId: string,
    executionId: string,
    payload: InterventionResolvedPayload,
  ): ExecutionEvent<typeof ExecutionEventName.NODE_INTERVENTION_RESOLVED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.NODE_INTERVENTION_RESOLVED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    this.eventEmitter?.emit(ExecutionEventName.NODE_INTERVENTION_RESOLVED, {
      tenantId,
      executionId,
      ...payload,
    });
    return envelope;
  }

  emitToolCallStatus(
    tenantId: string,
    executionId: string,
    payload: ToolCallStatusPayload,
  ): ExecutionEvent<typeof ExecutionEventName.NODE_TOOL_CALL_STATUS> {
    const envelope = this.createEnvelope(
      ExecutionEventName.NODE_TOOL_CALL_STATUS,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    this.eventEmitter?.emit(ExecutionEventName.NODE_TOOL_CALL_STATUS, {
      tenantId,
      executionId,
      ...payload,
    });
    return envelope;
  }

  emitToolPermissionRequired(
    tenantId: string,
    executionId: string,
    payload: ToolPermissionRequiredPayload,
  ): ExecutionEvent<typeof ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.NODE_TOOL_PERMISSION_REQUIRED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    return envelope;
  }

  emitToolPermissionResolved(
    tenantId: string,
    executionId: string,
    payload: ToolPermissionResolvedPayload,
  ): ExecutionEvent<typeof ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.NODE_TOOL_PERMISSION_RESOLVED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
    return envelope;
  }

  /**
   * 将遗留格式的内部事件转换为标准化格式并广播。
   * 适用于过渡期间保持向后兼容。
   */
  bridgeLegacyEvent(
    tenantId: string,
    executionId: string,
    legacyEvent: LegacyEventName,
    data: Record<string, unknown>,
  ): ExecutionEvent | null {
    const standardEvent = LEGACY_EVENT_MAP[legacyEvent];
    if (!standardEvent) {
      this.logger.warn(`未知的遗留事件类型: ${legacyEvent}`);
      return null;
    }

    const envelope = this.createEnvelope(
      standardEvent,
      tenantId,
      executionId,
      data as unknown as ExecutionEventPayloadMap[typeof standardEvent],
    );
    this.broadcast(tenantId, executionId, envelope);
    return envelope;
  }

  /** 获取当前执行实例的最后一个 eventId（用于回放起点追踪） */
  getLastEventId(executionId: string): number {
    return this.eventCounters.get(executionId) ?? 0;
  }

  /** 设置执行实例的 eventId 起点（从持久化状态恢复时使用） */
  setEventCounter(executionId: string, value: number): void {
    this.eventCounters.set(executionId, value);
  }

  /** 执行到达终态后清理计数器和事件缓冲区，释放内存 */
  clearExecution(executionId: string): void {
    this.cancelCleanup(executionId);
    this.eventCounters.delete(executionId);
    this.eventBuffers.delete(executionId);
  }

  onModuleDestroy(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.eventCounters.clear();
    this.eventBuffers.clear();
  }

  /**
   * 获取指定 eventId 之后的所有缓冲事件。
   * 用于断线重连时的增量回放，避免发送完整快照。
   * 返回 null 表示缓冲区不包含所有遗漏事件（需回退到全量快照）。
   */
  getEventsSince(
    executionId: string,
    lastEventId: number,
  ): ExecutionEvent[] | null {
    const buffer = this.eventBuffers.get(executionId);
    if (!buffer || buffer.length === 0) return null;

    const oldestBuffered = buffer[0].eventId;
    if (lastEventId < oldestBuffered - 1) {
      return null;
    }

    return buffer.filter((e) => e.eventId > lastEventId);
  }

  private nextEventId(executionId: string): number {
    const current = this.eventCounters.get(executionId) ?? 0;
    const next = current + 1;
    this.eventCounters.set(executionId, next);
    return next;
  }

  private createEnvelope<T extends ExecutionEventName>(
    event: T,
    tenantId: string,
    executionId: string,
    data: ExecutionEventPayloadMap[T],
  ): ExecutionEvent<T> {
    return {
      eventId: this.nextEventId(executionId),
      event,
      timestamp: new Date().toISOString(),
      executionId,
      tenantId,
      data,
    };
  }

  private broadcast<T extends ExecutionEventName>(
    tenantId: string,
    executionId: string,
    envelope: ExecutionEvent<T>,
  ): void {
    this.bufferEvent(executionId, envelope);
    this.executionGateway.broadcastTypedEvent(
      tenantId,
      executionId,
      envelope.event,
      envelope as unknown as Record<string, unknown>,
    );
  }

  private broadcastImmediately<T extends ExecutionEventName>(
    tenantId: string,
    executionId: string,
    envelope: ExecutionEvent<T>,
  ): void {
    this.bufferEvent(executionId, envelope);
    this.executionGateway.broadcastTypedEventImmediately(
      tenantId,
      executionId,
      envelope.event,
      envelope as unknown as Record<string, unknown>,
    );
  }

  private bufferEvent(executionId: string, envelope: ExecutionEvent): void {
    let buffer = this.eventBuffers.get(executionId);
    if (!buffer) {
      buffer = [];
      this.eventBuffers.set(executionId, buffer);
    }
    buffer.push(envelope);
    if (buffer.length > EVENT_BUFFER_CAPACITY) {
      buffer.shift();
    }
  }

  private flushTerminalExecutionState(
    tenantId: string,
    executionId: string,
  ): void {
    this.executionGateway.flushExecutionQueue(tenantId, executionId);

    const mergedChunks = this.throttleService.forceFlush(
      this.buildScopedExecutionId(tenantId, executionId),
    );

    for (const chunk of mergedChunks) {
      const envelope = this.createEnvelope(
        ExecutionEventName.OUTPUT_CHUNK,
        tenantId,
        executionId,
        {
          stepId: chunk.stepId,
          chunk: chunk.chunk,
          index: chunk.startIndex,
        },
      );
      this.broadcastImmediately(tenantId, executionId, envelope);
    }
  }

  private scheduleTerminalCleanup(executionId: string): void {
    this.cancelCleanup(executionId);

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(executionId);
      this.clearExecution(executionId);
    }, TERMINAL_EVENT_RETENTION_MS);

    this.cleanupTimers.set(executionId, timer);
  }

  private cancelCleanup(executionId: string): void {
    const timer = this.cleanupTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(executionId);
    }
  }

  private buildScopedExecutionId(
    tenantId: string,
    executionId: string,
  ): string {
    return `${tenantId}:${executionId}`;
  }
}
