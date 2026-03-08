import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import type {
  IDocumentParser,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';

@Injectable()
export class PdfParser implements IDocumentParser {
  private readonly logger = new Logger(PdfParser.name);

  readonly supportedMimeTypes = ['application/pdf'];

  async parse(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    this.logger.debug(`解析 PDF 文件: ${fileName}`);

    const result = await pdfParse(buffer);
    const fullText = result.text;

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
        totalPages: result.numpages,
        totalCharacters: fullText.length,
      },
    };
  }
}
