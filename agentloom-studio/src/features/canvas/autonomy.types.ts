// ── 自主决策模式数据模型 ──────────────────────────────────────────

export type AutonomyMode = 'MANUAL_CONFIRM' | 'RULE_BASED' | 'LLM_SUGGEST'

export type FallbackStrategy =
  | 'REQUIRE_CONFIRMATION'
  | 'USE_DEFAULT'
  | 'SKIP_FIELD'
  | 'ABORT_EXECUTION'

// ── 配置 ────────────────────────────────────────────────────────

export interface AutonomyConfig {
  mode: AutonomyMode
  /** 允许自动推断的字段路径白名单 */
  allowedInferenceFields: string[]
  /** 推断确认阈值（0-1），低于此值需要人工确认 */
  confirmationThreshold: number
  fallbackStrategy: FallbackStrategy
}

// ── 推断注解 ─────────────────────────────────────────────────────

export type InferenceSource = 'rule' | 'llm' | 'default' | 'user'

/** 单个字段的推断注解，记录该字段是如何被解析的 */
export interface InferenceAnnotation {
  fieldPath: string
  source: InferenceSource
  /** 推断置信度（0-1） */
  confidence: number
  requiresConfirmation: boolean
  /** 已解析值的摘要（用于 UI 展示，避免暴露完整值） */
  resolvedValueSummary: string
}

// ── 待确认与解析结果 ─────────────────────────────────────────────

export interface PendingConfirmation {
  fieldPath: string
  reason: string
  /** 建议值（仅在 LLM_SUGGEST / RULE_BASED 模式有值） */
  suggestedValue?: unknown
  fallbackInfo?: {
    strategy: FallbackStrategy
    defaultValue?: unknown
  }
}

export interface AutonomyResolutionResult {
  /** 已解析的输入（fieldPath → value） */
  resolvedInputs: Record<string, unknown>
  pendingConfirmations: PendingConfirmation[]
  annotations: InferenceAnnotation[]
}

// ── 默认配置 ─────────────────────────────────────────────────────

/** 默认自主决策配置：全手动确认模式 */
export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  mode: 'MANUAL_CONFIRM',
  allowedInferenceFields: [],
  confirmationThreshold: 0.8,
  fallbackStrategy: 'REQUIRE_CONFIRMATION',
} as const
