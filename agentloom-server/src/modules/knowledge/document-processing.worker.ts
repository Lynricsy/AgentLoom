import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Readable } from 'node:stream';

import { DocumentService } from './document.service';
import { DocumentParserService } from './parsers/document-parser.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  KnowledgeGateway,
  type DocumentProgressStage,
  type DocumentStatusProgress,
} from './knowledge.gateway';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_INDEXING_QUEUE,
} from './knowledge.constants';
import { KnowledgeNodeService } from './knowledge-node.service';
import { KnowledgeNodeFactoryService } from './services/knowledge-node-factory.service';

const DOCUMENT_PROGRESS_BY_STAGE = {
  preparing: {
    percentage: 10,
    stage: 'preparing',
    currentStep: 1,
    totalSteps: 5,
  },
  parsing: {
    percentage: 35,
    stage: 'parsing',
    currentStep: 2,
    totalSteps: 5,
  },
  chunking: {
    percentage: 65,
    stage: 'chunking',
    currentStep: 3,
    totalSteps: 5,
  },
  queueing: {
    percentage: 90,
    stage: 'queueing',
    currentStep: 4,
    totalSteps: 5,
  },
  completed: {
    percentage: 100,
    stage: 'completed',
    currentStep: 5,
    totalSteps: 5,
  },
} satisfies Record<DocumentProgressStage, DocumentStatusProgress>;

export interface DocumentProcessingJobData {
  documentId: string;
}

export interface DocumentIndexingJobData {
  documentId: string;
}

interface DocumentRealtimeContext {
  id: string;
  tenantId: string;
  knowledgeBaseId: string;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingWorker extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingWorker.name);
  @InjectQueue(DOCUMENT_INDEXING_QUEUE)
  private readonly indexingQueue!: Queue<DocumentIndexingJobData>;

  constructor(
    private readonly documentService: DocumentService,
    private readonly parserService: DocumentParserService,
    private readonly knowledgeNodeService: KnowledgeNodeService,
    private readonly knowledgeNodeFactory: KnowledgeNodeFactoryService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly knowledgeGateway: KnowledgeGateway,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  private emitProcessingProgress(
    document: DocumentRealtimeContext,
    stage: DocumentProgressStage,
  ) {
    this.knowledgeGateway.emitDocumentStatusChanged(
      document.tenantId,
      document.knowledgeBaseId,
      {
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        status: 'processing',
        progress: DOCUMENT_PROGRESS_BY_STAGE[stage],
      },
    );
  }

  async process(job: Job<DocumentProcessingJobData>): Promise<void> {
    const { documentId } = job.data;
    const indexingJobId = job.id
      ? `index-${documentId}-${job.id}`
      : `index-${documentId}-${Date.now()}`;

    if (job.attemptsMade === 0) {
      await this.documentService.updateStatus(documentId, 'processing');
    }

    this.logger.log(
      `Processing document ${documentId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
    );

    const document = await this.documentService.findById(documentId);

    const knowledgeBase = await this.knowledgeBaseService.findByIdOrThrow(
      document.knowledgeBaseId,
      document.tenantId,
    );

    this.emitProcessingProgress(document, 'preparing');

    const fileStream = await this.storageService.download(document.storageKey);
    const buffer = await streamToBuffer(fileStream);

    this.emitProcessingProgress(document, 'parsing');

    const parsed = await this.parserService.parse(
      buffer,
      document.mimeType,
      document.fileName,
    );

    this.emitProcessingProgress(document, 'chunking');

    const nodes = this.knowledgeNodeFactory.createNodes(
      {
        id: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
        fileName: document.fileName,
        mimeType: document.mimeType,
      },
      parsed,
      this.knowledgeBaseService.getChunkingStrategy(knowledgeBase),
    );

    const nodeCount = await this.knowledgeNodeService.replaceNodes(
      documentId,
      nodes,
    );

    this.emitProcessingProgress(document, 'queueing');

    await this.indexingQueue.add(
      'index',
      { documentId },
      { jobId: indexingJobId },
    );

    this.logger.log(
      `Document ${documentId} processed: ${nodeCount} knowledge nodes created and queued for indexing`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<DocumentProcessingJobData>,
    error: Error,
  ): Promise<void> {
    this.logger.error(
      `Document ${job.data.documentId} processing failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
    await this.documentService.updateStatus(
      job.data.documentId,
      'failed',
      error.message,
    );

    try {
      const document = await this.documentService.findById(job.data.documentId);
      this.knowledgeGateway.emitDocumentStatusChanged(
        document.tenantId,
        document.knowledgeBaseId,
        {
          documentId: job.data.documentId,
          knowledgeBaseId: document.knowledgeBaseId,
          status: 'failed',
          errorMessage: error.message,
        },
      );
      this.knowledgeGateway.emitKnowledgeBaseUpdated(
        document.tenantId,
        document.knowledgeBaseId,
      );
    } catch {
      this.logger.warn(
        `Failed to emit WebSocket event for document ${job.data.documentId}`,
      );
    }
  }
}
