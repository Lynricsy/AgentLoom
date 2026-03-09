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
  VECTOR_STORE,
} from './knowledge.constants';
import { ApiKeyModule } from '../api-key/api-key.module';
import { qdrantClientProvider } from './qdrant.provider';
import { QdrantVectorStoreService } from './services/qdrant-vector-store.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';

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
    ApiKeyModule,
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
    qdrantClientProvider,
    {
      provide: VECTOR_STORE,
      useClass: QdrantVectorStoreService,
    },
    EmbeddingService,
    RagService,
  ],
  exports: [
    KnowledgeBaseService,
    DocumentService,
    DocumentChunkService,
    DocumentParserService,
    TextChunkerService,
    KnowledgeGateway,
    RagService,
  ],
})
export class KnowledgeModule {}
