/**
 * 生成应用公开运行时表单（AppSpec v2，ADR-0007 §2）。
 *
 * 表单与结果视图完全来自 AppSpec：字段由模型按需求生成并经 `GeneratedAppSpecV2Schema`
 * 校验，这里只做公开投影与提交的严格校验，不再推断或补充任何固定字段。
 * 纯函数，无依赖注入：Gate 2/3 的合约检查与公开提交共用同一份实现。
 */
import type {
  GeneratedAppField,
  GeneratedAppSpecV2,
} from './types/app-spec-v2.schema';
import type {
  GeneratedAppRuntimeFormBuilder,
  GeneratedAppSubmissionValidation,
  PublicGeneratedAppRuntimeFormV2,
} from './types/generation-v2.ports';

/** `input` 的 UTF-8 JSON 序列化字节上限：先卡体量，避免为超大 payload 逐字段校验 */
export const GENERATED_APP_SUBMISSION_MAX_PAYLOAD_BYTES = 64 * 1024;

type SubmissionValue = string | number | string[];
type FieldCheck =
  | { kind: 'empty' }
  | { kind: 'value'; value: SubmissionValue }
  | { kind: 'error'; message: string };

const REQUIRED_MESSAGE = '该字段为必填项';

export function buildPublicGeneratedAppRuntimeForm(
  appSpec: GeneratedAppSpecV2,
): PublicGeneratedAppRuntimeFormV2 {
  return {
    // 生成时间区分同一应用前后两次生成的表单，客户端据此判断缓存的表单是否过期
    formId: `form-${Date.parse(appSpec.generation.generatedAt).toString(36)}`,
    title: appSpec.inputForm.title,
    description: appSpec.inputForm.description,
    submitLabel: appSpec.inputForm.submitLabel,
    fields: appSpec.inputForm.fields.map((field) => structuredClone(field)),
    resultView: structuredClone(appSpec.resultView),
  };
}

/**
 * 严格校验公开提交：未知字段、类型、必填、长度、数值范围、选项。
 * 通过时返回规范化后的值（字符串已 trim，数字已归一，空的选填字段省略），
 * 落库与投影到工作流输入使用同一份值。
 */
export function validateGeneratedAppSubmission(
  appSpec: GeneratedAppSpecV2,
  input: unknown,
): GeneratedAppSubmissionValidation {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: 'input', message: '提交内容必须是对象' }],
    };
  }

  const payloadBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  if (payloadBytes > GENERATED_APP_SUBMISSION_MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      errors: [
        {
          field: 'input',
          message: `提交内容为 ${payloadBytes} 字节，超过 ${GENERATED_APP_SUBMISSION_MAX_PAYLOAD_BYTES} 字节上限`,
        },
      ],
    };
  }

  const fields = appSpec.inputForm.fields;
  const knownFieldIds = new Set(fields.map((field) => field.id));
  const errors: Array<{ field: string; message: string }> = [];

  for (const key of Object.keys(input)) {
    if (!knownFieldIds.has(key)) {
      errors.push({
        field: `input.${key}`,
        message: '不是该应用表单声明的字段',
      });
    }
  }

  const values: Record<string, SubmissionValue> = {};
  for (const field of fields) {
    const raw = Object.hasOwn(input, field.id) ? input[field.id] : undefined;
    const check = checkFieldValue(field, raw);

    if (check.kind === 'error') {
      errors.push({ field: `input.${field.id}`, message: check.message });
    } else if (check.kind === 'empty') {
      if (field.required) {
        errors.push({ field: `input.${field.id}`, message: REQUIRED_MESSAGE });
      }
    } else {
      values[field.id] = check.value;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}

export const generatedAppRuntimeFormBuilder: GeneratedAppRuntimeFormBuilder = {
  buildPublicForm: buildPublicGeneratedAppRuntimeForm,
  validateSubmission: validateGeneratedAppSubmission,
};

function checkFieldValue(field: GeneratedAppField, raw: unknown): FieldCheck {
  if (raw === undefined || raw === null) {
    return { kind: 'empty' };
  }

  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string') {
        return { kind: 'error', message: '必须是文本' };
      }
      const value = raw.trim();
      if (value.length === 0) {
        return { kind: 'empty' };
      }
      return value.length > field.maxLength
        ? { kind: 'error', message: `不能超过 ${field.maxLength} 个字符` }
        : { kind: 'value', value };
    }
    case 'number': {
      // 浏览器表单可能以字符串提交数字，空字符串视为未填写
      if (typeof raw === 'string' && raw.trim().length === 0) {
        return { kind: 'empty' };
      }
      const value =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string'
            ? Number(raw.trim())
            : Number.NaN;
      if (!Number.isFinite(value)) {
        return { kind: 'error', message: '必须是有限数字' };
      }
      if (field.min !== undefined && value < field.min) {
        return { kind: 'error', message: `不能小于 ${field.min}` };
      }
      if (field.max !== undefined && value > field.max) {
        return { kind: 'error', message: `不能大于 ${field.max}` };
      }
      return { kind: 'value', value };
    }
    case 'single_select': {
      if (raw === '') {
        return { kind: 'empty' };
      }
      if (typeof raw !== 'string') {
        return { kind: 'error', message: '必须是一个选项值' };
      }
      return field.options.some((option) => option.value === raw)
        ? { kind: 'value', value: raw }
        : { kind: 'error', message: `「${raw}」不是该字段的选项` };
    }
    case 'multi_select': {
      if (!Array.isArray(raw)) {
        return { kind: 'error', message: '必须是选项值数组' };
      }
      if (raw.length === 0) {
        return { kind: 'empty' };
      }
      const allowed = new Set(field.options.map((option) => option.value));
      const seen = new Set<string>();
      for (const item of raw) {
        if (typeof item !== 'string' || !allowed.has(item)) {
          return {
            kind: 'error',
            message: `「${String(item)}」不是该字段的选项`,
          };
        }
        if (seen.has(item)) {
          return { kind: 'error', message: `选项「${item}」重复` };
        }
        seen.add(item);
      }
      return { kind: 'value', value: [...seen] };
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
