import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

const mocks = vi.hoisted(() => ({
  pdfParse: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  default: mocks.pdfParse,
}));

import { PdfParser } from '../parsers/pdf.parser';

describe('PdfParser', () => {
  let parser: PdfParser;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [PdfParser],
    }).compile();

    parser = module.get(PdfParser);
  });

  describe('supportedMimeTypes', () => {
    it('应支持 application/pdf MIME 类型', () => {
      expect(parser.supportedMimeTypes).toEqual(['application/pdf']);
    });
  });

  describe('parse', () => {
    it('应正确解析 PDF 缓冲区并返回 ParsedDocument', async () => {
      const fullText = '第一段内容\n\n第二段内容\n\n第三段内容';
      mocks.pdfParse.mockResolvedValue({
        text: fullText,
        numpages: 3,
      });

      const buffer = Buffer.from('fake-pdf');
      const result = await parser.parse(buffer, 'test.pdf');

      expect(mocks.pdfParse).toHaveBeenCalledWith(buffer);
      expect(result.fullText).toBe(fullText);
      expect(result.sections).toHaveLength(3);
      expect(result.metadata.totalPages).toBe(3);
      expect(result.metadata.totalCharacters).toBe(fullText.length);
    });

    it('应正确设置每个段落的物理位置信息', async () => {
      const fullText = '段落A\n\n段落B';
      mocks.pdfParse.mockResolvedValue({
        text: fullText,
        numpages: 1,
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.pdf');

      expect(result.sections[0].location).toEqual({
        page: null,
        paragraph: 0,
        heading: null,
        charOffset: 0,
      });
      expect(result.sections[1].location).toEqual({
        page: null,
        paragraph: 1,
        heading: null,
        charOffset: expect.any(Number),
      });
    });

    it('应过滤空白段落', async () => {
      const fullText = '内容A\n\n\n\n\n\n内容B';
      mocks.pdfParse.mockResolvedValue({
        text: fullText,
        numpages: 1,
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.pdf');

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].text).toBe('内容A');
      expect(result.sections[1].text).toBe('内容B');
    });

    it('应处理无内容的 PDF 文档', async () => {
      mocks.pdfParse.mockResolvedValue({
        text: '',
        numpages: 0,
      });

      const result = await parser.parse(Buffer.from('fake'), 'empty.pdf');

      expect(result.fullText).toBe('');
      expect(result.sections).toHaveLength(0);
      expect(result.metadata.totalPages).toBe(0);
      expect(result.metadata.totalCharacters).toBe(0);
    });

    it('应在 pdf-parse 抛出错误时抛出异常', async () => {
      mocks.pdfParse.mockRejectedValue(new Error('无效 PDF'));

      await expect(
        parser.parse(Buffer.from('bad'), 'bad.pdf'),
      ).rejects.toThrow();
    });
  });
});
