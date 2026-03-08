import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { DocumentService } from './document.service';

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, DocumentService],
  exports: [KnowledgeBaseService, DocumentService],
})
export class KnowledgeModule {}
