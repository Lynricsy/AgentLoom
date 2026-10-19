import { Injectable } from '@nestjs/common';
import {
  Document,
  MarkdownNodeParser,
  SentenceSplitter,
  SentenceWindowNodeParser,
  TextNode,
} from 'llamaindex';

import type { KnowledgeChunkingStrategy } from '../knowledge-base-config';
import type { ParsedDocument } from '../interfaces/document-parser.interface';

interface KnowledgeSourceDocument {
  id: string;
  knowledgeBaseId: string;
  fileName: string;
  mimeType: string;
}

/**
 * llamaindex 句子分词器（@llamaindex/core node-parser 的 SentenceTokenizer）的占位符缺陷：
 * 先把缩写（`Ing.`、`Dr.`、`etc.` 等，大小写不敏感且不看词边界）换成 `{{ABBREV_n}}`，
 * 再把 URI 整体换成 `{{URI_n}}`，还原时按插入顺序只替换一遍——URI 内部的缩写占位符永远
 * 留在结果里（`agentloom.l{{ABBREV_0}}plus`）；原文里字面出现的 `{{ABBREV_0}}` 也会被
 * 误还原成缩写。0.6.23 仍未修复。
 *
 * 规避方式：交给分词器的是等长的「遮蔽文本」——URI/邮箱内的句子分隔符换成 `_`
 * （所有内置缩写都以 `.` 结尾，遮蔽后 URI 内不再命中缩写，且仍不会被断句），
 * 花括号换成圆括号（不再与占位符撞车）。分词结果是遮蔽文本的连续片段，按同一偏移
 * 从原文切回即得到原样文本。
 *
 * 分词器遇到 `.` 就断句、不要求其后有空白，`Node.js`、`package.json`、`10.34.6` 会被拆开，
 * 窗口再用空格拼回就成了 `Node. js`。紧跟字母/数字的 `.` 不是句末，同样遮蔽成 `_`。
 */
const URI_PATTERN =
  /(https?:\/\/\S+|www\.\S+|ftp:\/\/\S+|(mailto:)?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|file:\/\/\S+)/gi;

const INTRA_WORD_DOT_PATTERN = /\.(?=[A-Za-z0-9_])/g;

function splitPreservingSource(
  text: string,
  split: (maskedText: string) => string[],
): string[] {
  const masked = text
    .replace(URI_PATTERN, (uri) => uri.replace(/[.?!…]/g, '_'))
    .replace(INTRA_WORD_DOT_PATTERN, '_')
    .replace(/[{}]/g, (brace) => (brace === '{' ? '(' : ')'));
  if (masked === text) {
    return split(text);
  }

  let cursor = 0;
  return split(masked).map((piece) => {
    const start = masked.indexOf(piece, cursor);
    if (start < 0) {
      throw new Error('句子切分结果不是原文的连续片段，无法还原遮蔽文本');
    }
    cursor = start;
    return text.slice(start, start + piece.length);
  });
}

class SourcePreservingSentenceSplitter extends SentenceSplitter {
  override _splitText(text: string, chunkSize: number): string[] {
    return splitPreservingSource(text, (masked) =>
      super._splitText(masked, chunkSize),
    );
  }
}

class SourcePreservingSentenceWindowNodeParser extends SentenceWindowNodeParser {
  constructor(
    params: ConstructorParameters<typeof SentenceWindowNodeParser>[0],
  ) {
    super(params);
    const tokenize = this.sentenceSplitter;
    this.sentenceSplitter = (text) => splitPreservingSource(text, tokenize);
  }
}

@Injectable()
export class KnowledgeNodeFactoryService {
  createNodes(
    sourceDocument: KnowledgeSourceDocument,
    parsedDocument: ParsedDocument,
    strategy: KnowledgeChunkingStrategy,
  ): TextNode[] {
    const sourceSections = parsedDocument.sections
      .map((section, index) => {
        const metadata = this.compactMetadata({
          documentId: sourceDocument.id,
          knowledgeBaseId: sourceDocument.knowledgeBaseId,
          fileName: sourceDocument.fileName,
          mimeType: sourceDocument.mimeType,
          sourceSectionIndex: index,
          page: section.location.page ?? undefined,
          paragraph: section.location.paragraph,
          heading: section.location.heading ?? undefined,
          sourceCharOffset: section.location.charOffset,
          sourceCharLength: section.text.length,
        });

        return new Document({
          id_: `${sourceDocument.id}:section:${index}`,
          text: section.text,
          metadata,
        });
      })
      .filter((section) => section.text.trim().length > 0);

    const parser = this.createParser(strategy);
    const nodes = parser.getNodesFromDocuments(sourceSections);

    return nodes.map((node) => this.decorateNode(node));
  }

  private createParser(strategy: KnowledgeChunkingStrategy) {
    switch (strategy.type) {
      case 'sentence':
        return new SourcePreservingSentenceSplitter({
          chunkSize: strategy.chunkSize,
          chunkOverlap: strategy.chunkOverlap,
        });
      case 'sentence_window':
        return new SourcePreservingSentenceWindowNodeParser({
          windowSize: strategy.windowSize,
        });
      case 'markdown':
        return new MarkdownNodeParser();
    }
  }

  private decorateNode(node: TextNode): TextNode {
    const metadata = this.compactMetadata({
      ...node.metadata,
      absoluteCharOffset: this.resolveAbsoluteCharOffset(node),
      absoluteCharLength: this.resolveAbsoluteCharLength(node),
    });

    return new TextNode({
      ...node.toJSON(),
      metadata,
    });
  }

  private resolveAbsoluteCharOffset(node: TextNode): number | undefined {
    const sourceCharOffset = this.readNumericMetadata(node, 'sourceCharOffset');
    if (sourceCharOffset === undefined) {
      return undefined;
    }

    return sourceCharOffset + (node.startCharIdx ?? 0);
  }

  private resolveAbsoluteCharLength(node: TextNode): number | undefined {
    if (
      typeof node.startCharIdx === 'number' &&
      typeof node.endCharIdx === 'number'
    ) {
      return node.endCharIdx - node.startCharIdx;
    }

    const sourceCharLength = this.readNumericMetadata(node, 'sourceCharLength');
    if (sourceCharLength === undefined) {
      return undefined;
    }

    return sourceCharLength;
  }

  private readNumericMetadata(node: TextNode, key: string): number | undefined {
    const value = node.metadata[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private compactMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }
}
