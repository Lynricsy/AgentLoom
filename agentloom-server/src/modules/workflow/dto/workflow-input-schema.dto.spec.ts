import { describe, expect, it } from 'vitest';

import {
  workflowInputSchemaSchema,
  workflowInputSchemaWriteSchema,
} from './workflow-input-schema.dto';

describe('workflowInputSchemaWriteSchema（D-056）', () => {
  it.each([
    [
      '重复字段 id',
      {
        fields: [
          { id: 'a', type: 'text', label: 'A' },
          { id: 'a', type: 'number', label: 'A2' },
        ],
      },
      ['fields', 1, 'id'],
    ],
    [
      'minLength 大于 maxLength',
      {
        fields: [
          {
            id: 'a',
            type: 'text',
            label: 'A',
            validation: { minLength: 10, maxLength: 2 },
          },
        ],
      },
      ['fields', 0, 'validation', 'minLength'],
    ],
    [
      'min 大于 max',
      {
        fields: [
          {
            id: 'n',
            type: 'number',
            label: 'N',
            validation: { min: 5, max: 1 },
          },
        ],
      },
      ['fields', 0, 'validation', 'min'],
    ],
    [
      'single_select 无选项',
      { fields: [{ id: 's', type: 'single_select', label: 'S' }] },
      ['fields', 0, 'options'],
    ],
    [
      'multi_select 空选项',
      {
        fields: [{ id: 'm', type: 'multi_select', label: 'M', options: [] }],
      },
      ['fields', 0, 'options'],
    ],
    [
      'conversation 模式缺 conversationPlan',
      { collectionMode: 'conversation', fields: [] },
      ['conversationPlan'],
    ],
    [
      'hybrid 模式缺 conversationPlan',
      { collectionMode: 'hybrid', fields: [] },
      ['conversationPlan'],
    ],
  ])('拒绝%s', (_, input, path) => {
    const result = workflowInputSchemaWriteSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(
      path,
    );
    // 读取侧保持宽松，历史数据不会在运行/读取时报错
    expect(workflowInputSchemaSchema.safeParse(input).success).toBe(true);
  });

  it('接受一致的 schema', () => {
    const result = workflowInputSchemaWriteSchema.safeParse({
      collectionMode: 'hybrid',
      conversationPlan: { systemPrompt: '逐项追问', maxTurns: 3 },
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          validation: { minLength: 2, maxLength: 2 },
        },
        { id: 'mode', type: 'single_select', label: '模式', options: ['a'] },
        {
          id: 'count',
          type: 'number',
          label: '数量',
          validation: { min: 1, max: 1 },
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
