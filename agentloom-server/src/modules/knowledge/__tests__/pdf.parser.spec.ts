import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

const mocks = vi.hoisted(() => ({
  getText: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(function () {
    return {
      getText: mocks.getText,
      destroy: mocks.destroy,
    };
  }),
}));

import { PdfParser } from '../parsers/pdf.parser';
import { PDFParse } from 'pdf-parse';

describe('PdfParser', () => {
  let parser: PdfParser;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.destroy.mockResolvedValue(undefined);

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
      mocks.getText.mockResolvedValue({
        pages: [
          { num: 1, text: '第一段内容\n\n第二段内容' },
          { num: 2, text: '第三段内容' },
        ],
        text: '',
        total: 2,
      });

      const buffer = Buffer.from('fake-pdf');
      const result = await parser.parse(buffer, 'test.pdf');

      expect(PDFParse).toHaveBeenCalledWith({ data: buffer });
      expect(result.sections).toHaveLength(3);
      expect(result.metadata.totalPages).toBe(2);
      expect(result.fullText).toBe('第一段内容\n\n第二段内容\n\n第三段内容');
    });

    it('应为每个段落设置正确的页码', async () => {
      mocks.getText.mockResolvedValue({
        pages: [
          { num: 1, text: '页面一段落A\n\n页面一段落B' },
          { num: 2, text: '页面二段落C' },
        ],
        text: '',
        total: 2,
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.pdf');

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].location.page).toBe(1);
      expect(result.sections[0].location.paragraph).toBe(0);
      expect(result.sections[1].location.page).toBe(1);
      expect(result.sections[1].location.paragraph).toBe(1);
      expect(result.sections[2].location.page).toBe(2);
      expect(result.sections[2].location.paragraph).toBe(2);
    });

    it('应正确计算跨页的 charOffset', async () => {
      const page1Text = '段落A';
      const page2Text = '段落B';
      mocks.getText.mockResolvedValue({
        pages: [
          { num: 1, text: page1Text },
          { num: 2, text: page2Text },
        ],
        text: '',
        total: 2,
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.pdf');
      const { fullText } = result;

      expect(result.sections).toHaveLength(2);
      // 段落A offset = 0
      expect(result.sections[0].location.charOffset).toBe(0);
      // 段落B offset = '段落A'.length + '\n\n'.length
      expect(result.sections[1].location.charOffset).toBe(
        page1Text.length + 2,
      );
      // 验证 charOffset 能正确定位到 fullText 中的文本
      for (const section of result.sections) {
        expect(
          fullText.substring(
            section.location.charOffset,
            section.location.charOffset + section.text.length,
          ),
        ).toBe(section.text);
      }
    });

    it('应过滤空白段落', async () => {
      mocks.getText.mockResolvedValue({
        pages: [{ num: 1, text: '内容A\n\n\n\n\n\n内容B' }],
        text: '',
        total: 1,
      });

      const result = await parser.parse(Buffer.from('fake'), 'doc.pdf');

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].text).toBe('内容A');
      expect(result.sections[1].text).toBe('内容B');
    });

    it('应处理无内容的 PDF 文档', async () => {
      mocks.getText.mockResolvedValue({
        pages: [],
        text: '',
        total: 0,
      });

      const result = await parser.parse(Buffer.from('fake'), 'empty.pdf');

      expect(result.fullText).toBe('');
      expect(result.sections).toHaveLength(0);
      expect(result.metadata.totalPages).toBe(0);
      expect(result.metadata.totalCharacters).toBe(0);
    });

    it('应在解析失败时抛出 DocumentParseException', async () => {
      mocks.getText.mockRejectedValue(new Error('无效 PDF'));

      await expect(
        parser.parse(Buffer.from('bad'), 'bad.pdf'),
      ).rejects.toThrow();
    });

    it('应在解析完成后调用 destroy 释放资源', async () => {
      mocks.getText.mockResolvedValue({
        pages: [{ num: 1, text: '内容' }],
        text: '',
        total: 1,
      });

      await parser.parse(Buffer.from('fake'), 'test.pdf');

      expect(mocks.destroy).toHaveBeenCalled();
    });

    it('应在解析失败后仍调用 destroy', async () => {
      mocks.getText.mockRejectedValue(new Error('失败'));

      try {
        await parser.parse(Buffer.from('bad'), 'bad.pdf');
      } catch {
        // expected
      }

      expect(mocks.destroy).toHaveBeenCalled();
    });
  });
});
