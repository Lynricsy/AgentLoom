import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Job, Queue } from 'bullmq';

import { DocumentProcessingWorker } from '../document-processing.worker';
import type { DocumentProcessingJobData } from '../document-processing.worker';
import { DocumentService } from '../document.service';
import { DocumentChunkService } from '../document-chunk.service';
import { DocumentParserService } from '../parsers/document-parser.service';
import { TextChunkerService } from '../chunker/text-chunker.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_INDEXING_QUEUE,
} from '../knowledge.constants';
import { Readable } from 'node:stream';

const DOC_ID = '00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = 'tenants/t1/kb1/doc1/file.pdf';

function createMockStream(data: Buffer): Readable {
  return Readable.from([data]);
}

function createMockJob(
  overrides: Partial<Job<DocumentProcessingJobData>> = {},
): Job<DocumentProcessingJobData> {
  return {
    data: { documentId: DOC_ID },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<DocumentProcessingJobData>;
}

describe('DocumentProcessingWorker', () => {
  let worker: DocumentProcessingWorker;
  let documentService: { findById: Mock; updateStatus: Mock };
  let documentChunkService: { createChunks: Mock };
  let parserService: { parse: Mock };
  let chunkerService: { chunk: Mock };
  let storageService: { download: Mock };
  let indexingQueue: { add: Mock };

  beforeEach(async () => {
    documentService = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    documentChunkService = { createChunks: vi.fn() };
    parserService = { parse: vi.fn() };
    chunkerService = { chunk: vi.fn() };
    storageService = { download: vi.fn() };
    indexingQueue = { add: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessingWorker,
        { provide: DocumentService, useValue: documentService },
        { provide: DocumentChunkService, useValue: documentChunkService },
        { provide: DocumentParserService, useValue: parserService },
        { provide: TextChunkerService, useValue: chunkerService },
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

    const mockParsed = {
      fullText: 'Hello world',
      sections: [{ heading: null, content: 'Hello world', level: 0 }],
      metadata: { totalPages: 1, totalCharacters: 11 },
    };

    const mockChunks = [
      {
        content: 'Hello world',
        location: { page: 1, paragraph: 1, heading: null, charOffset: 0, charLength: 11 },
        tokenCount: 3,
      },
    ];

    const fileBuffer = Buffer.from('fake-pdf-content');

    beforeEach(() => {
      documentService.findById.mockResolvedValue(mockDocument);
      storageService.download.mockResolvedValue(createMockStream(fileBuffer));
      parserService.parse.mockResolvedValue(mockParsed);
      chunkerService.chunk.mockReturnValue(mockChunks);
      documentChunkService.createChunks.mockResolvedValue(1);
      documentService.updateStatus.mockResolvedValue(undefined);
      indexingQueue.add.mockResolvedValue(undefined);
    });

    it('should run the full pipeline on first attempt', async () => {
      const job = createMockJob();

      await worker.process(job);

      expect(documentService.updateStatus).toHaveBeenCalledWith(DOC_ID, 'processing');
      expect(documentService.findById).toHaveBeenCalledWith(DOC_ID);
      expect(storageService.download).toHaveBeenCalledWith(STORAGE_KEY);
      expect(parserService.parse).toHaveBeenCalledWith(fileBuffer, 'application/pdf', 'test.pdf');
      expect(chunkerService.chunk).toHaveBeenCalledWith(mockParsed);
      expect(documentChunkService.createChunks).toHaveBeenCalledWith(DOC_ID, mockChunks);
      expect(documentService.updateStatus).toHaveBeenCalledWith(DOC_ID, 'ready');
      expect(indexingQueue.add).toHaveBeenCalledWith(
        'index',
        { documentId: DOC_ID },
        { jobId: `index-${DOC_ID}` },
      );
    });

    it('should not set processing status on retry attempts', async () => {
      const job = createMockJob({ attemptsMade: 1 });

      await worker.process(job);

      const statusCalls = documentService.updateStatus.mock.calls;
      expect(statusCalls).toHaveLength(1);
      expect(statusCalls[0]).toEqual([DOC_ID, 'ready']);
    });

    it('should propagate parser errors for BullMQ retry', async () => {
      parserService.parse.mockRejectedValue(new Error('Corrupt PDF'));

      await expect(worker.process(createMockJob())).rejects.toThrow('Corrupt PDF');
    });

    it('should propagate storage download errors', async () => {
      storageService.download.mockRejectedValue(new Error('S3 unavailable'));

      const job = createMockJob();
      await expect(worker.process(job)).rejects.toThrow('S3 unavailable');
    });

    it('should dispatch indexing job with correct jobId', async () => {
      await worker.process(createMockJob());

      expect(indexingQueue.add).toHaveBeenCalledWith(
        'index',
        { documentId: DOC_ID },
        expect.objectContaining({ jobId: `index-${DOC_ID}` }),
      );
    });
  });

  describe('onFailed', () => {
    it('should set document status to failed with error message', async () => {
      documentService.updateStatus.mockResolvedValue(undefined);
      const job = createMockJob({ attemptsMade: 3 });
      const error = new Error('Final failure: corrupt file');

      await worker.onFailed(job, error);

      expect(documentService.updateStatus).toHaveBeenCalledWith(
        DOC_ID,
        'failed',
        'Final failure: corrupt file',
      );
    });
  });
});
