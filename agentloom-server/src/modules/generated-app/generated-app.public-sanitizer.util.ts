import * as schema from '../../database/schema';

import {
  getNonEmptyString,
  getRecordArray,
  getStringArray,
  isRecord,
} from './generated-app.plan-validation.util';

export const GENERATED_APP_REPAIR_ATTEMPT_TEXT_MAX_LENGTH = 4000;

export const PUBLIC_ANONYMOUS_SESSION_TOKEN_LIKE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,})\b/i;

export const PUBLIC_ANONYMOUS_SESSION_HOST_PATH_PATTERN =
  /(?:\/(?:root|home|users|var|tmp|etc|workspace)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/i;

export const GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_LIMIT = 5;

export const GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_TEXT_LIMIT = 500;

export const PUBLIC_SUBMISSION_FORBIDDEN_RESULT_REPORT_KEYS = new Set([
  '_meta',
  'api_key',
  'api_keys',
  'apikey',
  'apikeys',
  'authorization',
  'bearer',
  'checkpoint_data',
  'checkpointdata',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'creator_only',
  'creatoronly',
  'definition_snapshot',
  'definitionsnapshot',
  'execution_snapshot',
  'executionsnapshot',
  'execution_steps',
  'executionsteps',
  'gate_results',
  'gateresults',
  'host_path',
  'hostpath',
  'host_paths',
  'hostpaths',
  'input_params',
  'inputparams',
  'node_data',
  'nodedata',
  'password',
  'private_key',
  'privatekey',
  'plugin_ids',
  'pluginids',
  'plugin_id',
  'pluginid',
  'public_share_token',
  'publicsharetoken',
  'readiness',
  'secret',
  'secrets',
  'source_artifact_url',
  'sourceartifacturl',
  'stack',
  'stack_trace',
  'stacktrace',
  'steps',
  'tenant_id',
  'tenantid',
  'test_report_url',
  'testreporturl',
  'token',
  'tokens',
  'tool_calls',
  'toolcalls',
]);

export const PUBLIC_SUBMISSION_UNSAFE_STRING_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:sk|pk)-[A-Za-z0-9_-]{12,}|[a-f0-9]{64}|(?:secret|token|credential|password|api[-_]?key)[-_:][A-Za-z0-9._~+/=-]{4,})\b|(?:^|\s)\/(?:Users|home|root|tmp|var|etc|workspace)\b|[A-Za-z]:[\\/][^\s"']*|\b(?:publicShareToken|public_share_token|definitionSnapshot|definition_snapshot|nodeData|node_data|checkpointData|checkpoint_data|toolCalls|tool_calls|sourceArtifactUrl|source_artifact_url|testReportUrl|test_report_url|inputParams|input_params|gateResults|gate_results)\b/i;

export const PUBLIC_SUBMISSION_REDACTED_VALUE = '[已移除内部内容]';

export function sanitizePublicSubmissionValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return PUBLIC_SUBMISSION_UNSAFE_STRING_PATTERN.test(value)
      ? PUBLIC_SUBMISSION_REDACTED_VALUE
      : value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizePublicSubmissionValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isForbiddenPublicSubmissionPayloadKey(key))
      .map(([key, nestedValue]) => [
        key,
        sanitizePublicSubmissionValue(nestedValue),
      ])
      .filter(([, nestedValue]) => nestedValue !== undefined),
  );
}

export function sanitizePublicWorkflowOutputValue(value: unknown): unknown {
  const sanitized = sanitizePublicSubmissionValue(value);
  if (typeof sanitized === 'string') {
    return limitPublicWorkflowOutputText(sanitized);
  }

  return sanitized;
}

export function limitPublicWorkflowOutputText(value: string): string {
  const trimmed = value.trim();

  return trimmed.length > GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_TEXT_LIMIT
    ? `${trimmed.slice(0, GENERATED_APP_PUBLIC_WORKFLOW_OUTPUT_TEXT_LIMIT)}...`
    : trimmed;
}

export function formatPublicWorkflowOutputValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return limitPublicWorkflowOutputText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const preferredParts = [
    formatPublicWorkflowOutputField('风险等级', value.riskLevel),
    formatPublicWorkflowOutputField('评分', value.score),
    formatPublicWorkflowOutputField('信号数量', value.signalCount),
    formatPublicWorkflowOutputField('模式', value.mode),
  ].filter((item): item is string => Boolean(item));

  const followUpQuestions = getStringArray(value.followUpQuestions);
  if (followUpQuestions.length > 0) {
    preferredParts.push(`追问：${followUpQuestions.slice(0, 2).join('；')}`);
  }

  if (preferredParts.length > 0) {
    return limitPublicWorkflowOutputText(preferredParts.join('；'));
  }

  return limitPublicWorkflowOutputText(JSON.stringify(value));
}

