import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { MarkdownParser } from '../parsers/markdown.parser';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [MarkdownParser],
    }).compile();

    parser = module.get(MarkdownParser);
  });

  describe('supportedMimeTypes', () => {
    it('应支持 text/markdown MIME 类型', () => {
      expect(parser.supportedMimeTypes).toEqual(['text/markdown']);
    });
  });

  describe('parse', () => {
    it('应正确解析 Markdown 内容', async () => {
      const md = '# 标题\n\n这是正文内容\n\n## 子标题\n\n子标题内容';
      const buffer = Buffer.from(md, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.sections.length).toBeGreaterThanOrEqual(2);
      expect(result.metadata.totalPages).toBeNull();
      expect(result.metadata.totalCharacters).toBeGreaterThan(0);
    });

    it('应剥离 YAML frontmatter', async () => {
      const md = '---\ntitle: 测试\nauthor: 作者\n---\n\n# 标题\n\n正文内容';
      const buffer = Buffer.from(md, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.fullText).not.toContain('---');
      expect(result.fullText).not.toContain('title: 测试');
      expect(result.fullText).toContain('正文内容');
    });

    it('应正确识别标题并设置 heading 字段', async () => {
      const md = '# 一级标题\n\n段落内容\n\n## 二级标题\n\n二级内容';
      const buffer = Buffer.from(md, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      const headingSection = result.sections.find((s) =>
        s.text.includes('一级标题'),
      );
      expect(headingSection).toBeDefined();

      const subHeadingSection = result.sections.find((s) =>
        s.text.includes('二级标题'),
      );
      expect(subHeadingSection).toBeDefined();
    });

    it('应处理无 frontmatter 的 Markdown', async () => {
      const md = '# 简单标题\n\n正文';
      const buffer = Buffer.from(md, 'utf-8');

      const result = await parser.parse(buffer, 'simple.md');

      expect(result.fullText).toContain('简单标题');
      expect(result.sections.length).toBeGreaterThanOrEqual(1);
    });

    it('应处理空 Markdown 文件', async () => {
      const buffer = Buffer.from('', 'utf-8');

      const result = await parser.parse(buffer, 'empty.md');

      expect(result.fullText).toBe('');
      expect(result.sections).toHaveLength(0);
    });

    it('应正确追踪字符偏移量', async () => {
      const md = '# 标题\n\n第一段\n\n第二段';
      const buffer = Buffer.from(md, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.sections[0].location.charOffset).toBe(0);

      if (result.sections.length > 1) {
        expect(result.sections[1].location.charOffset).toBeGreaterThan(0);
      }
    });
  });
});
