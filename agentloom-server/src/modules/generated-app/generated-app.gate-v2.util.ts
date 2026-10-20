// 生成应用 v2 门禁的共享工具：执行级别解析、AppSpec 指纹、证据与失败结果构造。

import { createHash } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
} from './types/generated-app.types';
import type { GeneratedAppSpecV2 } from './types/app-spec-v2.schema';
import type { GeneratedAppGateEvaluationV2 } from './types/generation-v2.ports';
import {
  GENERATED_APP_GATE_EXECUTION_LEVELS,
  type GeneratedAppGateExecutionLevel,
  type GeneratedAppGenerationPlanV2,
  type GeneratedAppPinnedBinding,
} from './types/generation-plan-v2.types';

export type GeneratedAppGateExecutorModeEnvKey =
  | 'GENERATED_APP_GATE3_EXECUTOR_MODE'
  | 'GENERATED_APP_GATE4_EXECUTOR_MODE'
  | 'GENERATED_APP_GATE5_EXECUTOR_MODE'
  | 'GENERATED_APP_GATE6_EXECUTOR_MODE'
  | 'GENERATED_APP_GATE7_EXECUTOR_MODE';

/**
 * 未配置时为 real；配置了 real/fixture/disabled 以外的值（含已删除的 v1 级别名）按 disabled 处理，
 * 让门禁明确失败而不是悄悄换成另一种执行方式。
 */
export function resolveGateExecutionLevel(
  configService: Pick<ConfigService, 'get'>,
  envKey: GeneratedAppGateExecutorModeEnvKey,
): GeneratedAppGateExecutionLevel {
  const raw = configService.get<string>(envKey);
  if (raw === undefined || raw.trim() === '') return 'real';
  const normalized = raw.trim().toLowerCase();
  return (GENERATED_APP_GATE_EXECUTION_LEVELS as readonly string[]).includes(
    normalized,
  )
    ? (normalized as GeneratedAppGateExecutionLevel)
    : 'disabled';
}

/** 键排序后的 JSON：同一份 AppSpec 在不同进程得到同一个指纹 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeAppSpecSha256(appSpec: GeneratedAppSpecV2): string {
  return createHash('sha256').update(stableStringify(appSpec)).digest('hex');
}

/**
 * `generated_apps.generation_plan` 只承认服务端各 Gate 写入的 v2 形状；其他值（null、旧数据）一律视为没有计划。
 * 计划只由本服务写入，判别字段即可区分，不在读取路径上重复整树校验。
 */
export function getGenerationPlanV2(
  value: unknown,
): GeneratedAppGenerationPlanV2 | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('planVersion' in value) ||
    value.planVersion !== 2
  ) {
    return null;
  }
  // 判别字段已确认；其余键由同一服务的 Gate 写入
  const plan = value as GeneratedAppGenerationPlanV2;
  return plan;
}

export function toPinnedBinding(
  appSpec: GeneratedAppSpecV2,
): GeneratedAppPinnedBinding {
  return appSpec.binding.kind === 'workflow'
    ? {
        kind: 'workflow',
        workflowDefinitionId: appSpec.binding.workflowDefinitionId,
        workflowVersionId: appSpec.binding.workflowVersionId,
      }
    : {
        kind: 'agent',
        agentDefinitionId: appSpec.binding.agentDefinitionId,
        agentVersionId: appSpec.binding.agentVersionId,
      };
}

export function gateEvidence(params: {
  id: string;
  label: string;
  kind: GeneratedAppGateEvidence['kind'];
  summary: string;
  details?: unknown;
}): GeneratedAppGateEvidence {
  return {
    id: params.id,
    label: params.label,
    kind: params.kind,
    url: null,
    summary: params.summary,
    ...(params.details === undefined ? {} : { details: params.details }),
  };
}

export function failedGate<TPlan>(params: {
  summary: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  evidence: GeneratedAppGateEvidence[];
  repairInstructions: string;
  plan: TPlan | null;
}): GeneratedAppGateEvaluationV2<TPlan> {
  const failure: GeneratedAppGateRunFailure = {
    code: params.code,
    message: params.message,
    ...(params.details ? { details: params.details } : {}),
  };
  return {
    status: 'failed',
    summary: params.summary,
    evidence: params.evidence,
    failure,
    repairInstructions: params.repairInstructions,
    plan: params.plan,
  };
}

/** disabled 级别的统一失败：未执行任何检查，不能当作通过 */
export function disabledGate<TPlan>(params: {
  gateId: string;
  gateLabel: string;
  envKey: GeneratedAppGateExecutorModeEnvKey;
  plan: TPlan | null;
}): GeneratedAppGateEvaluationV2<TPlan> {
  return failedGate({
    summary: `${params.gateLabel}失败：执行器被配置为 disabled，未执行任何检查。`,
    code: `${params.gateId}-executor-disabled`,
    message: `${params.gateLabel}执行器被禁用，生成运行在此停止。`,
    details: { executionLevel: 'disabled' },
    evidence: [
      gateEvidence({
        id: `${params.gateId}-executor-disabled`,
        label: `${params.gateLabel}执行器状态`,
        kind: 'manual',
        summary: `${params.envKey} 不是 real/fixture，按 disabled 处理；未执行检查。`,
        details: { executionLevel: 'disabled', executed: false },
      }),
    ],
    repairInstructions: `把 ${params.envKey} 设为 real（或删除该变量）后重新运行生成。`,
    plan: params.plan,
  });
}
