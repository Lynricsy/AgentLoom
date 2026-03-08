import { z } from 'zod'

// ── 核心枚举 Schema ──────────────────────────────────────────────

export const AutonomyModeSchema = z.enum([
  'MANUAL_CONFIRM',
  'RULE_BASED',
  'LLM_SUGGEST',
])
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>

export const FallbackStrategySchema = z.enum([
  'REQUIRE_CONFIRMATION',
  'USE_DEFAULT',
  'SKIP_FIELD',
  'ABORT_EXECUTION',
])
export type FallbackStrategy = z.infer<typeof FallbackStrategySchema>

export const InferenceSourceSchema = z.enum(['rule', 'llm', 'default', 'user'])
export type InferenceSource = z.infer<typeof InferenceSourceSchema>

// ── 配置 Schema ──────────────────────────────────────────────────

export const AutonomyConfigSchema = z.object({
  mode: AutonomyModeSchema,
  allowedInferenceFields: z.array(z.string()),
  confirmationThreshold: z.number().min(0).max(1),
  fallbackStrategy: FallbackStrategySchema,
})
export type AutonomyConfig = z.infer<typeof AutonomyConfigSchema>

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  mode: 'MANUAL_CONFIRM',
  allowedInferenceFields: [],
  confirmationThreshold: 0.8,
  fallbackStrategy: 'REQUIRE_CONFIRMATION',
}

// ── 推断注解 Schema ──────────────────────────────────────────────

export const InferenceAnnotationSchema = z.object({
  fieldPath: z.string(),
  source: InferenceSourceSchema,
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
  resolvedValueSummary: z.string(),
})
export type InferenceAnnotation = z.infer<typeof InferenceAnnotationSchema>

// ── 待确认与解析结果 Schema ──────────────────────────────────────

export const PendingConfirmationSchema = z.object({
  fieldPath: z.string(),
  reason: z.string(),
  suggestedValue: z.unknown().optional(),
  fallbackInfo: z
    .object({
      strategy: FallbackStrategySchema,
      defaultValue: z.unknown().optional(),
    })
    .optional(),
})
export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>

export const AutonomyResolutionResultSchema = z.object({
  resolvedInputs: z.record(z.string(), z.unknown()),
  pendingConfirmations: z.array(PendingConfirmationSchema),
  annotations: z.array(InferenceAnnotationSchema),
})
export type AutonomyResolutionResult = z.infer<
  typeof AutonomyResolutionResultSchema
>
