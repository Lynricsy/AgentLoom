import { Injectable, Logger } from '@nestjs/common';
import type {
  IDocumentParser,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';

@Injectable()
export class TextParser implements IDocumentParser {
  private readonly logger = new Logger(TextParser.name);

  readonly supportedMimeTypes = ['text/plain'];

  async parse(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    this.logger.debug(`解析纯文本文件: ${fileName}`);

    const fullText = buffer.toString('utf-8');
    const sections: ParsedSection[] = [];

    // 按段落分割文本（双换行）
    const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim());
    let charOffset = 0;

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