export function formatPublicWorkflowOutputField(
  label: string,
  value: unknown,
): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${label}=${String(value)}`;
  }

  const text = getNonEmptyString(value);

  return text ? `${label}=${text}` : null;
}

export function buildPublicWorkflowOutputReportItems(
  summary: Record<string, unknown> | undefined,
): string[] {
  const outputs = getRecordArray(summary?.publicOutputs);

  return outputs
    .map((output) => {
      const title = getNonEmptyString(output.title) ?? '业务输出';
      const value = formatPublicWorkflowOutputValue(output.value);

      return value ? `${title}：${value}` : null;
    })
    .filter((item): item is string => Boolean(item));
}

export function normalizePublicSubmissionPayloadKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function isForbiddenPublicSubmissionPayloadKey(key: string): boolean {
  const normalizedKey = normalizePublicSubmissionPayloadKey(key);

  return (
    PUBLIC_SUBMISSION_FORBIDDEN_RESULT_REPORT_KEYS.has(normalizedKey) ||
    normalizedKey.includes('apikey') ||
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('bearer') ||
    normalizedKey.includes('credential') ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('privatekey') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('stacktrace') ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('_token') ||
    normalizedKey.endsWith('tokens') ||
    normalizedKey.endsWith('_tokens')
  );
}

export function getWorkflowExecutionPublicStatusLabel(
  status: schema.WorkflowExecution['status'] | null,
): string {
  switch (status) {
    case 'pending':
      return '等待执行';
    case 'running':
      return '正在执行';
    case 'paused':
      return '已暂停';
    case 'completed':
      return '已完成';
    case 'failed':
      return '执行未完成';
    case 'cancelled':
      return '已取消';
    default:
      return '未创建';
  }
}

export function limitRepairAttemptText(value: string): string {
  const normalized = sanitizeRepairAttemptText(value).trim();

  if (normalized.length <= GENERATED_APP_REPAIR_ATTEMPT_TEXT_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(
    0,
    GENERATED_APP_REPAIR_ATTEMPT_TEXT_MAX_LENGTH - 3,
  )}...`;
}

export function sanitizeRepairAttemptText(value: string): string {
  return value
    .replace(/file:\/\/[^\s"']+/gi, PUBLIC_SUBMISSION_REDACTED_VALUE)
    .replace(
      /\/(?:Users|home|root|tmp|var|etc|workspace|opt|mnt)\/?[^\s"']*/gi,
      PUBLIC_SUBMISSION_REDACTED_VALUE,
    )
    .replace(
      /(^|[\s"'([{=])([a-zA-Z]:[\\/][^\s"']*)/g,
      `$1${PUBLIC_SUBMISSION_REDACTED_VALUE}`,
    )
    .replace(/\.\.[\\/][^\s"']*/g, PUBLIC_SUBMISSION_REDACTED_VALUE)
    .replace(/\b[a-f0-9]{64}\b/gi, PUBLIC_SUBMISSION_REDACTED_VALUE)
    .replace(
      /\b(?:sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/gi,
      PUBLIC_SUBMISSION_REDACTED_VALUE,
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
      `Bearer ${PUBLIC_SUBMISSION_REDACTED_VALUE}`,
    )
    .replace(
      /\b(?:publicShareToken|public_share_token|definitionSnapshot|definition_snapshot|workflowSnapshots|workflow_snapshots|workflowSnapshot|workflow_snapshot|pluginIds|plugin_ids|pluginId|plugin_id|stepData|step_data|steps|checkpointData|checkpoint_data|rawToolData|raw_tool_data|toolCalls|tool_calls|sourceArtifactUrl|source_artifact_url|testReportUrl|test_report_url|inputParams|input_params|gateResults|gate_results)\b/gi,
      PUBLIC_SUBMISSION_REDACTED_VALUE,
    )
    .replace(
      /\b(?:secret|token|credential|password|api[-_]?key)[-_:][A-Za-z0-9._~+/=-]{4,}/gi,
      PUBLIC_SUBMISSION_REDACTED_VALUE,
    );
}
