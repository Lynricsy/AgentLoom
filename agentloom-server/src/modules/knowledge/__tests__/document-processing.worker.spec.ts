import { Readable } from 'node:stream';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { StorageService } from '../../../infrastructure/storage/storage.service';
import { DOCUMENT_INDEXING_QUEUE } from '../knowledge.constants';
import { KnowledgeGateway } from '../knowledge.gateway';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { KnowledgeNodeService } from '../knowledge-node.service';
import { DocumentProcessingWorker } from '../document-processing.worker';
import type { DocumentProcessingJobData } from '../document-processing.worker';
import { DocumentService } from '../document.service';
import { DocumentParserService } from '../parsers/document-parser.service';
import { KnowledgeNodeFactoryService } from '../services/knowledge-node-factory.service';

const DOC_ID = '00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = 'tenants/t1/kb1/doc1/file.pdf';

function createMockStream(data: Buffer): Readable {
  return Readable.from([data]);
}

function createMockJob(
  overrides: Partial<Job<DocumentProcessingJobData>> = {},
): Job<DocumentProcessingJobData> {
  return {
    id: `process-${DOC_ID}`,
    data: { documentId: DOC_ID },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<DocumentProcessingJobData>;
}

describe('DocumentProcessingWorker', () => {
  let worker: DocumentProcessingWorker;
  let documentService: { findById: Mock; updateStatus: Mock };
  let parserService: { parse: Mock };
  let knowledgeNodeService: { replaceNodes: Mock };
  let knowledgeNodeFactory: { createNodes: Mock };
  let knowledgeBaseService: {
    findByIdOrThrow: Mock;
    getChunkingStrategy: Mock;
  };
  let knowledgeGateway: {
    emitDocumentStatusChanged: Mock;
    emitKnowledgeBaseUpdated: Mock;
  };
  let storageService: { download: Mock };
  let indexingQueue: { add: Mock };

  beforeEach(async () => {
    documentService = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    parserService = { parse: vi.fn() };
    knowledgeNodeService = { replaceNodes: vi.fn() };
    knowledgeNodeFactory = { createNodes: vi.fn() };
    knowledgeBaseService = {
      findByIdOrThrow: vi.fn(),
      getChunkingStrategy: vi.fn(),
    };
    knowledgeGateway = {
      emitDocumentStatusChanged: vi.fn(),
      emitKnowledgeBaseUpdated: vi.fn(),
    };
    storageService = { download: vi.fn() };
    indexingQueue = { add: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessingWorker,
        { provide: DocumentService, useValue: documentService },
        { provide: DocumentParserService, useValue: parserService },
        { provide: KnowledgeNodeService, useValue: knowledgeNodeService },
        {
          provide: KnowledgeNodeFactoryService,
          useValue: knowledgeNodeFactory,
        },
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: KnowledgeGateway, useValue: knowledgeGateway },
        { provide: StorageService, useValue: storageService },
        {
          provide: getQueueToken(DOCUMENT_INDEXING_QUEUE),
          useValue: indexingQueue,
        },
      ],
    }).compile();

    worker = module.get(DocumentProcessingWorker);
  });

  describe('process', () => {
    const mockDocument = {
      id: DOC_ID,
      storageKey: STORAGE_KEY,
      mimeType: 'application/pdf',
      fileName: 'test.pdf',
      status: 'uploaded' as const,
      tenantId: 'tenant-1',
      knowledgeBaseId: 'kb-1',
    };

    const mockKnowledgeBase = {
      id: 'kb-1',
      tenantId: 'tenant-1',
      chunkingStrategy: {
        type: 'sentence_window' as const,
        windowSize: 3,
      },
    };

    const mockParsed = {
      fullText: 'Hello world',
      sections: [
        {
          text: 'Hello world',
          location: {
            page: 1,
            paragraph: 1,
            heading: null,
            charOffset: 0,
          },
        },
      ],
      metadata: { totalPages: 1, totalCharacters: 11 },
    };

    const mockNodes = [{ id_: 'node-1' }];
    const fileBuffer = Buffer.from('fake-pdf-content');

    beforeEach(() => {
      documentService.findById.mockResolvedValue(mockDocument);
      storageService.download.mockResolvedValue(createMockStream(fileBuffer));
      parserService.parse.mockResolvedValue(mockParsed);
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue(mockKnowledgeBase);
      knowledgeBaseService.getChunkingStrategy.mockReturnValue(
        mockKnowledgeBase.chunkingStrategy,
      );
      knowledgeNodeFactory.createNodes.mockReturnValue(mockNodes);
      knowledgeNodeService.replaceNodes.mockResolvedValue(1);
      documentService.updateStatus.mockResolvedValue(undefined);
      indexingQueue.add.mockResolvedValue(undefined);
    });

    it('should run the full pipeline and emit staged progress on first attempt', async () => {
      const job = createMockJob();

      await worker.process(job);

      expect(documentService.updateStatus).toHaveBeenCalledWith(
        DOC_ID,
        'processing',
      );
      expect(documentService.findById).toHaveBeenCalledWith(DOC_ID);
      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        'kb-1',
        'tenant-1',
      );
      expect(storageService.download).toHaveBeenCalledWith(STORAGE_KEY);
      expect(parserService.parse).toHaveBeenCalledWith(
        fileBuffer,
        'application/pdf',
        'test.pdf',
      );
      expect(knowledgeBaseService.getChunkingStrategy).toHaveBeenCalledWith(
        mockKnowledgeBase,
      );
      expect(knowledgeNodeFactory.createNodes).toHaveBeenCalledWith(
        {
          id: DOC_ID,
          knowledgeBaseId: 'kb-1',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
        },
        mockParsed,
        mockKnowledgeBase.chunkingStrategy,
      );
      expect(knowledgeNodeService.replaceNodes).toHaveBeenCalledWith(
        DOC_ID,
        mockNodes,
      );
      expect(indexingQueue.add).toHaveBeenCalledWith(
        'index',
        { documentId: DOC_ID },
        { jobId: `index-${DOC_ID}-process-${DOC_ID}` },
      );
      expect(knowledgeGateway.emitDocumentStatusChanged.mock.calls).toEqual([
        [
          'tenant-1',
          'kb-1',
          expect.objectContaining({
            documentId: DOC_ID,
            knowledgeBaseId: 'kb-1',
            status: 'processing',
            progress: expect.objectContaining({
              stage: 'preparing',
              percentage: 10,
              currentStep: 1,
              totalSteps: 5,
            }),
          }),
        ],
        [
          'tenant-1',
          'kb-1',
          expect.objectContaining({
            status: 'processing',
            progress: expect.objectContaining({
              stage: 'parsing',
              percentage: 35,
            }),
          }),
        ],
        [
          'tenant-1',
          'kb-1',
          expect.objectContaining({
            status: 'processing',
            progress: expect.objectContaining({
              stage: 'chunking',
              percentage: 65,
            }),
          }),
        ],
        [
          'tenant-1',
          'kb-1',
          expect.objectContaining({
            status: 'processing',
            progress: expect.objectContaining({
              stage: 'queueing',
              percentage: 90,
            }),
          }),
        ],
      ]);
      expect(documentService.updateStatus.mock.calls).toEqual([
        [DOC_ID, 'processing'],
      ]);
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).not.toHaveBeenCalled();
    });

    it('should not set processing status on retry attempts', async () => {
      const job = createMockJob({ attemptsMade: 1 });

      await worker.process(job);

      expect(documentService.updateStatus).not.toHaveBeenCalled();
      expect(knowledgeGateway.emitDocumentStatusChanged).toHaveBeenCalledTimes(
        4,
      );
    });

    it('should derive a unique indexing job id from the current processing job', async () => {
      const job = createMockJob({ id: `rebuild-${DOC_ID}-1712345678901` });

      await worker.process(job);

      expect(indexingQueue.add).toHaveBeenCalledWith(
        'index',
        { documentId: DOC_ID },
        { jobId: `index-${DOC_ID}-rebuild-${DOC_ID}-1712345678901` },
      );
    });

    it('should propagate parser errors for BullMQ retry', async () => {
      parserService.parse.mockRejectedValue(new Error('Corrupt PDF'));

      await expect(worker.process(createMockJob())).rejects.toThrow(
        'Corrupt PDF',
      );
      expect(indexingQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('should mark the document as failed and emit websocket updates', async () => {
      const error = new Error('parser failed');
      const job = createMockJob({ attemptsMade: 3 });
      documentService.updateStatus.mockResolvedValue(undefined);
      documentService.findById.mockResolvedValue({
        id: DOC_ID,
        tenantId: 'tenant-1',
        knowledgeBaseId: 'kb-1',
      });

      await worker.onFailed(job, error);

      expect(documentService.updateStatus).toHaveBeenCalledWith(
        DOC_ID,
        'failed',
        'parser failed',
      );
      expect(knowledgeGateway.emitDocumentStatusChanged).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
        {
          documentId: DOC_ID,
          knowledgeBaseId: 'kb-1',
          status: 'failed',
          errorMessage: 'parser failed',
        },
      );
      expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
        'tenant-1',
        'kb-1',
      );
    });
  });
});
