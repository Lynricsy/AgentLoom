import { describe, expect, it } from 'vitest';

import { parseAgentStructuredOutput } from '../agent-structured-output.util';

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
};

describe('parseAgentStructuredOutput', () => {
  it.each([
    ['整段 JSON', '{"answer":"42"}'],
    ['整段围栏', '```json\n{"answer":"42"}\n```'],
    // 干预「批准」时校验的是各轮拼接后的完整回复，前言与最终 JSON 之间没有分隔
    ['前言 + JSON（minimax）', 'Need the sidebar table chunk…{"answer":"42"}'],
    [
      '前言 + 围栏（Claude）',
      'I\'ll search the knowledge base first.```json\n{"answer":"42"}\n```',
    ],
    ['前言里带括号', '查找 {config} 与 [1] 中的条目…\n{"answer":"42"}'],
    ['前言本身也是 JSON', '{"answer":"草稿"}{"answer":"42"}'],
  ])('%s → 取回复末尾的 JSON', (_label, content) => {
    expect(parseAgentStructuredOutput(content, schema)).toEqual({
      answer: '42',
    });
  });

  it('JSON 之后还有文字时不提取，节点失败', () => {
    expect(() =>
      parseAgentStructuredOutput('{"answer":"42"} 以上就是答案', schema),
    ).toThrow('Agent 回复不是合法 JSON');
  });

  it('末尾 JSON 不符合 Schema 时报 Schema 错误', () => {
    expect(() =>
      parseAgentStructuredOutput('先检索一下。{"answer":42}', schema),
    ).toThrow('Agent 回复不符合输出 Schema');
  });

  it('已是结构化值时直接校验', () => {
    expect(parseAgentStructuredOutput({ answer: '42' }, schema)).toEqual({
      answer: '42',
    });
  });
});
