import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Readable } from 'node:stream';

import { DocumentService } from './document.service';
import { DocumentChunkService } from './document-chunk.service';
import { DocumentParserService } from './parsers/document-parser.service';
import { TextChunkerService } from './chunker/text-chunker.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_INDEXING_QUEUE,
} from './knowledge.constants';

export interface DocumentProcessingJobData {
  documentId: string;
}

export interface DocumentIndexingJobData {
  documentId: string;
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

  constructor(
    private readonly documentService: DocumentService,
    private readonly documentChunkService: DocumentChunkService,
    private readonly parserService: DocumentParserService,
    private readonly chunkerService: TextChunkerService,
    private readonly storageService: StorageService,
    @InjectQueue(DOCUMENT_INDEXING_QUEUE)
    private readonly indexingQueue: Queue<DocumentIndexingJobData>,
  ) {
    super();
  }

  async process(job: Job<DocumentProcessingJobData>): Promise<void> {
    const { documentId } = job.data;

    if (job.attemptsMade === 0) {
      await this.documentService.updateStatus(documentId, 'processing');
    }

    this.logger.log(
      `Processing document ${documentId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
    );

    const document = await this.documentService.findById(documentId);

    const fileStream = await this.storageService.download(document.storageKey);
    const buffer = await streamToBuffer(fileStream);

    const parsed = await this.parserService.parse(
      buffer,
      document.mimeType,
      document.fileName,
    );

    const chunks = this.chunkerService.chunk(parsed);

    const chunkCount = await this.documentChunkService.createChunks(
      documentId,
      chunks,
    );

    await this.documentService.updateStatus(documentId, 'ready');

    this.logger.log(
      `Document ${documentId} processed: ${chunkCount} chunks created`,
    );

    await this.indexingQueue.add('index', { documentId }, { jobId: `index-${documentId}` });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DocumentProcessingJobData>, error: Error): Promise<void> {
    this.logger.error(
      `Document ${job.data.documentId} processing failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
    await this.documentService.updateStatus(
      job.data.documentId,
      'failed',
      error.message,
    );
  }
}
