import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type {
  IDocumentParser,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';
import { DocumentParseException } from '../knowledge.exceptions';
import { normalizeCjkRadicals } from './cjk-radical-normalizer';

@Injectable()
export class PdfParser implements IDocumentParser {
  private readonly logger = new Logger(PdfParser.name);

  readonly supportedMimeTypes = ['application/pdf'];

  async parse(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    this.logger.debug(`解析 PDF 文件: ${fileName}`);

    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      // 字体把常用汉字映射成部首字符（「同⼀」「运⾏」），切段与偏移计算前先归一化
      const pages = result.pages.map((page) => ({
        num: page.num,
        text: normalizeCjkRadicals(page.text),
      }));

      // 使用各页文本拼接完整文本，避免默认分页标记
      const fullText = pages.map((p) => p.text).join('\n\n');

      const sections: ParsedSection[] = [];
      let charOffset = 0;

      for (const page of pages) {
        let paragraphIndex = 0;
        const paragraphs = page.text.split(/\n\s*\n/);

        for (const rawParagraph of paragraphs) {
          const text = rawParagraph.trim();
          if (!text) continue;

          const actualOffset = fullText.indexOf(text, charOffset);

          sections.push({
            text,
            location: {
              page: page.num,
              paragraph: paragraphIndex,
              heading: null,
              charOffset: actualOffset >= 0 ? actualOffset : charOffset,
            },
          });

          charOffset =
            (actualOffset >= 0 ? actualOffset : charOffset) + text.length;
          paragraphIndex++;
        }
      }

      return {
        fullText,
        sections,
        metadata: {
          totalPages: result.total,
          totalCharacters: fullText.length,
        },
      };
    } catch (error) {
      if (error instanceof DocumentParseException) throw error;
      throw new DocumentParseException(
        fileName,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await parser.destroy();
    }
  }
}
