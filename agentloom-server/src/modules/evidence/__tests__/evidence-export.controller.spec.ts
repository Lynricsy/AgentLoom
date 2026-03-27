import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CreateEvidenceExportJobSchema,
  type CreateEvidenceExportJobDto,
} from '../dto/evidence-export.dto';
import { EvidenceExportController } from '../evidence-export.controller';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-000000000002';
const EXPORT_ID = '00000000-0000-4000-8000-000000000003';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000004';
const WORKFLOW_ID = '00000000-0000-4000-8000-000000000005';

function createMockEvidenceExportService() {
  return {
    requestExport: vi.fn(),
    findById: vi.fn(),
    getDownloadDetail: vi.fn(),
    refreshDownloadDetail: vi.fn(),
  };
}

describe('EvidenceExportController', () => {
  let controller: EvidenceExportController;
  let service: ReturnType<typeof createMockEvidenceExportService>;

  beforeEach(() => {
    service = createMockEvidenceExportService();
    controller = new EvidenceExportController(service as never);
  });

  it('should normalize snake_case aliases and singular execution id into canonical export filters', () => {
    expect(
      CreateEvidenceExportJobSchema.parse({
        workflow_id: WORKFLOW_ID,
        execution_id: EXECUTION_ID,
        resource_type: 'workflow_definition',
        resource_id: 'wf-1',
        event_type: 'execution.completed',
        actor_type: 'user',
        actor_id: ACTOR_ID,
        include_audit_metadata: true,
        from: '2026-03-17T09:00:00.000Z',
        to: '2026-03-17T10:00:00.000Z',
      }),
    ).toEqual({
      filters: {
        workflowId: WORKFLOW_ID,
        executionIds: [EXECUTION_ID],
        resourceType: 'workflow_definition',
        resourceId: 'wf-1',
        eventType: 'execution.completed',
        actorType: 'user',
        actorId: ACTOR_ID,
        includeAuditMetadata: true,
        from: '2026-03-17T09:00:00.000Z',
        to: '2026-03-17T10:00:00.000Z',
      },
    });
  });

  it('should return create responses as { data } and forward tenant/actor scoped filters', async () => {
    const dto = CreateEvidenceExportJobSchema.parse({
      workflowId: WORKFLOW_ID,
      executionIds: [EXECUTION_ID],
      includeAuditMetadata: true,
    });

    service.requestExport.mockResolvedValue({
      id: EXPORT_ID,
      status: 'queued',
      filters: dto.filters,
      matchedExecutionCount: 1,
    });

    await expect(controller.create(TENANT_ID, ACTOR_ID, dto)).resolves.toEqual({
      data: {
        id: EXPORT_ID,
        status: 'queued',
        filters: dto.filters,
        matchedExecutionCount: 1,
      },
    });

    expect(service.requestExport).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      filters: dto.filters,
    });
  });

  it('should return export detail responses as { data }', async () => {
    service.findById.mockResolvedValue({
      id: EXPORT_ID,
      status: 'completed',
      matchedExecutionCount: 2,
    });

    await expect(controller.findById(TENANT_ID, EXPORT_ID)).resolves.toEqual({
      data: {
        id: EXPORT_ID,
        status: 'completed',
        matchedExecutionCount: 2,
      },
    });

    expect(service.findById).toHaveBeenCalledWith(TENANT_ID, EXPORT_ID);
  });

  it('should return download detail responses as { data } and include actor context for auditing', async () => {
    service.getDownloadDetail.mockResolvedValue({
      url: 'https://download.example/export-1',
      fileName: 'evidence-export-1.zip',
      mimeType: 'application/zip',
      expiresAt: '2026-03-17T12:30:00.000Z',
      expiresIn: 600,
    });

    await expect(
      controller.getDownloadDetail(TENANT_ID, ACTOR_ID, EXPORT_ID),
    ).resolves.toEqual({
      data: {
        url: 'https://download.example/export-1',
        fileName: 'evidence-export-1.zip',
        mimeType: 'application/zip',
        expiresAt: '2026-03-17T12:30:00.000Z',
        expiresIn: 600,
      },
    });

    expect(service.getDownloadDetail).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      exportId: EXPORT_ID,
    });
  });

  it('should return refreshed download detail responses as { data }', async () => {
    service.refreshDownloadDetail.mockResolvedValue({
      url: 'https://download.example/export-1?refreshed=true',
      fileName: 'evidence-export-1.zip',
      mimeType: 'application/zip',
      expiresAt: '2026-03-17T12:40:00.000Z',
      expiresIn: 600,
    });

    await expect(
      controller.refreshDownloadDetail(TENANT_ID, ACTOR_ID, EXPORT_ID),
    ).resolves.toEqual({
      data: {
        url: 'https://download.example/export-1?refreshed=true',
        fileName: 'evidence-export-1.zip',
        mimeType: 'application/zip',
        expiresAt: '2026-03-17T12:40:00.000Z',
        expiresIn: 600,
      },
    });

    expect(service.refreshDownloadDetail).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      exportId: EXPORT_ID,
    });
  });
});
