import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { DocumentService } from './document.service';
import { DocumentProcessingWorker } from './document-processing.worker';
import { DocumentIndexingWorker } from './document-indexing.worker';
import {
  PdfParser,
  DocxParser,
  MarkdownParser,
  TextParser,
  DocumentParserService,
} from './parsers';
import { KnowledgeGateway } from './knowledge.gateway';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_INDEXING_QUEUE,
} from './knowledge.constants';
import { ApiKeyModule } from '../api-key/api-key.module';
import { LlmModule } from '../llm/llm.module';
import { ResourceSourceModule } from '../resource-source/resource-source.module';
import { qdrantClientProvider } from './qdrant.provider';
import { QdrantVectorStoreService } from './services/qdrant-vector-store.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';
import { KnowledgeNodeService } from './knowledge-node.service';
import { KnowledgeNodeFactoryService } from './services/knowledge-node-factory.service';

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
    LlmModule,
    ResourceSourceModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    DocumentService,
    KnowledgeNodeService,
    PdfParser,
    DocxParser,
    MarkdownParser,
    TextParser,
    DocumentParserService,
    KnowledgeNodeFactoryService,
    DocumentProcessingWorker,
    DocumentIndexingWorker,
    KnowledgeGateway,
    qdrantClientProvider,
    QdrantVectorStoreService,
    EmbeddingService,
    RagService,
  ],
  exports: [
    KnowledgeBaseService,
    DocumentService,
    KnowledgeNodeService,
    DocumentParserService,
    KnowledgeNodeFactoryService,
    KnowledgeGateway,
    RagService,
  ],
})
export class KnowledgeModule {}
