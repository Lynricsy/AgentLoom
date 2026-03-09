import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Job } from 'bullmq';

import { DocumentIndexingWorker } from '../document-indexing.worker';
import type { DocumentIndexingJobData } from '../document-processing.worker';
import { DocumentService } from '../document.service';
import { KnowledgeGateway } from '../knowledge.gateway';
import { DocumentNotFoundException } from '../knowledge.exceptions';
import { RagService } from '../services/rag.service';

const DOC_ID = '00000000-0000-0000-0000-000000000001';

function createMockJob(
  overrides: Partial<Job<DocumentIndexingJobData>> = {},
): Job<DocumentIndexingJobData> {
  return {
    data: { documentId: DOC_ID },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<DocumentIndexingJobData>;
}

describe('DocumentIndexingWorker', () => {
  let worker: DocumentIndexingWorker;
  let documentService: { findById: Mock; updateStatus: Mock };
  let knowledgeGateway: {
    emitDocumentStatusChanged: Mock;
    emitKnowledgeBaseUpdated: Mock;
  };
  let ragService: { indexDocument: Mock; deleteByDocument: Mock };

  beforeEach(async () => {
    documentService = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    knowledgeGateway = {
      emitDocumentStatusChanged: vi.fn(),
      emitKnowledgeBaseUpdated: vi.fn(),
    };
    ragService = {
      indexDocument: vi.fn().mockResolvedValue(undefined),
      deleteByDocument: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIndexingWorker,
        { provide: DocumentService, useValue: documentService },
        { provide: KnowledgeGateway, useValue: knowledgeGateway },
        { provide: RagService, useValue: ragService },
      ],
    }).compile();

    worker = module.get(DocumentIndexingWorker);
  });

  describe('process', () => {
    beforeEach(() => {
      documentService.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: 'tenant-1',
        knowledgeBaseId: 'kb-1',
      });
      documentService.updateStatus.mockResolvedValue(undefined);
    });

    it('should finalize queued indexing jobs before emitting ready', async () => {
      await worker.process(createMockJob());

      expect(documentService.findById).toHaveBeenCalledWith(DOC_ID);
      expect(ragService.indexDocument).toHaveBeenCalledWith(DOC_ID, 'tenant-1');
      expect(documentService.updateStatus).toHaveBeenCalledWith(DOC_ID, 'ready');
      expect(knowledgeGateway.emitDocumentStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
        expect.objectContaining({
          documentId: DOC_ID,
          knowledgeBaseId: 'kb-1',
          status: 'ready',
          progress: expect.objectContaining({
            stage: 'completed',
            percentage: 100,
            currentStep: 5,
            totalSteps: 5,
          }),
        }),
      );
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
      );
    });

    it('should ignore stale jobs for documents deleted before indexing runs', async () => {
      documentService.findById.mockRejectedValue(new DocumentNotFoundException(DOC_ID));

      await expect(worker.process(createMockJob())).resolves.toBeUndefined();

      expect(ragService.indexDocument).not.toHaveBeenCalled();
      expect(documentService.updateStatus).not.toHaveBeenCalled();
      expect(knowledgeGateway.emitDocumentStatusChanged).not.toHaveBeenCalled();
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('should set document status to failed and emit failure events', async () => {
      documentService.updateStatus.mockResolvedValue(undefined);
      documentService.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: 'tenant-1',
        knowledgeBaseId: 'kb-1',
      });

      await worker.onFailed(
        createMockJob({ attemptsMade: 2 }),
        new Error('index failed'),
      );

      expect(documentService.updateStatus).toHaveBeenCalledWith(
        DOC_ID,
        'failed',
        'index failed',
      );
      expect(ragService.deleteByDocument).toHaveBeenCalledWith(
        DOC_ID,
        'tenant-1',
      );
      expect(knowledgeGateway.emitDocumentStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
        expect.objectContaining({
          documentId: DOC_ID,
          knowledgeBaseId: 'kb-1',
          status: 'failed',
          errorMessage: 'index failed',
        }),
      );
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
      );
    });

    it('should still emit WS events when vector cleanup fails', async () => {
      documentService.updateStatus.mockResolvedValue(undefined);
      documentService.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: 'tenant-1',
        knowledgeBaseId: 'kb-1',
      });
      ragService.deleteByDocument.mockRejectedValueOnce(
        new Error('Qdrant unavailable'),
      );

      await worker.onFailed(
        createMockJob({ attemptsMade: 3 }),
        new Error('index failed'),
      );

      expect(ragService.deleteByDocument).toHaveBeenCalledWith(
        DOC_ID,
        'tenant-1',
      );
      expect(knowledgeGateway.emitDocumentStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
        expect.objectContaining({
          documentId: DOC_ID,
          status: 'failed',
        }),
      );
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
      );
    });
  });
});
