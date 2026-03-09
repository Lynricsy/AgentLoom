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

const VECTOR_CLEANUP_MAX_ATTEMPTS = 3;

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
    const { documentId } = job.data;
    this.logger.error(
      `Document ${documentId} indexing failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
    await this.documentService.updateStatus(documentId, 'failed', error.message);

    let document;
    try {
      document = await this.documentService.findById(documentId);
    } catch (lookupError) {
      if (lookupError instanceof DocumentNotFoundException) {
        this.logger.warn(
          `Skipping failure finalization for deleted document ${documentId}`,
        );
        return;
      }

      this.logger.warn(
        `Failed to load document ${documentId} for failure finalization`,
        lookupError instanceof Error
          ? lookupError.stack ?? lookupError.message
          : String(lookupError),
      );
      return;
    }

    const cleanupError = await this.cleanupVectorsWithRetry(
      documentId,
      document.tenantId,
    );
    const errorMessage = cleanupError
      ? `${error.message} | vector cleanup failed: ${cleanupError}`
      : error.message;

    if (cleanupError) {
      await this.documentService.updateStatus(documentId, 'failed', errorMessage);
    }

    try {
      this.knowledgeGateway.emitDocumentStatusChanged(
        document.tenantId,
        document.knowledgeBaseId,
        {
          documentId,
          knowledgeBaseId: document.knowledgeBaseId,
          status: 'failed',
          errorMessage,
        },
      );
    } catch (emitError) {
      this.logger.warn(
        `Failed to emit document status event for document ${documentId}`,
        emitError instanceof Error
          ? emitError.stack ?? emitError.message
          : String(emitError),
      );
    }

    try {
      this.knowledgeGateway.emitKnowledgeBaseUpdated(
        document.tenantId,
        document.knowledgeBaseId,
      );
    } catch (emitError) {
      this.logger.warn(
        `Failed to emit knowledge base update event for document ${documentId}`,
        emitError instanceof Error
          ? emitError.stack ?? emitError.message
          : String(emitError),
      );
    }
  }

  private async cleanupVectorsWithRetry(
    documentId: string,
    tenantId: string,
  ): Promise<string | null> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < VECTOR_CLEANUP_MAX_ATTEMPTS; attempt++) {
      try {
        await this.ragService.deleteByDocument(documentId, tenantId);
        return null;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < VECTOR_CLEANUP_MAX_ATTEMPTS - 1) {
          const delay = 250 * 2 ** attempt;
          this.logger.warn(
            `Failed to cleanup vectors for document ${documentId}, retrying in ${delay}ms`,
            lastError.stack ?? lastError.message,
          );
          await this.sleep(delay);
        }
      }
    }

    const message = lastError?.message ?? 'unknown cleanup error';
    this.logger.error(
      `Failed to cleanup vectors for document ${documentId} after ${VECTOR_CLEANUP_MAX_ATTEMPTS} attempts: ${message}`,
      lastError?.stack,
    );
    return message;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
