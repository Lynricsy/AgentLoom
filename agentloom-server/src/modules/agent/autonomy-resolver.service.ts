import { Injectable } from '@nestjs/common'
import type {
  AutonomyConfig,
  AutonomyResolutionResult,
  InferenceAnnotation,
  PendingConfirmation,
} from './dto/autonomy.dto'
import { DEFAULT_AUTONOMY_CONFIG } from './dto/autonomy.dto'

export interface InputContext {
  requiredFields: string[]
  providedInputs: Record<string, unknown>
  fieldDefaults?: Record<string, unknown>
}

@Injectable()
export class AutonomyResolverService {
  resolveInputs(
    config: unknown,
    context: InputContext,
  ): AutonomyResolutionResult {
    const normalizedConfig = this.normalizeConfig(config)
    const missingFields = this.findMissingFields(context)

    switch (normalizedConfig.mode) {
      case 'MANUAL_CONFIRM':
        return this.resolveManualConfirm(missingFields, context)
      case 'RULE_BASED':
        return this.resolveRuleBased(normalizedConfig, missingFields, context)
      case 'LLM_SUGGEST':
        return this.resolveLlmSuggest(normalizedConfig, missingFields, context)
      default:
        return this.resolveManualConfirm(missingFields, context)
    }
  }

  findMissingFields(context: InputContext): string[] {
    return context.requiredFields.filter((field) => {
      const value = context.providedInputs[field]
      return value === undefined || value === null
    })
  }

  private resolveManualConfirm(
    missingFields: string[],
    context: InputContext,
  ): AutonomyResolutionResult {
    const resolvedInputs: Record<string, unknown> = {
      ...context.providedInputs,
    }
    const pendingConfirmations: PendingConfirmation[] = missingFields.map(
      (field) => ({
        fieldPath: field,
        reason: `字段 "${field}" 缺失，需要人工确认`,
      }),
    )
    const annotations: InferenceAnnotation[] = Object.keys(
      context.providedInputs,
    )
      .filter((key) => context.providedInputs[key] !== undefined && context.providedInputs[key] !== null)
      .map((key) => ({
        fieldPath: key,
        source: 'user' as const,
        confidence: 1.0,
        requiresConfirmation: false,
        resolvedValueSummary: this.summarizeValue(context.providedInputs[key]),
      }))

    return { resolvedInputs, pendingConfirmations, annotations }
  }

  private resolveRuleBased(
    config: AutonomyConfig,
    missingFields: string[],
    context: InputContext,
  ): AutonomyResolutionResult {
    const resolvedInputs: Record<string, unknown> = {
      ...context.providedInputs,
    }
    const pendingConfirmations: PendingConfirmation[] = []
    const annotations: InferenceAnnotation[] = []

    for (const key of Object.keys(context.providedInputs)) {
      if (context.providedInputs[key] !== undefined && context.providedInputs[key] !== null) {
        annotations.push({
          fieldPath: key,
          source: 'user',
          confidence: 1.0,
          requiresConfirmation: false,
          resolvedValueSummary: this.summarizeValue(context.providedInputs[key]),
        })
      }
    }

    for (const field of missingFields) {
      const isAllowed = config.allowedInferenceFields.includes(field)
      const hasDefault =
        context.fieldDefaults && context.fieldDefaults[field] !== undefined

      if (isAllowed && hasDefault) {
        const defaultValue = context.fieldDefaults![field]
        resolvedInputs[field] = defaultValue
        annotations.push({
          fieldPath: field,
          source: 'rule',
          confidence: 1.0,
          requiresConfirmation: false,
          resolvedValueSummary: this.summarizeValue(defaultValue),
        })
      } else {
        pendingConfirmations.push({
          fieldPath: field,
          reason: isAllowed
            ? `字段 "${field}" 在白名单中但无默认值`
            : `字段 "${field}" 不在推断白名单中`,
        })
      }
    }

    return { resolvedInputs, pendingConfirmations, annotations }
  }

