import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { DocumentService } from './document.service';
import { DocumentChunkService } from './document-chunk.service';
import {
  PdfParser,
  DocxParser,
  MarkdownParser,
  TextParser,
  DocumentParserService,
} from './parsers';
import { TextChunkerService } from './chunker';

@Module({
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
  ],
  exports: [
    KnowledgeBaseService,
    DocumentService,
    DocumentChunkService,
    DocumentParserService,
    TextChunkerService,
  ],
})
export class KnowledgeModule {}
