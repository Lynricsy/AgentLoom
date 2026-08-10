import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '../agent/types/content-block.types';

import {
  buildConversationPromptBlocks,
  formatLatestPendingMessages,
} from './conversation-prompt-blocks';

function readTextBlock(blocks: ContentBlock[], index: number): string {
  const block = blocks[index];
  if (!block || block.type !== 'text') {
    throw new Error(`Expected text block at index ${index}`);
  }
  return block.text;
}

describe('buildConversationPromptBlocks', () => {
  it('应把同一条消息中的多个附件都转换为 prompt blocks', () => {
    const blocks = buildConversationPromptBlocks({
      pendingMessages: [
        {
          id: 'message-1',
          content: '请一起分析这两个附件',
          contentType: 'text',
          metadata: {
            contentType: 'text',
            attachments: [
              {
                kind: 'image',
                fileName: 'design.png',
                mimeType: 'image/png',
                sizeBytes: 32,
                dataBase64: 'cG5n',
              },
              {
                kind: 'file',
                fileName: 'notes.txt',
                mimeType: 'text/plain',
                sizeBytes: 24,
                textContent: 'ATTACH-QA-20260406',
              },
            ],
          },
          createdAt: new Date('2026-04-06T00:00:00.000Z'),
        },
      ],
      hasPriorTurns: false,
    });

    expect(blocks).toEqual([
      { type: 'text', text: '请一起分析这两个附件' },
      {
        type: 'image',
        data: 'cG5n',
        mimeType: 'image/png',
      },
      {
        type: 'resource',
        uri: 'attachment://notes.txt',
        text: 'ATTACH-QA-20260406',
        mimeType: 'text/plain',
      },
    ]);
  });

  it('多附件缺少正文时应生成聚合摘要并保留每个 sandboxPath 提示', () => {
    const blocks = buildConversationPromptBlocks({
      pendingMessages: [
        {
          id: 'message-2',
          content: '已上传 2 个附件',
          contentType: 'text',
          metadata: {
            contentType: 'text',
            attachments: [
              {
                kind: 'image',
                fileName: 'design.png',
                mimeType: 'image/png',
                sizeBytes: 32,
                dataBase64: 'cG5n',
                sandboxPath: '/workspace/uploads/design.png',
              },
              {
                kind: 'file',
                fileName: 'notes.txt',
                mimeType: 'text/plain',
                sizeBytes: 24,
                textContent: 'ATTACH-QA-20260406',
                sandboxPath: '/workspace/uploads/notes.txt',
              },
            ],
          },
          createdAt: new Date('2026-04-06T00:00:00.000Z'),
        },
      ],
      hasPriorTurns: false,
      latestPromptOverride: '',
    });

    expect(blocks).toEqual([
      { type: 'text', text: '已上传 2 个附件' },
      {
        type: 'text',
        text: '该附件已写入工作区：/workspace/uploads/design.png。如需查看原文件，请直接读取该路径。',
      },
      {
        type: 'image',
        data: 'cG5n',
        mimeType: 'image/png',
      },
      {
        type: 'text',
        text: '该附件已写入工作区：/workspace/uploads/notes.txt。如需查看原文件，请直接读取该路径。',
      },
      {
        type: 'resource',
        uri: 'file:///workspace/uploads/notes.txt',
        text: 'ATTACH-QA-20260406',
        mimeType: 'text/plain',
      },
    ]);
  });
});

