import { describe, expect, it } from 'vitest';

import { buildAgentPromptContentBlocks } from '../agent-prompt-content.builder';

describe('buildAgentPromptContentBlocks', () => {
  it('text-in 应作为主提示文本，并忽略 sandbox-in 等运行时句柄', () => {
    const blocks = buildAgentPromptContentBlocks({
      input: {
        'text-in': '请总结这个主题',
        'sandbox-in': { status: 'creating', sessionId: 'sandbox-001' },
      },
    });

    expect(blocks).toEqual([
      {
        type: 'text',
        text: '请总结这个主题',
      },
    ]);
  });

  it('context-in 为 memory session 引用时不应进入文本摘要', () => {
    const blocks = buildAgentPromptContentBlocks({
      input: {
        'text-in': '继续处理上一步',
        'context-in': {
          sessionId: 'memory-session-001',
          instanceId: 'memory-instance-001',
          role: 'primary',
          status: 'active',
        },
      },
    });

    expect(blocks).toEqual([
      {
        type: 'text',
        text: '继续处理上一步',
      },
    ]);
  });

  it('exec-in 作为控制流句柄时不应进入文本摘要', () => {
    const blocks = buildAgentPromptContentBlocks({
      input: {
        'exec-in': { triggered: true },
        'text-in': '继续执行',
      },
    });

    expect(blocks).toEqual([
      {
        type: 'text',
        text: '继续执行',
      },
    ]);
  });

  it('应保��多模态 block，并把其在文本摘要中转成占位符', () => {
    const blocks = buildAgentPromptContentBlocks({
      input: {
        prompt: 'hello',
        multimodal: {
          type: 'image',
          mimeType: 'image/png',
          data: 'base64-image',
        },
      },
    });

    expect(blocks[0]).toEqual({
      type: 'text',
      text: '{"prompt":"hello","multimodal":"[image:image/png]"}',
    });
    expect(blocks[1]).toEqual({
      type: 'image',
      mimeType: 'image/png',
      data: 'base64-image',
    });
  });

  it('带 subAgentResults 时应追加到文本摘要', () => {
    const blocks = buildAgentPromptContentBlocks({
      input: { prompt: 'hello' },
      subAgentResults: {
        writer: { content: 'child-output' },
      },
    });

    expect(blocks).toEqual([
      {
        type: 'text',
        text: '{"input":{"prompt":"hello"},"subAgents":{"writer":{"content":"child-output"}}}',
      },
    ]);
  });
});
