/**
 * Workflow 输入契约的解析与校验（唯一实现）。
 *
 * 被两处复用：
 * - `ExecutionService` 启动工作流时的入参归一化；
 * - 生成应用公开提交在触发 `runWorkflow` **之前** 的预校验。
 *
 * 之所以必须共用同一份：公开提交侧若自己写一版更宽松的校验，`runWorkflow` 仍会抛
 * 422，而该异常会被 handoff 的 catch 吞成 `workflow-execution-blocked`，结果是
 * 提交被记为「已接收」却永远没有 execution。两处语义（未知键、visibility、default、
 * 空值判定、options）必须逐项一致。
 */
import type { FieldError } from '../../../common/types/problem-details.type';
import type {
  InputFieldDefinition,
  WorkflowInputSchema,
} from '../dto/workflow-input-schema.dto';

export interface WorkflowInputResolution {
  /** 可见且非空的字段值（已应用 default）。 */
  resolvedInputs: Record<string, unknown>;
  /** 因 visibility 条件不满足而未参与本次执行的字段。 */
  unresolvedFieldIds: string[];
  errors: FieldError[];
}

/** 空值判定：空数组等同于未填写，required 的 multi_select 不能靠 `[]` 蒙混过关。 */
export function isEmptyWorkflowInputValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function createFieldError(
  fieldPrefix: string,
  fieldId: string,
  message: string,
): FieldError {
  return { field: `${fieldPrefix}.${fieldId}`, message };
}

function validateResolvedFieldValue(
  field: InputFieldDefinition,
  value: unknown,
  fieldPrefix: string,
  errors: FieldError[],
): unknown {
  if (isEmptyWorkflowInputValue(value)) {
    if (field.required) {
      errors.push(createFieldError(fieldPrefix, field.id, '该字段为必填项'));
    }

    return undefined;
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是字符串'),
        );
        return undefined;
      }

      if (
        field.validation?.minLength !== undefined &&
        value.length < field.validation.minLength
      ) {
        errors.push(
          createFieldError(
            fieldPrefix,
            field.id,
            `长度不能少于 ${field.validation.minLength} 个字符`,
          ),
        );
      }

      if (
        field.validation?.maxLength !== undefined &&
        value.length > field.validation.maxLength
      ) {
        errors.push(
          createFieldError(
            fieldPrefix,
            field.id,
            `长度不能超过 ${field.validation.maxLength} 个字符`,
          ),
        );
      }

      return value;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是数字'),
        );
        return undefined;
      }

      if (field.validation?.min !== undefined && value < field.validation.min) {
        errors.push(
          createFieldError(
            fieldPrefix,
            field.id,
            `数值不能小于 ${field.validation.min}`,
          ),
        );
      }

      if (field.validation?.max !== undefined && value > field.validation.max) {
        errors.push(
          createFieldError(
            fieldPrefix,
            field.id,
            `数值不能大于 ${field.validation.max}`,
          ),
        );
      }

      return value;
    }
    case 'single_select': {
      if (typeof value !== 'string') {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是字符串选项'),
        );
        return undefined;
      }

      if (field.options && !field.options.includes(value)) {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是预定义选项之一'),
        );
      }

      return value;
    }
    case 'multi_select': {
      if (!Array.isArray(value)) {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是字符串数组'),
        );
        return undefined;
      }

      if (value.some((item) => typeof item !== 'string')) {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段必须是字符串数组'),
        );
        return undefined;
      }

      if (
        field.options &&
        value.some((item) => !field.options?.includes(item))
      ) {
        errors.push(
          createFieldError(fieldPrefix, field.id, '该字段包含未定义的选项'),
        );
      }

      return value;
    }
  }
}

/**
 * 按输入契约解析一批原始入参。
 *
 * 默认（`unknownKeys: 'reject'`）先做未知键检查并在命中时**立即返回**（只带未知键
 * 错误）：字段级错误往往是未知键拼写错误的连带结果，一起报会淹没真正的问题。
 * 这是工作流手动/API 启动的语义——调用方声明了契约外的字段，就是调用方写错了。
 *
 * `unknownKeys: 'drop'` 用于生成应用的公开提交：公开运行表单收集的字段本来就可能
 * 多于所绑定 Workflow 声明的字段（表单是应用的，契约是工作流的），多出来的字段仍会
 * 完整落到 submission 记录里，只是不传给工作流。若在这里报错，等于让终端用户为
 * 创建者的配置错配买单，而且会把本可以正常执行的提交变成硬失败。
 *
 * 调用方负责把 `errors` 转成各自域的 422 异常。
 */
export function resolveWorkflowInputParams(params: {
  workflowInputSchema: WorkflowInputSchema;
  rawInputParams: Record<string, unknown>;
  /** 错误 `field` 前缀，例如 `inputParams` 或 `input`。 */
  fieldPrefix: string;
  /** 契约未声明的键如何处理；默认 `reject`。 */
  unknownKeys?: 'reject' | 'drop';
}): WorkflowInputResolution {
  const { workflowInputSchema, rawInputParams, fieldPrefix } = params;
  const fieldMap = new Map(
    workflowInputSchema.fields.map((field) => [field.id, field]),
  );

  if ((params.unknownKeys ?? 'reject') === 'reject') {
    const unknownKeyErrors: FieldError[] = Object.keys(rawInputParams)
      .filter((fieldId) => !fieldMap.has(fieldId))
      .map((fieldId) =>
        createFieldError(fieldPrefix, fieldId, '该字段不存在于当前输入契约中'),
      );

    if (unknownKeyErrors.length > 0) {
      return {
        resolvedInputs: {},
        unresolvedFieldIds: [],
        errors: unknownKeyErrors,
      };
    }
  }

  const errors: FieldError[] = [];
  const fieldStateCache = new Map<
    string,
    { visible: boolean; value: unknown }
  >();

  const resolveFieldState = (
    fieldId: string,
    path = new Set<string>(),
  ): { visible: boolean; value: unknown } => {
    const cachedState = fieldStateCache.get(fieldId);
    if (cachedState) {
      return cachedState;
    }

    const field = fieldMap.get(fieldId);
    if (!field) {
      return { visible: false, value: undefined };
    }

    // 环形 visibility 引用：把自身视为不可见，避免无限递归。
    if (path.has(fieldId)) {
      return { visible: false, value: undefined };
    }

    let visible = true;
    if (field.visibility) {
      const nextPath = new Set(path);
      nextPath.add(fieldId);

      const controllerState = resolveFieldState(
        field.visibility.fieldId,
        nextPath,
      );
      visible =
        controllerState.visible &&
        controllerState.value === field.visibility.equals;
    }

    const state = {
      visible,
      value: visible
        ? Object.prototype.hasOwnProperty.call(rawInputParams, field.id)
          ? rawInputParams[field.id]
          : field.default
        : undefined,
    };

    fieldStateCache.set(fieldId, state);
    return state;
  };

  const resolvedInputs: Record<string, unknown> = {};
  const unresolvedFieldIds: string[] = [];

  workflowInputSchema.fields.forEach((field) => {
    const fieldState = resolveFieldState(field.id);

    if (!fieldState.visible) {
      unresolvedFieldIds.push(field.id);
      return;
    }

    const resolvedValue = validateResolvedFieldValue(
      field,
      fieldState.value,
      fieldPrefix,
      errors,
    );
    if (resolvedValue !== undefined) {
      resolvedInputs[field.id] = resolvedValue;
    }
  });

  return { resolvedInputs, unresolvedFieldIds, errors };
}
