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
    const fullTextLength = document.fullText.length;

    if (!document.sections.length) {
      return [];
    }

    const chunks: DocumentChunk[] = [];
    let currentTexts: string[] = [];
    let currentTokenCount = 0;
    let currentLocation: ParsedSection['location'] | null = null;
    let currentCharEnd = 0;
    /** overlap 文本的字符数（不含 '\n\n' 分隔符）；用于反向调整 charOffset */
    let overlapPrefixLength = 0;

    /**
     * 将当前累积内容刷出为一个 DocumentChunk。
     * charOffset 向前调整 overlapPrefixLength，charLength 覆盖完整 content 长度。
     */
    const flushChunk = (): void => {
      if (currentTexts.length === 0 || !currentLocation) return;

      const content = currentTexts.join('\n\n');
      // 向前调整 charOffset 以覆盖 overlap 前缀；clamp 至 [0, fullTextLength)
      const charOffset = Math.max(0, currentLocation.charOffset - overlapPrefixLength);
      // charLength 覆盖完整 content，同时保证不越出 fullText 边界
      const charLength = Math.min(content.length, fullTextLength - charOffset);

      chunks.push(
        this.createChunk(content, currentLocation, currentTokenCount, charOffset, charLength),
      );
    };

    for (const section of document.sections) {
      const sectionTokens = encode(section.text).length;

      // 处理超大段落
      if (sectionTokens > maxTokens) {
        // 先刷出已累积内容
        flushChunk();
        currentTexts = [];
        currentTokenCount = 0;
        currentLocation = null;
        currentCharEnd = 0;
        overlapPrefixLength = 0;

        // 拆分大段落
        const subChunks = this.splitLargeSection(
          section,
          maxTokens,
          overlapTokens,
          fullTextLength,
        );
        chunks.push(...subChunks);
        continue;
      }

      // 检查当前块是否已满
      if (
        currentTokenCount + sectionTokens > maxTokens &&
        currentTexts.length > 0
      ) {
        const prevCharEnd = currentCharEnd;
        // 刷出当前块
        flushChunk();

        // 计算重叠文本，限制重叠量确保下一个块不超过 maxTokens
        const chunkText = currentTexts.join('\n\n');
        const availableForOverlap = Math.max(0, maxTokens - sectionTokens);
        const effectiveOverlap = Math.min(overlapTokens, availableForOverlap);
        const overlapText = this.getOverlapText(chunkText, effectiveOverlap);

        if (overlapText) {
          currentTexts = [overlapText];
          currentTokenCount = encode(overlapText).length;
          // overlap 在 fullText 中的起始位置 ≈ prevCharEnd - overlapText.length
          // 记录 overlapPrefixLength 供下次 flushChunk 调整 charOffset
          overlapPrefixLength = overlapText.length;
        } else {
          currentTexts = [];
          currentTokenCount = 0;
          overlapPrefixLength = 0;
        }
        // 始终重置位置，确保下一个块使用新段落的位置作为基准
        currentLocation = null;
        currentCharEnd = prevCharEnd;
      }

      if (!currentLocation) {
        currentLocation = section.location;
      }

      currentTexts.push(section.text);
      currentTokenCount += sectionTokens;
      currentCharEnd = section.location.charOffset + section.text.length;
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
    fullTextLength: number,
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    // 按句号、问号、感叹号、换行分句
    const sentences = section.text.split(/(?<=[.。!！?？\n])\s*/);
    let currentTexts: string[] = [];
    let currentTokenCount = 0;
    /** 当前子块中 overlap 前缀的字符数（用于 charOffset 反向调整） */
    let overlapPrefixLength = 0;
    /** 当前子块主文本（非 overlap）在 section.text 中的起始位置 */
    let mainTextLocalOffset = 0;

    const flushSub = (): void => {
      if (currentTexts.length === 0) return;
      const content = currentTexts.join(' ');
      // charOffset 向前调整覆盖 overlap 前缀
      const charOffset = Math.max(
        0,
        section.location.charOffset + mainTextLocalOffset - overlapPrefixLength,
      );
      const charLength = Math.min(content.length, fullTextLength - charOffset);
      chunks.push(
        this.createChunk(content, section.location, currentTokenCount, charOffset, charLength),
      );
    };

    let localOffset = 0;

    for (const sentence of sentences) {
      const sentenceTokens = encode(sentence).length;

      if (
        currentTokenCount + sentenceTokens > maxTokens &&
        currentTexts.length > 0
      ) {
        flushSub();

        // 限制重叠量确保下一个子块不超过 maxTokens
        const availableForOverlap = Math.max(0, maxTokens - sentenceTokens);
        const effectiveOverlap = Math.min(overlapTokens, availableForOverlap);
        const chunkText = currentTexts.join(' ');
        const overlapText = this.getOverlapText(chunkText, effectiveOverlap);

        if (overlapText) {
          currentTexts = [overlapText];
          overlapPrefixLength = overlapText.length;
          currentTokenCount = encode(overlapText).length;
        } else {
          currentTexts = [];
          overlapPrefixLength = 0;
          currentTokenCount = 0;
        }
        // 主文本从当前句子在 section.text 中的位置开始
        mainTextLocalOffset = localOffset;
      }

      currentTexts.push(sentence);
      currentTokenCount += sentenceTokens;
      localOffset += sentence.length;
    }

    flushSub();
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
