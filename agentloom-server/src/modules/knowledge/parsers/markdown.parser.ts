import { Injectable, Logger } from '@nestjs/common';
import type {
  IDocumentParser,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';

@Injectable()
export class MarkdownParser implements IDocumentParser {
  private readonly logger = new Logger(MarkdownParser.name);

  readonly supportedMimeTypes = ['text/markdown'];

  async parse(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    this.logger.debug(`解析 Markdown 文件: ${fileName}`);

    let rawText = buffer.toString('utf-8');

    // 去除 frontmatter
    rawText = this.stripFrontmatter(rawText);

    const fullText = rawText;
    const sections: ParsedSection[] = [];

    // 按标题和双换行分割
    const parts = fullText
      .split(/\n(?=#{1,6}\s)|\n\s*\n/)
      .filter((p) => p.trim());

    let currentHeading: string | null = null;
    let charOffset = 0;

    for (let i = 0; i < parts.length; i++) {
      const text = parts[i].trim();
      if (!text) continue;

      // 检测标题
      const headingMatch = text.match(/^(#{1,6})\s+(.+)$/m);
      if (headingMatch) {
        currentHeading = headingMatch[2].trim();
      }

      const actualOffset = fullText.indexOf(text, charOffset);

      sections.push({
        text,
        location: {
          page: null,
          paragraph: i,
          heading: currentHeading,
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

  private stripFrontmatter(text: string): string {
    return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  }
}
