import { describe, expect, it } from 'vitest';

import {
  GENERATED_APP_SUBMISSION_MAX_PAYLOAD_BYTES,
  buildPublicGeneratedAppRuntimeForm,
  validateGeneratedAppSubmission,
} from '../generated-app.runtime';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import { createAppSpecV2Fixture } from './generated-app-test-support';

/** 覆盖全部字段类型的规格：表单校验不依赖绑定，这里只替换字段 */
function createMixedFieldSpec(): GeneratedAppSpecV2 {
  const spec = createAppSpecV2Fixture();
  return {
    ...spec,
    inputForm: {
      ...spec.inputForm,
      fields: [
        {
          id: 'question',
          label: '问题',
          type: 'textarea',
          required: true,
          maxLength: 20,
          helpText: '',
          placeholder: '',
        },
        {
          id: 'count',
          label: '条数',
          type: 'number',
          required: false,
          min: 1,
          max: 5,
          helpText: '',
          placeholder: '',
        },
        {
          id: 'tone',
          label: '语气',
          type: 'single_select',
          required: false,
          options: [
            { value: 'formal', label: '正式' },
            { value: 'casual', label: '口语' },
          ],
          helpText: '',
          placeholder: '',
        },
        {
          id: 'topics',
          label: '主题',
          type: 'multi_select',
          required: false,
          options: [
            { value: 'billing', label: '计费' },
            { value: 'agents', label: 'Agent' },
          ],
          helpText: '',
          placeholder: '',
        },
      ],
    },
  };
}

describe('buildPublicGeneratedAppRuntimeForm', () => {
  it('表单与结果视图完全来自 AppSpec，不补任何固定字段', () => {
    const spec = createAppSpecV2Fixture();

    const form = buildPublicGeneratedAppRuntimeForm(spec);

    expect(form).toMatchObject({
      title: '提问',
      submitLabel: '提问',
      resultView: spec.resultView,
    });
    expect(form.fields.map((field) => field.id)).toEqual(['question']);
    expect(form.formId).toMatch(/^form-[0-9a-z]+$/);
    // 投影是副本：调用方改动不会回写 AppSpec
    form.fields[0].label = '改过';
    expect(spec.inputForm.fields[0].label).toBe('问题');
  });
});

describe('validateGeneratedAppSubmission', () => {
  it('合法提交返回规范化后的值：trim 文本、数字字符串转数字、空的选填字段省略', () => {
    const result = validateGeneratedAppSubmission(createMixedFieldSpec(), {
      question: '  最多几个子 Agent？ ',
      count: '3',
      tone: '',
      topics: [],
    });

    expect(result).toEqual({
      ok: true,
      values: { question: '最多几个子 Agent？', count: 3 },
    });
  });

  it('未知字段、选项外的值、超长文本、超出范围的数字一次全部报错', () => {
    const result = validateGeneratedAppSubmission(createMixedFieldSpec(), {
      question: '一'.repeat(21),
      count: 6,
      tone: 'angry',
      topics: ['agents', 'weather'],
      chiefComplaint: '头痛',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        { field: 'input.chiefComplaint', message: '不是该应用表单声明的字段' },
        { field: 'input.question', message: '不能超过 20 个字符' },
        { field: 'input.count', message: '不能大于 5' },
        { field: 'input.tone', message: '「angry」不是该字段的选项' },
        { field: 'input.topics', message: '「weather」不是该字段的选项' },
      ]),
    );
    expect(!result.ok && result.errors).toHaveLength(5);
  });

  it('数字的下界、非有限值与类型错误分别报错', () => {
    const spec = createMixedFieldSpec();

    expect(
      validateGeneratedAppSubmission(spec, { question: 'q', count: 0 }),
    ).toMatchObject({
      ok: false,
      errors: [{ field: 'input.count', message: '不能小于 1' }],
    });
    expect(
      validateGeneratedAppSubmission(spec, { question: 'q', count: 'abc' }),
    ).toMatchObject({
      ok: false,
      errors: [{ field: 'input.count', message: '必须是有限数字' }],
    });
    expect(
      validateGeneratedAppSubmission(spec, { question: 42, tone: ['formal'] }),
    ).toMatchObject({
      ok: false,
      errors: [
        { field: 'input.question', message: '必须是文本' },
        { field: 'input.tone', message: '必须是一个选项值' },
      ],
    });
  });

  it('必填字段缺失、为空白或为 null 时报必填；多选重复值报错', () => {
    const spec = createMixedFieldSpec();

    for (const question of [undefined, '   ', null]) {
      expect(validateGeneratedAppSubmission(spec, { question })).toMatchObject({
        ok: false,
        errors: [{ field: 'input.question', message: '该字段为必填项' }],
      });
    }
    expect(
      validateGeneratedAppSubmission(spec, {
        question: 'q',
        topics: ['agents', 'agents'],
      }),
    ).toMatchObject({
      ok: false,
      errors: [{ field: 'input.topics', message: '选项「agents」重复' }],
    });
  });

  it('非对象与超过字节上限的提交整体拒绝', () => {
    const spec = createMixedFieldSpec();

    for (const input of [null, 'question', ['q']]) {
      expect(validateGeneratedAppSubmission(spec, input)).toEqual({
        ok: false,
        errors: [{ field: 'input', message: '提交内容必须是对象' }],
      });
    }

    const oversized = validateGeneratedAppSubmission(spec, {
      question: 'x'.repeat(GENERATED_APP_SUBMISSION_MAX_PAYLOAD_BYTES),
    });
    expect(oversized).toMatchObject({
      ok: false,
      errors: [
        { field: 'input', message: expect.stringContaining('字节上限') },
      ],
    });
  });
});
