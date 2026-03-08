import { Injectable, Logger } from '@nestjs/common';
import type {
  IDocumentParser,
  ParsedDocument,
} from '../interfaces/document-parser.interface';
import { UnsupportedFileTypeException } from '../knowledge.exceptions';
import { PdfParser } from './pdf.parser';
import { DocxParser } from './docx.parser';
import { MarkdownParser } from './markdown.parser';
import { TextParser } from './text.parser';

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);
  private readonly parsers: IDocumentParser[];

  constructor(
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
    private readonly markdownParser: MarkdownParser,
    private readonly textParser: TextParser,
  ) {
    this.parsers = [pdfParser, docxParser, markdownParser, textParser];
  }

  async parse(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<ParsedDocument> {
    const parser = this.parsers.find((p) =>
      p.supportedMimeTypes.includes(mimeType),
    );

    if (!parser) {
      this.logger.warn(`不支持的 MIME 类型: ${mimeType}`);
      throw new UnsupportedFileTypeException(fileName);
    }

    this.logger.debug(
      `使用 ${parser.constructor.name} 解析文件: ${fileName} (${mimeType})`,
    );
    return parser.parse(buffer, fileName);
  }
}
