import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import type { DocumentIndexingJobData } from './document-processing.worker';
import { DocumentService } from './document.service';
import { KnowledgeGateway } from './knowledge.gateway';
import { DOCUMENT_INDEXING_QUEUE } from './knowledge.constants';
import { DocumentNotFoundException } from './knowledge.exceptions';
import { RagService } from './services/rag.service';

const INDEXING_COMPLETED_PROGRESS = {
  percentage: 100,
  stage: 'completed',
  currentStep: 5,
  totalSteps: 5,
} as const;

@Processor(DOCUMENT_INDEXING_QUEUE)
export class DocumentIndexingWorker extends WorkerHost {
  private readonly logger = new Logger(DocumentIndexingWorker.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly knowledgeGateway: KnowledgeGateway,
    private readonly ragService: RagService,
  ) {
    super();
  }

  async process(job: Job<DocumentIndexingJobData>): Promise<void> {
    const { documentId } = job.data;

    try {
      const document = await this.documentService.findById(documentId);

      await this.ragService.indexDocument(documentId, document.tenantId);

      await this.documentService.updateStatus(documentId, 'ready');

      this.knowledgeGateway.emitDocumentStatusChanged(
        document.tenantId,
        document.knowledgeBaseId,
        {
          documentId,
          knowledgeBaseId: document.knowledgeBaseId,
          status: 'ready',
          progress: INDEXING_COMPLETED_PROGRESS,
        },
      );
      this.knowledgeGateway.emitKnowledgeBaseUpdated(
        document.tenantId,
        document.knowledgeBaseId,
      );

      this.logger.log(`Document ${documentId} indexing finalized`);
    } catch (error) {
      if (error instanceof DocumentNotFoundException) {
        this.logger.warn(
          `Skipping indexing finalization for deleted document ${documentId}`,
        );
        return;
      }

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DocumentIndexingJobData>, error: Error): Promise<void> {
    this.logger.error(
      `Document ${job.data.documentId} indexing failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
    await this.documentService.updateStatus(
      job.data.documentId,
      'failed',
      error.message,
    );

    try {
      const document = await this.documentService.findById(job.data.documentId);

      await this.ragService.deleteByDocument(
        job.data.documentId,
        document.tenantId,
      );

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
