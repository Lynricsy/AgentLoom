/**
 * 公开提交入参校验规格：覆盖六种运行时字段类型与全局上限。
 * 运行时表单的 medical 预设只用到 text/textarea/multi_select/range，
 * number 与 single_select 由本文件直接构造表单契约覆盖。
 */
import { describe, expect, it } from 'vitest';

import type {
  PublicGeneratedAppRuntimeFieldDto,
  PublicGeneratedAppRuntimeFormDto,
} from '../dto';
import {
  MAX_SUBMISSION_PAYLOAD_BYTES,
  MAX_SUBMISSION_STRING_LENGTH,
  validatePublicSubmissionInput,
  validateSubmissionAgainstWorkflowInputSchema,
} from '../generated-app-public-submission.util';
import { workflowInputSchemaSchema } from '../../workflow/dto/workflow-input-schema.dto';

function makeField(
  overrides: Partial<PublicGeneratedAppRuntimeFieldDto> &
    Pick<PublicGeneratedAppRuntimeFieldDto, 'id' | 'type'>,
): PublicGeneratedAppRuntimeFieldDto {
  return {
    label: overrides.id,
    required: false,
    placeholder: '',
    helpText: '',
    options: [],
    ...overrides,
  };
}

function makeForm(
  fields: PublicGeneratedAppRuntimeFieldDto[],
): PublicGeneratedAppRuntimeFormDto {
  return {
    formId: 'form',
    title: 'form',
    description: '',
    submitLabel: '提交',
    sections: [],
    fields,
    resultView: {
      title: '',
      description: '',
      emptyState: '',
      successTitle: '',
      nextStepHint: '',
    },
  };
}

function validate(
  fields: PublicGeneratedAppRuntimeFieldDto[],
  input: unknown,
  clientContext?: Record<string, unknown>,
) {
  return validatePublicSubmissionInput({
    runtimeForm: makeForm(fields),
    input,
    clientContext,
  });
}

describe('validatePublicSubmissionInput', () => {
  it('空表单下空提交通过并返回空对象', () => {
    const result = validate([], {});

    expect(result).toEqual({ ok: true, input: {} });
  });

  it('拒绝非对象的 input', () => {
    expect(validate([], ['a'])).toEqual({
      ok: false,
      errors: [{ field: 'input', message: '提交内容必须是对象' }],
    });
  });

  it('拒绝运行时表单未声明的字段', () => {
    const result = validate([makeField({ id: 'known', type: 'text' })], {
      unknown: 'x',
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errors: [{ field: 'input.unknown' }],
    });
  });

  it('拒绝原型污染键', () => {
    const result = validate([], { ['__proto__']: { polluted: true } });

    expect(result.ok).toBe(false);
  });

  describe('text / textarea', () => {
    const fields = [
      makeField({ id: 'title', type: 'text', required: true }),
      makeField({ id: 'notes', type: 'textarea' }),
    ];

    it('trim 后写回，可选字段允许空串', () => {
      const result = validate(fields, { title: '  标题  ', notes: '   ' });

      expect(result).toEqual({ ok: true, input: { title: '标题', notes: '' } });
    });

    it('必填字段只有空白字符时报错', () => {
      expect(validate(fields, { title: '   ' }).ok).toBe(false);
    });

    it('缺失必填字段时报错', () => {
      expect(validate(fields, {}).ok).toBe(false);
    });

    it('非字符串报错', () => {
      expect(validate(fields, { title: 42 }).ok).toBe(false);
    });

    it('超过单字段字符上限报错', () => {
      const result = validate(fields, {
        title: 'a'.repeat(MAX_SUBMISSION_STRING_LENGTH + 1),
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('number / range', () => {
    const fields = [
      makeField({ id: 'count', type: 'number', min: 0, max: 100 }),
      makeField({
        id: 'level',
        type: 'range',
        required: true,
        min: 1,
        max: 10,
        step: 1,
      }),
    ];

    it('字符串数字被归一为 number', () => {
      const result = validate(fields, { count: ' 12 ', level: '3' });

      expect(result).toEqual({ ok: true, input: { count: 12, level: 3 } });
    });

    it('必填 range 收到空串按缺失处理', () => {
      expect(validate(fields, { level: '' }).ok).toBe(false);
    });

    it('非数字文本报错', () => {
      expect(validate(fields, { level: 'high' }).ok).toBe(false);
    });

    it('越界报错', () => {
      expect(validate(fields, { level: 0 }).ok).toBe(false);
      expect(validate(fields, { level: 11 }).ok).toBe(false);
      expect(validate(fields, { level: 5, count: 101 }).ok).toBe(false);
    });

    it('非步长整数倍报错', () => {
      expect(validate(fields, { level: 4.5 }).ok).toBe(false);
    });
  });

  describe('single_select', () => {
    const fields = [
      makeField({
        id: 'priority',
        type: 'single_select',
        required: true,
        options: [
          { value: 'low', label: '低' },
          { value: 'high', label: '高' },
        ],
      }),
    ];

    it('接受声明的选项值', () => {
      expect(validate(fields, { priority: 'high' })).toEqual({
        ok: true,
        input: { priority: 'high' },
      });
    });

    it('拒绝未声明的选项值', () => {
      expect(validate(fields, { priority: 'urgent' }).ok).toBe(false);
    });

    it('必填时空串按缺失处理', () => {
      expect(validate(fields, { priority: '' }).ok).toBe(false);
    });
  });

  describe('multi_select', () => {
    const fields = [
      makeField({
        id: 'tags',
        type: 'multi_select',
        required: true,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ];

    it('接受声明的选项值数组', () => {
      expect(validate(fields, { tags: ['a', 'b'] })).toEqual({
        ok: true,
        input: { tags: ['a', 'b'] },
      });
    });

    it('必填时空数组报错', () => {
      expect(validate(fields, { tags: [] }).ok).toBe(false);
    });

    it('非数组报错', () => {
      expect(validate(fields, { tags: 'a' }).ok).toBe(false);
    });

    it('包含未声明选项报错', () => {
      expect(validate(fields, { tags: ['a', 'z'] }).ok).toBe(false);
    });

    it('超过 20 项报错', () => {
      const result = validate(fields, {
        tags: Array.from({ length: 21 }, () => 'a'),
      });

      expect(result.ok).toBe(false);
    });
  });

  it('input 与 clientContext 合计超过 64 KiB 时报错', () => {
    const fields = [makeField({ id: 'tags', type: 'multi_select' })];
    const result = validate(fields, {
      tags: Array.from({ length: 20 }, () => 'a'.repeat(4000)),
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errors: [
        {
          field: 'input',
          message: expect.stringContaining(
            String(MAX_SUBMISSION_PAYLOAD_BYTES),
          ),
        },
      ],
    });
  });

  it('clientContext 计入体量上限', () => {
    const result = validate([], {}, { blob: 'a'.repeat(70 * 1024) });

    expect(result.ok).toBe(false);
  });
});

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
