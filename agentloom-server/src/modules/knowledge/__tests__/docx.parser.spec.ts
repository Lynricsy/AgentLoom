import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

const mocks = vi.hoisted(() => ({
  extractRawText: vi.fn(),
}));

vi.mock('mammoth', () => ({
  default: { extractRawText: mocks.extractRawText },
  extractRawText: mocks.extractRawText,
}));

import { DocxParser } from '../parsers/docx.parser';

describe('DocxParser', () => {
  let parser: DocxParser;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [DocxParser],
    }).compile();

    parser = module.get(DocxParser);
  });

  describe('supportedMimeTypes', () => {
    it('应支持 docx MIME 类型', () => {
      expect(parser.supportedMimeTypes).toEqual([
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]);
    });
  });

  describe('parse', () => {
    it('应正确解析 DOCX 缓冲区并返回 ParsedDocument', async () => {
      const fullText = '第一段\n\n第二段\n\n第三段';
      mocks.extractRawText.mockResolvedValue({ value: fullText });

      const buffer = Buffer.from('fake-docx');
      const result = await parser.parse(buffer, 'test.docx');

      expect(mocks.extractRawText).toHaveBeenCalledWith({ buffer });
      expect(result.fullText).toBe(fullText);
      expect(result.sections).toHaveLength(3);
      expect(result.metadata.totalPages).toBeNull();
      expect(result.metadata.totalCharacters).toBe(fullText.length);
    });

    it('应正确设置段落物理位置，page 为 null', async () => {
      const fullText = '段落1\n\n段落2';
      mocks.extractRawText.mockResolvedValue({ value: fullText });

      const result = await parser.parse(Buffer.from('fake'), 'doc.docx');

      expect(result.sections[0].location.page).toBeNull();
      expect(result.sections[0].location.paragraph).toBe(0);
      expect(result.sections[0].location.heading).toBeNull();
      expect(result.sections[1].location.paragraph).toBe(1);
    });

    it('应过滤空白段落', async () => {
      mocks.extractRawText.mockResolvedValue({
        value: '内容\n\n   \n\n更多内容',
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.docx');

      expect(result.sections).toHaveLength(2);
    });

    it('应处理空文档', async () => {
      mocks.extractRawText.mockResolvedValue({ value: '' });

      const result = await parser.parse(Buffer.from('fake'), 'empty.docx');

      expect(result.fullText).toBe('');
      expect(result.sections).toHaveLength(0);
      expect(result.metadata.totalCharacters).toBe(0);
    });
  });
});
