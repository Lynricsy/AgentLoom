import { describe, expect, it } from 'vitest';

import { buildConversationPromptBlocks } from './conversation-prompt-blocks';

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
