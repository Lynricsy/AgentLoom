import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  ExecutionEventName,
  type ExecutionStatusChangedPayload,
  type InterventionResolvedPayload,
} from '../execution/types/execution-event.types';
import { AuditLogService } from './audit-log.service';

type ExecutionStatusAuditPayload = ExecutionStatusChangedPayload & {
  tenantId: string;
};

type InterventionResolvedAuditPayload = InterventionResolvedPayload & {
  tenantId: string;
  executionId: string;
};

const CRITICAL_EXECUTION_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditLogListener {
  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent(ExecutionEventName.EXECUTION_STATUS_CHANGED)
  async handleExecutionStatusChanged(
    payload: ExecutionStatusAuditPayload,
  ): Promise<void> {
    if (!CRITICAL_EXECUTION_STATUSES.has(payload.status)) {
      return;
    }

    await this.auditLogService.record({
      tenantId: payload.tenantId,
      actorId: null,
      actorType: 'system',
      eventType: ExecutionEventName.EXECUTION_STATUS_CHANGED,
      resourceType: 'execution',
      resourceId: payload.executionId,
      executionId: payload.executionId,
      summary: `Execution status changed to ${payload.status}`,
      after: {
        status: payload.status,
        completedSteps: payload.completedSteps ?? null,
        totalSteps: payload.totalSteps ?? null,
        errorMessage: payload.errorMessage ?? null,
      },
    });
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_RESOLVED)
  async handleInterventionResolved(
    payload: InterventionResolvedAuditPayload,
  ): Promise<void> {
    const isUserActor = UUID_PATTERN.test(payload.resolvedBy);

    await this.auditLogService.record({
      tenantId: payload.tenantId,
      actorId: isUserActor ? payload.resolvedBy : null,
      actorType: isUserActor ? 'user' : 'system',
      eventType: 'execution.intervention.resolved',
      resourceType: 'execution_step',
      resourceId: payload.stepId,
      executionId: payload.executionId,
      summary: `Intervention resolved with action ${payload.action}`,
      after: {
        nodeId: payload.nodeId,
        action: payload.action,
        feedback: payload.feedback ?? null,
        modifiedContent: payload.modifiedContent ?? null,
        resolvedAt: payload.resolvedAt,
        timeout: payload.timeout ?? false,
      },
    });
  }
}
