import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { TextChunkerService } from '../chunker/text-chunker.service';
import type { ParsedDocument } from '../interfaces/document-parser.interface';

describe('TextChunkerService', () => {
  let chunker: TextChunkerService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [TextChunkerService],
    }).compile();

    chunker = module.get(TextChunkerService);
  });

  function createDocument(sections: string[]): ParsedDocument {
    let charOffset = 0;
    return {
      fullText: sections.join('\n\n'),
      sections: sections.map((text, i) => {
        const section = {
          text,
          location: {
            page: null,
            paragraph: i,
            heading: null,
            charOffset,
          },
        };
        charOffset += text.length + 2;
        return section;
      }),
      metadata: {
        totalPages: null,
        totalCharacters: sections.join('\n\n').length,
      },
    };
  }

  describe('chunk', () => {
    it('应将短文档分为单个分块', () => {
      const doc = createDocument(['这是一段简短的文本。']);

      const chunks = chunker.chunk(doc);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('这是一段简短的文本。');
      expect(chunks[0].tokenCount).toBeGreaterThan(0);
    });

    it('应将多个短段落合并为一个分块', () => {
      const doc = createDocument(['短段落一。', '短段落二。', '短段落三。']);

      const chunks = chunker.chunk(doc);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain('短段落一。');
      expect(chunks[0].content).toContain('短段落二。');
      expect(chunks[0].content).toContain('短段落三。');
    });

    it('应在超过 token 限制时拆分分块', () => {
      const longText = '这是一段需要被拆分的较长文本。'.repeat(100);
      const doc = createDocument([longText]);

      const chunks = chunker.chunk(doc, { maxTokens: 50, overlapTokens: 10 });

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('应保留物理位置信息', () => {
      const doc = createDocument(['第一段', '第二段']);

      const chunks = chunker.chunk(doc);

      expect(chunks[0].location).toBeDefined();
      expect(chunks[0].location.paragraph).toBeDefined();
      expect(chunks[0].location.charOffset).toBeDefined();
    });

    it('应处理空文档', () => {
      const doc: ParsedDocument = {
        fullText: '',
        sections: [],
        metadata: { totalPages: null, totalCharacters: 0 },
      };

      const chunks = chunker.chunk(doc);

      expect(chunks).toHaveLength(0);
    });

    it('应使用自定义分块选项', () => {
      const longText = '自定义选项测试文本内容。'.repeat(50);
      const doc = createDocument([longText]);

      const chunksSmall = chunker.chunk(doc, {
        maxTokens: 32,
        overlapTokens: 8,
      });
      const chunksLarge = chunker.chunk(doc, {
        maxTokens: 256,
        overlapTokens: 32,
      });

      expect(chunksSmall.length).toBeGreaterThan(chunksLarge.length);
    });

    it('应正确设置每个分块的 tokenCount', () => {
      const doc = createDocument(['这是测试分块 token 计数的文本。']);

      const chunks = chunker.chunk(doc);

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(typeof chunk.tokenCount).toBe('number');
      }
    });

    it('应为每个分块设置 charLength', () => {
      const doc = createDocument(['测试字符长度。']);

      const chunks = chunker.chunk(doc);

      for (const chunk of chunks) {
        expect(chunk.location.charLength).toBe(chunk.content.length);
      }
    });

    it('应确保 charOffset + charLength 不超过全文长度', () => {
      const longText = '这是一段需要被拆分的较长文本。'.repeat(100);
      const doc = createDocument([longText]);

      const chunks = chunker.chunk(doc, { maxTokens: 50, overlapTokens: 10 });

      for (const chunk of chunks) {
        expect(chunk.location.charOffset + chunk.location.charLength).toBeLessThanOrEqual(
          doc.fullText.length,
        );
        expect(chunk.location.charOffset).toBeGreaterThanOrEqual(0);
        expect(chunk.location.charLength).toBeGreaterThan(0);
      }
    });

    it('应确保所有分块的 tokenCount 不超过 maxTokens', () => {
      const longText = '这是一个用来测试token边界的句子。'.repeat(100);
      const doc = createDocument([longText]);
      const maxTokens = 50;

      const chunks = chunker.chunk(doc, { maxTokens, overlapTokens: 10 });

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens);
      }
    });

    it('多段落分块时 charOffset 应递增', () => {
      const sections = Array.from(
        { length: 10 },
        (_, i) => `第${i + 1}个段落需要足够长的文本来测试分块行为。`,
      );
      const doc = createDocument(sections);

      const chunks = chunker.chunk(doc, { maxTokens: 30, overlapTokens: 5 });

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].location.charOffset).toBeGreaterThanOrEqual(
          chunks[i - 1].location.charOffset,
        );
      }
    });

    it('含重叠时 charLength 应不包含重叠文本的长度', () => {
      const sections = Array.from(
        { length: 6 },
        (_, i) => `段落${i + 1}的内容有一定长度来确保分块产生重叠。`,
      );
      const doc = createDocument(sections);

      const chunks = chunker.chunk(doc, { maxTokens: 40, overlapTokens: 8 });

      if (chunks.length > 1) {
        for (const chunk of chunks) {
          expect(chunk.location.charLength).toBeLessThanOrEqual(chunk.content.length);
        }
      }
    });

    it('应能处理含有大段落的文档', () => {
      const sentences = Array.from(
        { length: 200 },
        (_, i) => `这是第${i + 1}个句子。`,
      );
      const longParagraph = sentences.join(' ');
      const doc = createDocument([longParagraph]);

      const chunks = chunker.chunk(doc, { maxTokens: 100, overlapTokens: 20 });

      expect(chunks.length).toBeGreaterThan(1);
      const allContent = chunks.map((c) => c.content).join('');
      expect(allContent.length).toBeGreaterThan(0);
    });
  });
});
