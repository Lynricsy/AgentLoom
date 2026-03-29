import 'reflect-metadata';

import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionEventName } from '../../execution/types/execution-event.types';
import { AuditLogListener } from '../audit-log.listener';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440001';
const STEP_ID = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID = '550e8400-e29b-41d4-a716-446655440003';

function getHandler(name: keyof AuditLogListener): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    AuditLogListener.prototype,
    name,
  );

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Handler ${String(name)} is not defined`);
  }

  return descriptor.value as object;
}

describe('AuditLogListener', () => {
  const auditLogService = {
    record: vi.fn(),
  };

  let listener: AuditLogListener;

  beforeEach(() => {
    auditLogService.record.mockReset();
    auditLogService.record.mockResolvedValue(undefined);
    listener = new AuditLogListener(auditLogService as never);
  });

  it('should register execution and intervention event listeners', () => {
    expect(
      Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        getHandler('handleExecutionStatusChanged'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: ExecutionEventName.EXECUTION_STATUS_CHANGED,
        }),
      ]),
    );
    expect(
      Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        getHandler('handleInterventionResolved'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: ExecutionEventName.NODE_INTERVENTION_RESOLVED,
        }),
      ]),
    );
  });

  it('should record critical execution status changes exactly once', async () => {
    await listener.handleExecutionStatusChanged({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      status: 'completed',
      completedSteps: 4,
      totalSteps: 4,
    });

    expect(auditLogService.record).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: null,
        actorType: 'system',
        eventType: 'execution.status.changed',
        resourceType: 'execution',
        resourceId: EXECUTION_ID,
        executionId: EXECUTION_ID,
        summary: 'Execution status changed to completed',
      }),
    );
  });

  it('should ignore non-critical execution statuses', async () => {
    await listener.handleExecutionStatusChanged({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      status: 'running',
      completedSteps: 1,
      totalSteps: 4,
    });

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('should ignore conversation execution events', async () => {
    await listener.handleExecutionStatusChanged({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      status: 'completed',
      executionType: 'conversation',
      completedSteps: 1,
      totalSteps: 1,
    });

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('should record intervention resolutions exactly once with the resolved actor', async () => {
    await listener.handleInterventionResolved({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      nodeId: 'node-review',
      action: 'approve',
      feedback: '继续执行',
      resolvedBy: USER_ID,
      resolvedAt: '2026-03-17T10:00:00.000Z',
    });

    expect(auditLogService.record).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        actorType: 'user',
        eventType: 'execution.intervention.resolved',
        resourceType: 'execution_step',
        resourceId: STEP_ID,
        executionId: EXECUTION_ID,
      }),
    );
  });
});
