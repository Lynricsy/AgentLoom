/**
 * 公开提交入参校验：把运行时表单契约（以及绑定 Workflow 的 inputSchema）翻译成
 * Zod 校验，在写库与触发 Workflow **之前** fail-closed。
 *
 * 为什么不复用 evaluator 的通用检查：evaluator 只做脱敏与截断，它的语义是「尽量
 * 把已接受的内容安全落库」，对非法结构一律放行并静默改写。公开面需要的是拒绝，
 * 两者目标相反，必须分开。
 */
import { z } from 'zod';

import type { FieldError } from '../../common/types/problem-details.type';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';
import { resolveWorkflowInputParams } from '../workflow/utils/workflow-input-validation.util';
import type {
  PublicGeneratedAppRuntimeFieldDto,
  PublicGeneratedAppRuntimeFormDto,
} from './dto';
import {
  FORBIDDEN_OBJECT_KEYS,
  MAX_ARRAY_ITEMS,
  MAX_INPUT_DEPTH,
  MAX_INPUT_FIELD_COUNT,
} from './generated-app.runtime';

/** 单个字符串字段的字符上限。 */
export const MAX_SUBMISSION_STRING_LENGTH = 4000;

/** `input` + `clientContext` 的 UTF-8 JSON 序列化字节上限。 */
export const MAX_SUBMISSION_PAYLOAD_BYTES = 64 * 1024;

/** 浮点 step 判定容差：range 控件提交的值常带浮点误差。 */
const STEP_EPSILON = 1e-9;

