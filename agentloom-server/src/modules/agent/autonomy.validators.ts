import type {
  AutonomyConfig,
  AutonomyResolutionResult,
  InferenceAnnotation,
} from './dto/autonomy.dto';

const VALID_MODES = ['MANUAL_CONFIRM', 'RULE_BASED', 'LLM_SUGGEST'] as const;
const VALID_FALLBACK_STRATEGIES = [
  'REQUIRE_CONFIRMATION',
  'USE_DEFAULT',
  'SKIP_FIELD',
  'ABORT_EXECUTION',
] as const;
const VALID_SOURCES = ['rule', 'llm', 'default', 'user'] as const;

export function validateAutonomyConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('config 必须是非空对象');
    return errors;
  }

  const c = config as Record<string, unknown>;

  if (!VALID_MODES.includes(c.mode as (typeof VALID_MODES)[number])) {
    errors.push(
      `mode 必须是 ${VALID_MODES.join(' | ')}，收到: ${String(c.mode)}`,
    );
  }

  if (!Array.isArray(c.allowedInferenceFields)) {
    errors.push('allowedInferenceFields 必须是数组');
  } else if (
    c.allowedInferenceFields.some((f: unknown) => typeof f !== 'string')
  ) {
    errors.push('allowedInferenceFields 中的元素必须是字符串');
  }

  if (
    typeof c.confirmationThreshold !== 'number' ||
    c.confirmationThreshold < 0 ||
    c.confirmationThreshold > 1
  ) {
    errors.push('confirmationThreshold 必须是 0-1 之间的数字');
  }

  if (
    !VALID_FALLBACK_STRATEGIES.includes(
      c.fallbackStrategy as (typeof VALID_FALLBACK_STRATEGIES)[number],
    )
  ) {
    errors.push(
      `fallbackStrategy 必须是 ${VALID_FALLBACK_STRATEGIES.join(' | ')}，收到: ${String(c.fallbackStrategy)}`,
    );
  }

  return errors;
}

export function validateAnnotation(annotation: unknown): string[] {
  const errors: string[] = [];

  if (!annotation || typeof annotation !== 'object') {
    errors.push('annotation 必须是非空对象');
    return errors;
  }

  const a = annotation as Record<string, unknown>;

  if (typeof a.fieldPath !== 'string' || a.fieldPath.length === 0) {
    errors.push('fieldPath 必须是非空字符串');
  }

  if (!VALID_SOURCES.includes(a.source as (typeof VALID_SOURCES)[number])) {
    errors.push(
      `source 必须是 ${VALID_SOURCES.join(' | ')}，收到: ${String(a.source)}`,
    );
  }

  if (
    typeof a.confidence !== 'number' ||
    a.confidence < 0 ||
    a.confidence > 1
  ) {
    errors.push('confidence 必须是 0-1 之间的数字');
  }

  if (typeof a.requiresConfirmation !== 'boolean') {
    errors.push('requiresConfirmation 必须是布尔值');
  }

  if (typeof a.resolvedValueSummary !== 'string') {
    errors.push('resolvedValueSummary 必须是字符串');
  }

  return errors;
}

export function validateResolutionResult(result: unknown): string[] {
  const errors: string[] = [];

  if (!result || typeof result !== 'object') {
    errors.push('result 必须是非空对象');
    return errors;
  }

  const r = result as Record<string, unknown>;

  if (!r.resolvedInputs || typeof r.resolvedInputs !== 'object') {
    errors.push('resolvedInputs 必须是对象');
  }

  if (!Array.isArray(r.pendingConfirmations)) {
    errors.push('pendingConfirmations 必须是数组');
  }

  if (!Array.isArray(r.annotations)) {
    errors.push('annotations 必须是数组');
  } else {
    for (const [idx, ann] of (r.annotations as unknown[]).entries()) {
      for (const e of validateAnnotation(ann)) {
        errors.push(`annotations[${idx}]: ${e}`);
      }
    }
  }

  return errors;
}
