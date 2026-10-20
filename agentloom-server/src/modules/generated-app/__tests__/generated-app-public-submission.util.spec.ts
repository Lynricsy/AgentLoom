/**
 * 投影后的入参与工作流输入契约的一致性检查（Gate 3 合约测试复用执行期同一份实现）。
 * 表单本身的严格校验见 generated-app.runtime.spec.ts。
 */
import { describe, expect, it } from 'vitest';

import { validateSubmissionAgainstWorkflowInputSchema } from '../generated-app-public-submission.util';
import { workflowInputSchemaSchema } from '../../workflow/dto/workflow-input-schema.dto';

describe('validateSubmissionAgainstWorkflowInputSchema', () => {
  const schema = workflowInputSchemaSchema.parse({
    version: 2,
    fields: [
      { id: 'topic', type: 'text', label: '主题', required: true },
      {
        id: 'mode',
        type: 'single_select',
        label: '模式',
        required: false,
        options: ['fast', 'deep'],
        default: 'fast',
      },
    ],
  });

  it('把契约外的字段投影掉而不是报错', () => {
    const result = validateSubmissionAgainstWorkflowInputSchema({
      workflowInputSchema: schema,
      input: { topic: '选题', extraFormOnlyField: '仅表单收集' },
    });

    expect(result.errors).toEqual([]);
    expect(result.projectedInput).toEqual({ topic: '选题', mode: 'fast' });
  });

  it('契约必填缺失时报错', () => {
    const result = validateSubmissionAgainstWorkflowInputSchema({
      workflowInputSchema: schema,
      input: { extraFormOnlyField: 'x' },
    });

    expect(result.errors).toMatchObject([{ field: 'input.topic' }]);
  });

  it('契约选项不匹配时报错', () => {
    const result = validateSubmissionAgainstWorkflowInputSchema({
      workflowInputSchema: schema,
      input: { topic: '选题', mode: 'turbo' },
    });

    expect(result.errors).toMatchObject([{ field: 'input.mode' }]);
  });
});
