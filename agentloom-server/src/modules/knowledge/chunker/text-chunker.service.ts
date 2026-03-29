import { Injectable, Logger } from '@nestjs/common';
import { encode } from 'gpt-tokenizer';
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
   * 将解析后的文档分割为多个语义块。
   *
   * 物理定位语义约定：
   * - `charOffset`：该 chunk 内容（含 overlap 前缀）在 fullText 中的起始偏移量。
   *   当 chunk 包含来自上一块尾部的 overlap 文本时，charOffset 会向前调整以覆盖 overlap。
   * - `charLength`：chunk 内容（含 overlap 前缀）的字符长度，满足：
   *   `fullText.substring(charOffset, charOffset + charLength)` 与 chunk content 对应同一文本区间。
   * - `charOffset + charLength <= fullText.length` 始终成立。
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
    let currentSpanStart: number | null = null;
    let currentSpanEnd: number | null = null;
    let currentLocation: ParsedSection['location'] | null = null;

    const flushChunk = (): void => {
      if (
        currentSpanStart === null ||
        currentSpanEnd === null ||
        !currentLocation
      ) {
        return;
      }

      const content = document.fullText.slice(currentSpanStart, currentSpanEnd);

      if (!content) {
        return;
      }

      chunks.push(
        this.createChunk(
          content,
          currentLocation,
          encode(content).length,
          currentSpanStart,
          currentSpanEnd - currentSpanStart,
        ),
      );
    };

    for (const section of document.sections) {
      const sectionStart = section.location.charOffset;
      const sectionEnd = section.location.charOffset + section.text.length;
      const sectionTokens = encode(section.text).length;

      // 处理超大段落
      if (sectionTokens > maxTokens) {
        // 先刷出已累积内容
        flushChunk();
        currentSpanStart = null;
        currentSpanEnd = null;
        currentLocation = null;

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
        currentSpanStart !== null &&
        currentSpanEnd !== null &&
        encode(document.fullText.slice(currentSpanStart, sectionEnd)).length >
          maxTokens &&
        currentLocation
      ) {
        const previousSpanStart = currentSpanStart;
        const previousSpanEnd = currentSpanEnd;

        // 刷出当前块
        flushChunk();

        const overlapStart = this.findOverlapStart(
          document.fullText,
          previousSpanStart,
          previousSpanEnd,
          sectionEnd,
          maxTokens,
          overlapTokens,
        );

        currentSpanStart = overlapStart ?? sectionStart;
        currentSpanEnd = sectionEnd;
        currentLocation = section.location;
        continue;
      }

      if (currentSpanStart === null) {
        currentSpanStart = sectionStart;
      }

      if (!currentLocation) {
        currentLocation = section.location;
      }

      currentSpanEnd = sectionEnd;
    }

    // 刷出最后一个块
    flushChunk();

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
    const sentences = this.getSentenceRanges(section.text);
    let currentStartLocal: number | null = null;
    let currentEndLocal: number | null = null;

    const flushSub = (): void => {
      if (currentStartLocal === null || currentEndLocal === null) {
        return;
      }

      const content = section.text.slice(currentStartLocal, currentEndLocal);

      if (!content) {
        return;
      }

      chunks.push(
        this.createChunk(
          content,
          section.location,
          encode(content).length,
          section.location.charOffset + currentStartLocal,
          currentEndLocal - currentStartLocal,
        ),
      );
    };

    for (const sentence of sentences) {
      const sentenceStart = sentence.start;
      const sentenceEnd = sentence.end;
      if (
        currentStartLocal !== null &&
        currentEndLocal !== null &&
        encode(section.text.slice(currentStartLocal, sentenceEnd)).length >
          maxTokens
      ) {
        const previousStartLocal = currentStartLocal;
        const previousEndLocal = currentEndLocal;

        flushSub();

        const overlapStart = this.findOverlapStart(
          section.text,
          previousStartLocal,
          previousEndLocal,
          sentenceEnd,
          maxTokens,
          overlapTokens,
        );

        currentStartLocal = overlapStart ?? sentenceStart;
        currentEndLocal = sentenceEnd;
        continue;
      }

      if (currentStartLocal === null) {
        currentStartLocal = sentenceStart;
      }

      currentEndLocal = sentenceEnd;
    }

    flushSub();
    return chunks;
  }

  private findOverlapStart(
    text: string,
    previousStart: number,
    previousEnd: number,
    nextEnd: number,
    maxTokens: number,
    overlapTokens: number,
  ): number | null {
    if (overlapTokens <= 0 || !text || previousStart >= previousEnd) {
      return null;
    }

    for (let start = previousStart; start < previousEnd; start += 1) {
      const overlapText = text.slice(start, previousEnd);

      if (encode(overlapText).length > overlapTokens) {
        continue;
      }

      if (encode(text.slice(start, nextEnd)).length <= maxTokens) {
        return start;
      }
    }

    return null;
  }

  private getSentenceRanges(
    text: string,
  ): Array<{ start: number; end: number }> {
    const matches = Array.from(
      text.matchAll(/[\s\S]+?(?:[.。!！?？]\s*|\n+|$)/g),
    );

    return matches
      .map((match) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      }))
      .filter((range) => range.end > range.start);
  }

  /**
   * 创建文档块
   *
   * @param content - 完整分块文本（含 overlap 前缀）
   * @param location - 参考位置（用于 page/paragraph/heading 元数据）
   * @param tokenCount - token 数
   * @param charOffset - 在 fullText 中的起始字符偏移（已向前调整以覆盖 overlap）
   * @param charLength - 字符长度（覆盖完整 content）
   */
  private createChunk(
    content: string,
    location: ParsedSection['location'],
    tokenCount: number,
    charOffset: number,
    charLength: number,
  ): DocumentChunk {
    return {
      content,
      location: {
        page: location.page,
        paragraph: location.paragraph,
        heading: location.heading,
        charOffset,
        charLength,
      },
      tokenCount,
    };
  }
}