describe('conversation prompt variants', () => {
  const createdAt = new Date('2026-04-06T00:00:00.000Z');

  it('应编号聚合多条纯文本消息，并忽略首尾空白', () => {
    const pendingMessages = [
      {
        id: 'message-1',
        content: '  第一条  ',
        contentType: 'text',
        metadata: {},
        createdAt,
      },
      {
        id: 'message-2',
        content: '第二条',
        contentType: 'text',
        metadata: {},
        createdAt,
      },
    ];

    expect(formatLatestPendingMessages(pendingMessages)).toBe(
      '1. 第一条\n2. 第二条',
    );
    expect(
      buildConversationPromptBlocks({
        pendingMessages,
        hasPriorTurns: true,
      }),
    ).toEqual([{ type: 'text', text: '1. 第一条\n2. 第二条' }]);
  });

  it('最新提示覆盖为空且消息无附件时仍逐条保留用户输入', () => {
    const blocks = buildConversationPromptBlocks({
      pendingMessages: [
        {
          id: 'message-1',
          content: '第一条',
          contentType: 'text',
          metadata: {},
          createdAt,
        },
        {
          id: 'message-2',
          content: '第二条',
          contentType: 'text',
          metadata: {},
          createdAt,
        },
      ],
      hasPriorTurns: false,
      latestPromptOverride: '   ',
    });

    expect(blocks).toEqual([
      { type: 'text', text: '用户消息 1：第一条' },
      { type: 'text', text: '用户消息 2：第二条' },
    ]);
  });

  it('应为有效内联附件选择 block，并忽略缺少内容的链接项', () => {
    const blocks = buildConversationPromptBlocks({
      pendingMessages: [
        {
          id: 'message-1',
          content: '',
          contentType: 'text',
          metadata: {
            attachments: [
              {
                kind: 'file',
                fileName: '带 空格.txt',
                mimeType: 'text/plain',
                sizeBytes: 2,
                textContent: 'ok',
              },
              {
                kind: 'file',
                fileName: 'raw.bin',
                mimeType: 'application/octet-stream',
                sizeBytes: 2,
                dataBase64: 'AAE=',
              },
              {
                kind: 'file',
                fileName: 'remote.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 20,
              },
            ],
          },
          createdAt,
        },
      ],
      hasPriorTurns: false,
    });

    expect(blocks).toEqual([
      { type: 'text', text: '已上传 2 个附件' },
      {
        type: 'resource',
        uri: 'attachment://%E5%B8%A6%20%E7%A9%BA%E6%A0%BC.txt',
        text: 'ok',
        mimeType: 'text/plain',
      },
      {
        type: 'resource',
        uri: 'attachment://raw.bin',
        blob: 'AAE=',
        mimeType: 'application/octet-stream',
      },
    ]);
    expect(blocks).not.toContainEqual(
      expect.objectContaining({
        type: 'resource_link',
        uri: 'attachment://remote.pdf',
      }),
    );
  });

  it('应格式化各种历史角色、附件、空轮次与工具调用', () => {
    const blocks = buildConversationPromptBlocks({
      pendingMessages: [
        {
          id: 'latest',
          content: '只执行新请求',
          contentType: 'text',
          metadata: {},
          createdAt,
        },
      ],
      hasPriorTurns: true,
      historyMessages: [
        {
          id: 'h1',
          role: 'user',
          content: '上传资料',
          contentType: 'text',
          metadata: {
            attachments: [
              {
                kind: 'image',
                fileName: 'old.png',
                mimeType: 'image/png',
                sizeBytes: 4,
              },
            ],
          },
          createdAt,
          toolCalls: null,
        },
        {
          id: 'h2',
          role: 'assistant',
          content: '',
          contentType: 'text',
          metadata: { emptyTurn: true },
          toolCalls: [
            { tool: 'read_file', status: 'completed' },
            { tool: '', status: 'ignored' },
          ],
          createdAt,
        },
        {
          id: 'h3',
          role: 'tool',
          content: '',
          contentType: 'text',
          metadata: {},
          toolCalls: [{ name: 'search' }, {}],
          createdAt,
        },
        {
          id: 'h4',
          role: 'system',
          content: '',
          contentType: 'text',
          metadata: {},
          createdAt,
          toolCalls: null,
        },
      ],
      conversationMetadata: {
        restart: { inheritedHistory: true },
      },
    });

    const history = readTextBlock(blocks, 0);
    expect(history).toContain('旧会话的继承副本');
    expect(history).toContain('1. 用户: 上传资料');
    expect(history).not.toContain('已上传图片 old.png');
    expect(history).toContain('2. 助手: （该轮未返回可展示文本）');
    expect(history).toContain('工具调用: read_file (completed)');
    expect(history).toContain('3. 工具: （该轮主要执行了工具调用）');
    expect(history).toContain('工具调用: search, unknown_tool');
    expect(history).toContain('4. 系统: （空消息）');
    expect(blocks.at(-1)).toEqual({ type: 'text', text: '只执行新请求' });
  });

  it('应识别旧版 restart metadata，并对普通历史使用连续上下文提示', () => {
    const base = {
      pendingMessages: [
        {
          id: 'latest',
          content: '新的要求',
          contentType: 'text',
          metadata: {},
          createdAt,
        },
      ],
      hasPriorTurns: true,
      historyMessages: [
        {
          id: 'history',
          role: 'assistant' as const,
          content: '旧回答',
          contentType: 'text',
          metadata: {},
          createdAt,
          toolCalls: null,
        },
      ],
    };

    const inherited = buildConversationPromptBlocks({
      ...base,
      conversationMetadata: {
        inheritedMessageHistory: true,
        restartFromConversationId: 'old-conversation',
      },
    });
    const ordinary = buildConversationPromptBlocks({
      ...base,
      conversationMetadata: {
        inheritedMessageHistory: true,
        restartFromConversationId: '',
      },
    });

    expect(readTextBlock(inherited, 0)).toContain('旧会话的继承副本');
    expect(readTextBlock(ordinary, 0)).toContain(
      '已有的历史，请保持上下文连续',
    );
  });
});
