import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { DocumentParserService } from '../parsers/document-parser.service';
import { PdfParser } from '../parsers/pdf.parser';
import { DocxParser } from '../parsers/docx.parser';
import { MarkdownParser } from '../parsers/markdown.parser';
import { TextParser } from '../parsers/text.parser';
import { UnsupportedFileTypeException } from '../knowledge.exceptions';
import type { ParsedDocument } from '../interfaces/document-parser.interface';

describe('DocumentParserService', () => {
  let service: DocumentParserService;
  let pdfParser: PdfParser;
  let docxParser: DocxParser;
  let markdownParser: MarkdownParser;
  let textParser: TextParser;

  const mockParsedDocument: ParsedDocument = {
    fullText: '测试内容',
    sections: [
      {
        text: '测试内容',
        location: { page: null, paragraph: 0, heading: null, charOffset: 0 },
      },
    ],
    metadata: { totalPages: null, totalCharacters: 4 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        DocumentParserService,
        {
          provide: PdfParser,
          useValue: {
            supportedMimeTypes: ['application/pdf'],
            parse: vi.fn().mockResolvedValue(mockParsedDocument),
          },
        },
        {
          provide: DocxParser,
          useValue: {
            supportedMimeTypes: [
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ],
            parse: vi.fn().mockResolvedValue(mockParsedDocument),
          },
        },
        {
          provide: MarkdownParser,
          useValue: {
            supportedMimeTypes: ['text/markdown'],
            parse: vi.fn().mockResolvedValue(mockParsedDocument),
          },
        },
        {
          provide: TextParser,
          useValue: {
            supportedMimeTypes: ['text/plain'],
            parse: vi.fn().mockResolvedValue(mockParsedDocument),
          },
        },
      ],
    }).compile();

    service = module.get(DocumentParserService);
    pdfParser = module.get(PdfParser);
    docxParser = module.get(DocxParser);
    markdownParser = module.get(MarkdownParser);
    textParser = module.get(TextParser);
  });

  describe('parse', () => {
    it('应将 PDF 文件路由到 PdfParser', async () => {
      const buffer = Buffer.from('pdf-data');

      const result = await service.parse(buffer, 'application/pdf', 'test.pdf');

      expect(pdfParser.parse).toHaveBeenCalledWith(buffer, 'test.pdf');
      expect(result).toEqual(mockParsedDocument);
    });

    it('应将 DOCX 文件路由到 DocxParser', async () => {
      const buffer = Buffer.from('docx-data');
      const mimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const result = await service.parse(buffer, mimeType, 'test.docx');

      expect(docxParser.parse).toHaveBeenCalledWith(buffer, 'test.docx');
      expect(result).toEqual(mockParsedDocument);
    });

    it('应将 Markdown 文件路由到 MarkdownParser', async () => {
      const buffer = Buffer.from('# Markdown');

      const result = await service.parse(buffer, 'text/markdown', 'test.md');

      expect(markdownParser.parse).toHaveBeenCalledWith(buffer, 'test.md');
      expect(result).toEqual(mockParsedDocument);
    });

    it('应将纯文本文件路由到 TextParser', async () => {
      const buffer = Buffer.from('plain text');

      const result = await service.parse(buffer, 'text/plain', 'test.txt');

      expect(textParser.parse).toHaveBeenCalledWith(buffer, 'test.txt');
      expect(result).toEqual(mockParsedDocument);
    });

    it('应对不支持的 MIME 类型抛出 UnsupportedFileTypeException', async () => {
      const buffer = Buffer.from('data');

      await expect(
        service.parse(buffer, 'application/octet-stream', 'unknown.bin'),
      ).rejects.toThrow(UnsupportedFileTypeException);
    });
  });
});
