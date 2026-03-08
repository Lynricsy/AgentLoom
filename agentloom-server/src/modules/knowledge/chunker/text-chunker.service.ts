import { Injectable, Logger } from '@nestjs/common';
import { encode, decode } from 'gpt-tokenizer';
import type {
  DocumentChunk,
  ParsedDocument,
  ParsedSection,
} from '../interfaces/document-parser.interface';

export interface ChunkOptions {
  /** 每个块的最大 token 数 */
  maxTokens: number;
  /** 相邻块之间的重叠 token 数 */
  overlapTokens: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 512,
  overlapTokens: 64,
};

@Injectable()
export class TextChunkerService {
  private readonly logger = new Logger(TextChunkerService.name);

  /**
   * 将解析后的文档分割为多个语义块
   */
  chunk(
    document: ParsedDocument,
    options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
  ): DocumentChunk[] {
    const { maxTokens, overlapTokens } = options;

    if (!document.sections.length) {
      return [];
    }

    const chunks: DocumentChunk[] = [];
    let currentTexts: string[] = [];
    let currentTokenCount = 0;
    let currentLocation: ParsedSection['location'] | null = null;

    for (const section of document.sections) {
      const sectionTokens = encode(section.text).length;

      // 处理超大段落
      if (sectionTokens > maxTokens) {
        // 先刷出已累积内容
        if (currentTexts.length > 0) {
          chunks.push(
            this.createChunk(
              currentTexts.join('\n\n'),
              currentLocation!,
              currentTokenCount,
            ),
          );
          currentTexts = [];
          currentTokenCount = 0;
          currentLocation = null;
        }

        // 拆分大段落
        const subChunks = this.splitLargeSection(
          section,
          maxTokens,
          overlapTokens,
        );
        chunks.push(...subChunks);
        continue;
      }

      // 检查当前块是否已满
      if (
        currentTokenCount + sectionTokens > maxTokens &&
        currentTexts.length > 0
      ) {
        const chunkText = currentTexts.join('\n\n');
        chunks.push(
          this.createChunk(chunkText, currentLocation!, currentTokenCount),
        );

        // 使用重叠文本
        const overlapText = this.getOverlapText(chunkText, overlapTokens);
        currentTexts = overlapText ? [overlapText] : [];
        currentTokenCount = overlapText ? encode(overlapText).length : 0;
        currentLocation = overlapText ? currentLocation : null;
      }

      if (!currentLocation) {
        currentLocation = section.location;
      }

      currentTexts.push(section.text);
      currentTokenCount += sectionTokens;
    }

    // 刷出最后一个块
    if (currentTexts.length > 0 && currentLocation) {
      chunks.push(
        this.createChunk(
          currentTexts.join('\n\n'),
          currentLocation,
          currentTokenCount,
        ),
      );
    }

    this.logger.debug(`文本分块完成: ${chunks.length} 个块`);
    return chunks;
  }

  /**
   * 将超大段落按句子边界拆分为多个块
   */
  private splitLargeSection(
    section: ParsedSection,
    maxTokens: number,
    overlapTokens: number,
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    // 按句号、问号、感叹号、换行分句
    const sentences = section.text.split(/(?<=[.。!！?？\n])\s*/);
    let currentTexts: string[] = [];
    let currentTokenCount = 0;

    for (const sentence of sentences) {
      const sentenceTokens = encode(sentence).length;

      if (
        currentTokenCount + sentenceTokens > maxTokens &&
        currentTexts.length > 0
      ) {
        const chunkText = currentTexts.join(' ');
        chunks.push(
          this.createChunk(chunkText, section.location, currentTokenCount),
        );

        const overlapText = this.getOverlapText(chunkText, overlapTokens);
        currentTexts = overlapText ? [overlapText] : [];
        currentTokenCount = overlapText ? encode(overlapText).length : 0;
      }

      currentTexts.push(sentence);
      currentTokenCount += sentenceTokens;
    }

    if (currentTexts.length > 0) {
      chunks.push(
        this.createChunk(
          currentTexts.join(' '),
          section.location,
          currentTokenCount,
        ),
      );
    }

    return chunks;
  }

  /**
   * 从文本末尾获取指定 token 数量的重叠文本
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    if (overlapTokens <= 0) return '';
    const tokens = encode(text);
    if (tokens.length <= overlapTokens) return text;
    return decode(tokens.slice(-overlapTokens));
  }

  /**
   * 创建文档块
   */
  private createChunk(
    content: string,
    location: ParsedSection['location'],
    tokenCount: number,
  ): DocumentChunk {
    return {
      content,
      location: {
        page: location.page,
        paragraph: location.paragraph,
        heading: location.heading,
        charOffset: location.charOffset,
        charLength: content.length,
      },
      tokenCount,
    };
  }
}
