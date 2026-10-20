/**
 * 公开提交投影后的入参与工作流输入契约的一致性检查。
 *
 * 表单本身的严格校验在 generated-app.runtime.ts（按 AppSpec v2）。这里复用
 * `ExecutionService` 启动时的同一份实现，供 Gate 3 的合约测试确认「通过表单校验的值，
 * 投影后也能通过固定版本的 inputSchema」，不另写一版更宽松的规则。
 */
import type { FieldError } from '../../common/types/problem-details.type';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';
import { resolveWorkflowInputParams } from '../workflow/utils/workflow-input-validation.util';

/**
 * 用工作流 inputSchema 校验投影后的入参，并返回按契约解析（已应用 default）的值。
 * 未知键走 `drop`：投影只传映射到的字段，多余键只可能来自调用方的拼装错误。
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
