import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import type {
  IDocumentParser,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';

@Injectable()
export class DocxParser implements IDocumentParser {
  private readonly logger = new Logger(DocxParser.name);

  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  async parse(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    this.logger.debug(`解析 DOCX 文件: ${fileName}`);

    const result = await mammoth.extractRawText({ buffer });
    const fullText = result.value;

    const sections: ParsedSection[] = [];
    let charOffset = 0;

    // 按段落分割文本（双换行）
    const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim());

    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].trim();
      if (!text) continue;

      const actualOffset = fullText.indexOf(text, charOffset);

      sections.push({
        text,
        location: {
          page: null,
          paragraph: i,
          heading: null,
          charOffset: actualOffset >= 0 ? actualOffset : charOffset,
        },
      });

      charOffset =
        (actualOffset >= 0 ? actualOffset : charOffset) + text.length;
    }

    return {
      fullText,
      sections,
      metadata: {
        totalPages: null,
        totalCharacters: fullText.length,
      },
    };
  }
}
