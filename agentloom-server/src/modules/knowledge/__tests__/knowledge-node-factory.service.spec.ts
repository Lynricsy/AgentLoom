import { describe, expect, it } from 'vitest';

import type { KnowledgeChunkingStrategy } from '../knowledge-base-config';
import type { ParsedDocument } from '../interfaces/document-parser.interface';
import { KnowledgeNodeFactoryService } from '../services/knowledge-node-factory.service';

const SOURCE_DOCUMENT = {
  id: 'doc-1',
  knowledgeBaseId: 'kb-1',
  fileName: 'readme.md',
  mimeType: 'text/markdown',
};

// 缩写（Ing. / Dr. / etc.）出现在 URL、邮箱内部时，llamaindex 句子分词器会留下 {{ABBREV_n}} 占位符
const TEXT = [
  'Production lives at https://agentloom.ling.plus/ and is public.',
  'Docs are at https://agentloom.ling.plus/documentation/?tab=guide! Read them.',
  'Mail support@ling.plus or ask Dr. Smith for help, etc. are fine.',
  'See www.dr.example.com/etc.html for more.',
].join(' ');

function parsedDocument(text: string): ParsedDocument {
  return {
    sections: [
      {
        text,
        location: { paragraph: 0, charOffset: 0 },
      },
    ],
  } as unknown as ParsedDocument;
}

const STRATEGIES: KnowledgeChunkingStrategy[] = [
  { type: 'sentence', chunkSize: 96, chunkOverlap: 0 },
  { type: 'sentence_window', windowSize: 1 },
] as KnowledgeChunkingStrategy[];

describe('KnowledgeNodeFactoryService', () => {
  const factory = new KnowledgeNodeFactoryService();

  it.each(STRATEGIES)(
    '$type 切块不会把 URL / 邮箱里的缩写写成占位符',
    (strategy) => {
      const nodes = factory.createNodes(
        SOURCE_DOCUMENT,
        parsedDocument(TEXT),
        strategy,
      );

      expect(nodes.length).toBeGreaterThan(1);
      const joined = nodes.map((node) => node.text).join('\n');
      expect(joined).not.toMatch(/\{\{[A-Z]+_\d+\}\}/);
      expect(joined).toContain('https://agentloom.ling.plus/');
      expect(joined).toContain('https://agentloom.ling.plus/documentation/');
      expect(joined).toContain('support@ling.plus');
      expect(joined).toContain('www.dr.example.com/etc.html');

      for (const node of nodes) {
        // 切块文本必须是原文的连续片段，偏移量才能回指原文
        const offset = node.metadata.absoluteCharOffset as number;
        expect(typeof offset).toBe('number');
        expect(TEXT.slice(offset, offset + node.text.length)).toBe(node.text);
        for (const value of Object.values(node.metadata)) {
          if (typeof value === 'string') {
            expect(value).not.toMatch(/\{\{[A-Z]+_\d+\}\}/);
          }
        }
      }
    },
  );

  it('原文里字面出现的占位符样式文本保持原样', () => {
    const text =
      'Template {{ABBREV_0}} stays as is. Second https://agentloom.ling.plus/ ends.';
    const nodes = factory.createNodes(SOURCE_DOCUMENT, parsedDocument(text), {
      type: 'sentence_window',
      windowSize: 1,
    } as KnowledgeChunkingStrategy);

    const joined = nodes.map((node) => node.text).join(' ');
    expect(joined).toContain('Template {{ABBREV_0}} stays as is.');
    expect(joined).toContain('https://agentloom.ling.plus/');
  });
});