function fieldPath(fieldId: string): string {
  return `input.${fieldId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 递归检查结构深度、字段总数、数组长度与危险键。
 * 这些通用上限与 evaluator 共享常量，先于按字段类型的校验执行。
 */
function collectStructuralErrors(
  value: unknown,
  path: string,
  depth: number,
  counter: { fields: number },
  errors: FieldError[],
): void {
  if (depth > MAX_INPUT_DEPTH) {
    errors.push({ field: path, message: `嵌套层级超过 ${MAX_INPUT_DEPTH} 层` });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      errors.push({
        field: path,
        message: `数组元素数量超过 ${MAX_ARRAY_ITEMS} 个`,
      });
      return;
    }
    value.forEach((item, index) => {
      collectStructuralErrors(
        item,
        `${path}[${index}]`,
        depth + 1,
        counter,
        errors,
      );
    });
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        errors.push({ field: `${path}.${key}`, message: '包含被禁止的对象键' });
        continue;
      }

      counter.fields += 1;
      if (counter.fields > MAX_INPUT_FIELD_COUNT) {
        errors.push({
          field: path,
          message: `字段总数超过 ${MAX_INPUT_FIELD_COUNT} 个`,
        });
        return;
      }

      collectStructuralErrors(
        child,
        `${path}.${key}`,
        depth + 1,
        counter,
        errors,
      );
    }
    return;
  }

  if (
    typeof value === 'string' &&
    value.length > MAX_SUBMISSION_STRING_LENGTH
  ) {
    errors.push({
      field: path,
      message: `文本长度超过 ${MAX_SUBMISSION_STRING_LENGTH} 个字符`,
    });
  }
}

/** 数字字段：HTML 表单会把数字以字符串提交，先归一再校验。 */
function coerceSubmittedNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;

    return Number(trimmed);
  }

  return Number.NaN;
}

function buildTextFieldSchema(
  field: PublicGeneratedAppRuntimeFieldDto,
): z.ZodType<unknown> {
  const base = z
    .string({ message: '必须是文本' })
    .trim()
    .max(
      MAX_SUBMISSION_STRING_LENGTH,
      `文本长度不能超过 ${MAX_SUBMISSION_STRING_LENGTH} 个字符`,
    );

  return field.required ? base.min(1, '该字段为必填项') : base;
}

function buildNumberFieldSchema(
  field: PublicGeneratedAppRuntimeFieldDto,
): z.ZodType<unknown> {
  return z.unknown().superRefine((raw, ctx) => {
    const value = coerceSubmittedNumber(raw);

    if (value === undefined) {
      if (field.required) {
        ctx.addIssue({ code: 'custom', message: '该字段为必填项' });
      }
      return;
    }

    if (!Number.isFinite(value)) {
      ctx.addIssue({ code: 'custom', message: '必须是有限数字' });
      return;
    }

    if (field.min !== undefined && value < field.min) {
      ctx.addIssue({ code: 'custom', message: `不能小于 ${field.min}` });
    }
    if (field.max !== undefined && value > field.max) {
      ctx.addIssue({ code: 'custom', message: `不能大于 ${field.max}` });
    }
    if (field.step !== undefined && field.step > 0) {
      const origin = field.min ?? 0;
      const steps = (value - origin) / field.step;

      if (Math.abs(steps - Math.round(steps)) > STEP_EPSILON) {
        ctx.addIssue({
          code: 'custom',
          message: `必须是步长 ${field.step} 的整数倍`,
        });
      }
    }
  });
}

function buildSingleSelectFieldSchema(
  field: PublicGeneratedAppRuntimeFieldDto,
): z.ZodType<unknown> {
  const allowed = field.options.map((option) => option.value);

  return z.unknown().superRefine((raw, ctx) => {
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) {
        ctx.addIssue({ code: 'custom', message: '该字段为必填项' });
      }
      return;
    }

    if (typeof raw !== 'string') {
      ctx.addIssue({ code: 'custom', message: '必须是文本选项值' });
      return;
    }

    if (allowed.length > 0 && !allowed.includes(raw)) {
      ctx.addIssue({
        code: 'custom',
        message: `不是该字段的合法选项：${allowed.join('、')}`,
      });
    }
  });
}

function buildMultiSelectFieldSchema(
  field: PublicGeneratedAppRuntimeFieldDto,
): z.ZodType<unknown> {
  const allowed = field.options.map((option) => option.value);

  return z.unknown().superRefine((raw, ctx) => {
    if (raw === undefined || raw === null) {
      if (field.required) {
        ctx.addIssue({ code: 'custom', message: '该字段为必填项' });
      }
      return;
    }

    if (!Array.isArray(raw)) {
      ctx.addIssue({ code: 'custom', message: '必须是选项值数组' });
      return;
    }

    if (raw.length > MAX_ARRAY_ITEMS) {
      ctx.addIssue({
        code: 'custom',
        message: `最多选择 ${MAX_ARRAY_ITEMS} 项`,
      });
      return;
    }

    if (field.required && raw.length === 0) {
      ctx.addIssue({ code: 'custom', message: '该字段为必填项' });
    }

    for (const item of raw) {
      if (typeof item !== 'string') {
        ctx.addIssue({ code: 'custom', message: '选项值必须是文本' });
        return;
      }
      if (allowed.length > 0 && !allowed.includes(item)) {
        ctx.addIssue({ code: 'custom', message: `包含非法选项 "${item}"` });
        return;
      }
    }
  });
}

function buildFieldSchema(
  field: PublicGeneratedAppRuntimeFieldDto,
): z.ZodType<unknown> {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return buildTextFieldSchema(field);
    case 'number':
    case 'range':
      return buildNumberFieldSchema(field);
    case 'single_select':
      return buildSingleSelectFieldSchema(field);
    case 'multi_select':
      return buildMultiSelectFieldSchema(field);
  }
}

function toFieldErrors(error: z.ZodError, prefix: string): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? `${prefix}.${issue.path.join('.')}` : prefix,
    message: issue.message,
  }));
}

export type PublicSubmissionValidationResult =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; errors: FieldError[] };

/**
 * 依据运行时表单契约校验公开提交的 `input`。
 *
 * 通过时返回规范化后的 input（trim 过的字符串、归一后的数字），
 * 让落库与 Workflow 拿到同一份值；失败时返回全部字段错误，由调用方抛 422。
 */
export function validatePublicSubmissionInput(params: {
  runtimeForm: PublicGeneratedAppRuntimeFormDto;
  input: unknown;
  clientContext?: Record<string, unknown> | undefined;
}): PublicSubmissionValidationResult {
  const errors: FieldError[] = [];
  const rawInput = params.input ?? {};

  if (!isPlainObject(rawInput)) {
    return {
      ok: false,
      errors: [{ field: 'input', message: '提交内容必须是对象' }],
    };
  }

  // 整体体量先卡死：避免逐字段校验为超大 payload 做无谓工作。
  const payloadBytes = Buffer.byteLength(
    JSON.stringify({
      input: rawInput,
      ...(params.clientContext ? { clientContext: params.clientContext } : {}),
    }),
    'utf8',
  );
  if (payloadBytes > MAX_SUBMISSION_PAYLOAD_BYTES) {
    return {
      ok: false,
      errors: [
        {
          field: 'input',
          message: `提交内容序列化后为 ${payloadBytes} 字节，超过 ${MAX_SUBMISSION_PAYLOAD_BYTES} 字节上限`,
        },
      ],
    };
  }

  collectStructuralErrors(rawInput, 'input', 1, { fields: 0 }, errors);
  if (errors.length > 0) return { ok: false, errors };

  const fields = params.runtimeForm.fields;
  const known = new Set(fields.map((field) => field.id));

  for (const key of Object.keys(rawInput)) {
    if (!known.has(key)) {
      errors.push({
        field: fieldPath(key),
        message: '不是该应用运行时表单声明的字段',
      });
    }
  }

  const normalized: Record<string, unknown> = {};

  for (const field of fields) {
    if (!Object.hasOwn(rawInput, field.id)) {
      if (field.required) {
        errors.push({ field: fieldPath(field.id), message: '该字段为必填项' });
      }
      continue;
    }

    const raw = rawInput[field.id];
    const result = buildFieldSchema(field).safeParse(raw);
    if (!result.success) {
      errors.push(...toFieldErrors(result.error, fieldPath(field.id)));
      continue;
    }

    if (field.type === 'number' || field.type === 'range') {
      const coerced = coerceSubmittedNumber(raw);
      if (coerced !== undefined) normalized[field.id] = coerced;
      continue;
    }

    normalized[field.id] = result.data;
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, input: normalized };
}

/**
 * 第二层校验：绑定的已发布 Workflow 自带 inputSchema 时，用它再卡一次，
 * 并返回**投影后**的入参（只保留 Workflow 契约声明的字段，已应用 default）。
 *
 * 直接复用 `ExecutionService` 启动时用的同一份实现，不另写一版更宽松的规则：
 * 否则 `runWorkflow` 仍会抛 422，而该异常被 handoff 的 catch 吞成
 * `workflow-execution-blocked`，公开面照样落一条「已接收」的 submission，
 * 提交者以为成功、创建者永远等不到执行结果。
 *
 * 未知键走 `drop` 而不是 `reject`：公开运行表单收集的字段可以多于工作流契约，
 * 多出来的字段仍完整落到 submission 记录，只是不传给工作流。
 */
export function validateSubmissionAgainstWorkflowInputSchema(params: {
  workflowInputSchema: WorkflowInputSchema;
  input: Record<string, unknown>;
}): { errors: FieldError[]; projectedInput: Record<string, unknown> } {
  const resolution = resolveWorkflowInputParams({
    workflowInputSchema: params.workflowInputSchema,
    rawInputParams: params.input,
    fieldPrefix: 'input',
    unknownKeys: 'drop',
  });

  return {
    errors: resolution.errors,
    projectedInput: resolution.resolvedInputs,
  };
}
