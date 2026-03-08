import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { DocumentService } from './document.service';
import { DocumentChunkService } from './document-chunk.service';
import { DocumentProcessingWorker } from './document-processing.worker';
import { DocumentIndexingWorker } from './document-indexing.worker';
import {
  PdfParser,
  DocxParser,
  MarkdownParser,
  TextParser,
  DocumentParserService,
} from './parsers';
import { TextChunkerService } from './chunker';
import { KnowledgeGateway } from './knowledge.gateway';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_INDEXING_QUEUE,
} from './knowledge.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: DOCUMENT_PROCESSING_QUEUE,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: DOCUMENT_INDEXING_QUEUE,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    ),
  ],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    DocumentService,
    DocumentChunkService,
    PdfParser,
    DocxParser,
    MarkdownParser,
    TextParser,
    DocumentParserService,
    TextChunkerService,
    DocumentProcessingWorker,
    DocumentIndexingWorker,
    KnowledgeGateway,
  ],
  exports: [
    KnowledgeBaseService,
    DocumentService,
    DocumentChunkService,
    DocumentParserService,
    TextChunkerService,
    KnowledgeGateway,
  ],
})
export class KnowledgeModule {}
