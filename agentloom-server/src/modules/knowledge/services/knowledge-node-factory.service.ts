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
        return new SentenceSplitter({
          chunkSize: strategy.chunkSize,
          chunkOverlap: strategy.chunkOverlap,
        });
      case 'sentence_window':
        return new SentenceWindowNodeParser({
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