  private resolveLlmSuggest(
    config: AutonomyConfig,
    missingFields: string[],
    context: InputContext,
  ): AutonomyResolutionResult {
    const resolvedInputs: Record<string, unknown> = {
      ...context.providedInputs,
    }
    const pendingConfirmations: PendingConfirmation[] = []
    const annotations: InferenceAnnotation[] = []

    for (const key of Object.keys(context.providedInputs)) {
      if (context.providedInputs[key] !== undefined && context.providedInputs[key] !== null) {
        annotations.push({
          fieldPath: key,
          source: 'user',
          confidence: 1.0,
          requiresConfirmation: false,
          resolvedValueSummary: this.summarizeValue(context.providedInputs[key]),
        })
      }
    }

    for (const field of missingFields) {
      const hasDefault =
        context.fieldDefaults && context.fieldDefaults[field] !== undefined

      if (hasDefault) {
        const defaultValue = context.fieldDefaults![field]
        resolvedInputs[field] = defaultValue

        pendingConfirmations.push({
          fieldPath: field,
          reason: `LLM 建议使用默认值，需要用户确认`,
          suggestedValue: defaultValue,
          fallbackInfo: {
            strategy: config.fallbackStrategy,
            defaultValue,
          },
        })
        annotations.push({
          fieldPath: field,
          source: 'default',
          confidence: 0.5,
          requiresConfirmation: true,
          resolvedValueSummary: this.summarizeValue(defaultValue),
        })
      } else {
        pendingConfirmations.push({
          fieldPath: field,
          reason: `字段 "${field}" 缺失且无默认值可建议`,
          fallbackInfo: {
            strategy: config.fallbackStrategy,
          },
        })
      }
    }

    return { resolvedInputs, pendingConfirmations, annotations }
  }

  summarizeValue(value: unknown): string {
    if (value === null || value === undefined) return '<空>'
    if (typeof value === 'string') {
      return value.length > 50 ? `${value.slice(0, 50)}...` : value
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (Array.isArray(value)) return `[数组: ${value.length} 项]`
    if (typeof value === 'object') return `{对象: ${Object.keys(value).length} 键}`
    return String(value)
  }

  private normalizeConfig(config: unknown): AutonomyConfig {
    if (!this.isRecord(config)) {
      return { ...DEFAULT_AUTONOMY_CONFIG }
    }

    return {
      mode: this.isAutonomyMode(config.mode)
        ? config.mode
        : DEFAULT_AUTONOMY_CONFIG.mode,
      allowedInferenceFields: Array.isArray(config.allowedInferenceFields)
        ? config.allowedInferenceFields.filter(
            (field): field is string => typeof field === 'string',
          )
        : [...DEFAULT_AUTONOMY_CONFIG.allowedInferenceFields],
      confirmationThreshold: this.isConfirmationThreshold(
        config.confirmationThreshold,
      )
        ? config.confirmationThreshold
        : DEFAULT_AUTONOMY_CONFIG.confirmationThreshold,
      fallbackStrategy: this.isFallbackStrategy(config.fallbackStrategy)
        ? config.fallbackStrategy
        : DEFAULT_AUTONOMY_CONFIG.fallbackStrategy,
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private isAutonomyMode(mode: unknown): mode is AutonomyConfig['mode'] {
    return (
      mode === 'MANUAL_CONFIRM' ||
      mode === 'RULE_BASED' ||
      mode === 'LLM_SUGGEST'
    )
  }

  private isFallbackStrategy(
    strategy: unknown,
  ): strategy is AutonomyConfig['fallbackStrategy'] {
    return (
      strategy === 'REQUIRE_CONFIRMATION' ||
      strategy === 'USE_DEFAULT' ||
      strategy === 'SKIP_FIELD' ||
      strategy === 'ABORT_EXECUTION'
    )
  }

  private isConfirmationThreshold(value: unknown): value is number {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    )
  }
}
