import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ExecutionGateway } from '../execution.gateway';
import {
  ExecutionEventName,
  type ExecutionEvent,
  type ExecutionEventPayloadMap,
  type ExecutionStatusChangedPayload,
  type StepStatusChangedPayload,
  type StepAgentEventPayload,
  type StepRetryingPayload,
  type OutputChunkPayload,
  type LegacyEventName,
  LEGACY_EVENT_MAP,
} from '../types/execution-event.types';

/**
 * 事件桥接服务。
 * 将内部遗留事件格式转换为标准化 ExecutionEvent 信封，
 * 并维护每个执行实例的单调递增 eventId 计数器（用于断线重连回放追踪）。
 */
@Injectable()
export class EventBridgeService {
  private readonly logger = new Logger(EventBridgeService.name);

  /** 每个执行实例独立的事件计数器 */
  private readonly eventCounters = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => ExecutionGateway))
    private readonly executionGateway: ExecutionGateway,
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
    return envelope;
  }

  emitExecutionStatusChanged(
    tenantId: string,
    executionId: string,
    payload: ExecutionStatusChangedPayload,
  ): ExecutionEvent<typeof ExecutionEventName.EXECUTION_STATUS_CHANGED> {
    const envelope = this.createEnvelope(
      ExecutionEventName.EXECUTION_STATUS_CHANGED,
      tenantId,
      executionId,
      payload,
    );
    this.broadcast(tenantId, executionId, envelope);
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

  /** 执行到达终态后清理计数器，释放内存 */
  clearExecution(executionId: string): void {
    this.eventCounters.delete(executionId);
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
    this.executionGateway.broadcastTypedEvent(
      tenantId,
      executionId,
      envelope.event,
      envelope as unknown as Record<string, unknown>,
    );
  }
}
