/**
 * 条件节点共享类型定义
 *
 * 同时被 Condition 节点和 Loop 节点的停止条件复用。
 */

import { createPort, type PortDefinition } from './nodeTypeRegistry'

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'regex_match',
] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export type ConditionLogic = 'and' | 'or'

export interface ConditionRule {
  field: string
  operator: ConditionOperator
  value: string
}

export interface ConditionGroup {
  rules: ConditionRule[]
  logic: ConditionLogic
}

export interface ConditionBranch {
  id: string
  label: string
  conditions: ConditionGroup
  mode: 'visual' | 'expression'
  expression: string
}

export interface ConditionNodeConfig {
  branches: ConditionBranch[]
}

/** 运算符元数据 */
export interface OperatorMeta {
  label: string
  requiresValue: boolean
}

export const OPERATOR_META: Record<ConditionOperator, OperatorMeta> = {
  equals: { label: '等于', requiresValue: true },
  not_equals: { label: '不等于', requiresValue: true },
  contains: { label: '包含', requiresValue: true },
  not_contains: { label: '不包含', requiresValue: true },
  gt: { label: '大于', requiresValue: true },
  gte: { label: '大于等于', requiresValue: true },
  lt: { label: '小于', requiresValue: true },
  lte: { label: '小于等于', requiresValue: true },
  starts_with: { label: '以...开头', requiresValue: true },
  ends_with: { label: '以...结尾', requiresValue: true },
  is_empty: { label: '为空', requiresValue: false },
  is_not_empty: { label: '不为空', requiresValue: false },
  regex_match: { label: '正则匹配', requiresValue: true },
}

/** 创建默认条件规则 */
export function createDefaultRule(): ConditionRule {
  return { field: '', operator: 'equals', value: '' }
}

/** 创建默认条件组 */
export function createDefaultConditionGroup(): ConditionGroup {
  return { rules: [createDefaultRule()], logic: 'and' }
}

/** 创建默认分支 */
export function createDefaultBranch(index: number): ConditionBranch {
  return {
    id: `branch-${index}`,
    label: index === 0 ? 'IF' : 'ELSE IF',
    conditions: createDefaultConditionGroup(),
    mode: 'visual',
    expression: '',
  }
}

/** 默认条件节点配置 */
export function createDefaultConditionNodeConfig(): ConditionNodeConfig {
  return {
    branches: [createDefaultBranch(0)],
  }
}

/**
 * 格式化条件规则为摘要文本
 */
export function formatRuleSummary(rule: ConditionRule): string {
  const op = OPERATOR_META[rule.operator]
  if (!op) return ''

  if (!op.requiresValue) {
    return rule.field ? `${rule.field} ${op.label}` : op.label
  }

  if (!rule.field && !rule.value) return ''
  if (!rule.field) return `? ${op.label} ${rule.value}`
  if (!rule.value) return `${rule.field} ${op.label} ?`
  return `${rule.field} ${op.label} ${rule.value}`
}

/**
 * 格式化分支的条件摘要（多条规则）
 */
export function formatBranchSummary(branch: ConditionBranch): string {
  if (branch.mode === 'expression') {
    return branch.expression || ''
  }

  const { rules, logic } = branch.conditions
  if (rules.length === 0) return ''

  const summaries = rules
    .map(formatRuleSummary)
    .filter((s) => s.length > 0)

  if (summaries.length === 0) return ''
  if (summaries.length === 1) return summaries[0] ?? ''
  return summaries.join(logic === 'and' ? ' && ' : ' || ')
}

/**
 * 从旧格式 config 迁移到新格式
 */
export function migrateConditionConfig(
  config: Record<string, unknown>,
): ConditionNodeConfig {
  // 已经是新格式
  if (Array.isArray(config.branches)) {
    return config as unknown as ConditionNodeConfig
  }

  const mode = config.mode

  if (mode === 'expression') {
    const expression = typeof config.expression === 'string' ? config.expression : ''
    return {
      branches: [
        {
          id: 'branch-0',
          label: 'IF',
          conditions: createDefaultConditionGroup(),
          mode: 'expression',
          expression,
        },
      ],
    }
  }

  if (mode === 'field-comparison') {
    const field = typeof config.conditionField === 'string' ? config.conditionField : ''
    const value = config.expectedValue != null ? String(config.expectedValue) : ''
    return {
      branches: [
        {
          id: 'branch-0',
          label: 'IF',
          conditions: {
            rules: [{ field, operator: 'equals', value }],
            logic: 'and',
          },
          mode: 'visual',
          expression: '',
        },
      ],
    }
  }

  // 完全空 config
  return createDefaultConditionNodeConfig()
}

// ── Loop 节点配置类型 ───────────────────────────────────────────

export type StopConditionMode = 'none' | 'condition' | 'expression'

export type ErrorStrategy = 'stop' | 'skip' | 'collect'

export interface LoopNodeConfig {
  maxIterations: number
  stopConditionMode: StopConditionMode
  stopCondition: ConditionGroup | null
  stopExpression: string
  errorStrategy: ErrorStrategy
}

/** 创建默认循环节点配置 */
export function createDefaultLoopNodeConfig(): LoopNodeConfig {
  return {
    maxIterations: 10,
    stopConditionMode: 'none',
    stopCondition: null,
    stopExpression: '',
    errorStrategy: 'stop',
  }
}

/** 从原始 config 对象解析 LoopNodeConfig（兼容旧格式） */
export function parseLoopNodeConfig(config: Record<string, unknown>): LoopNodeConfig {
  const maxIterations =
    typeof config.maxIterations === 'number' && config.maxIterations > 0
      ? Math.floor(config.maxIterations)
      : 10

  const rawMode = config.stopConditionMode
  const stopConditionMode: StopConditionMode =
    rawMode === 'condition' || rawMode === 'expression' ? rawMode : 'none'

  let stopCondition: ConditionGroup | null = null
  if (
    config.stopCondition !== null &&
    config.stopCondition !== undefined &&
    typeof config.stopCondition === 'object' &&
    !Array.isArray(config.stopCondition)
  ) {
    const raw = config.stopCondition as Record<string, unknown>
    const logic = raw.logic === 'or' ? 'or' : 'and'
    const rawRules = Array.isArray(raw.rules) ? raw.rules : []
    const rules = rawRules
      .filter(
        (r): r is Record<string, unknown> =>
          typeof r === 'object' && r !== null && !Array.isArray(r),
      )
      .map((r) => ({
        field: typeof r.field === 'string' ? r.field : '',
        operator: (typeof r.operator === 'string' ? r.operator : 'equals') as ConditionOperator,
        value: typeof r.value === 'string' ? r.value : '',
      }))
    stopCondition = { rules, logic }
  }

  const stopExpression =
    typeof config.stopExpression === 'string' ? config.stopExpression : ''

  const rawErrorStrategy = config.errorStrategy
  const errorStrategy: ErrorStrategy =
    rawErrorStrategy === 'skip' || rawErrorStrategy === 'collect'
      ? rawErrorStrategy
      : 'stop'

  return {
    maxIterations,
    stopConditionMode,
    stopCondition,
    stopExpression,
    errorStrategy,
  }
}

/** 格式化停止条件摘要 */
export function formatStopConditionSummary(config: LoopNodeConfig): string {
  if (config.stopConditionMode === 'none') return ''

  if (config.stopConditionMode === 'expression') {
    return config.stopExpression || ''
  }

  if (config.stopConditionMode === 'condition' && config.stopCondition) {
    const { rules, logic } = config.stopCondition
    if (rules.length === 0) return ''

    const summaries = rules
      .map(formatRuleSummary)
      .filter((s) => s.length > 0)

    if (summaries.length === 0) return ''
    if (summaries.length === 1) return summaries[0] ?? ''
    return summaries.join(logic === 'and' ? ' && ' : ' || ')
  }

  return ''
}

const ERROR_STRATEGY_LABELS: Record<ErrorStrategy, string> = {
  stop: '停止循环',
  skip: '跳过并继续',
  collect: '收集错误继续',
}

/** 获取错误处理策略的中文标签 */
export function getErrorStrategyLabel(strategy: ErrorStrategy): string {
  return ERROR_STRATEGY_LABELS[strategy] ?? '停止循环'
}

/**
 * 从分支数组生成条件节点的动态输出端口
 */
export function buildConditionOutputPorts(branches: ConditionBranch[]): PortDefinition[] {
  const ports: PortDefinition[] = branches.map((branch) =>
    createPort(branch.id, branch.label, 'output', 'json', {
      description: `条件匹配时数据从此分支输出，标签由用户在分支规则中定义`,
    }),
  )
  ports.push(
    createPort('else', 'ELSE', 'output', 'json', {
      description: '兜底分支，当所有条件均不满足时数据从此输出',
    }),
  )
  return ports
}

// ── Merge 节点配置类型 ────────────────────────────────────────────

export type MergeMode = 'append' | 'merge-by-key'

export interface MergeNodeConfig {
  mode: MergeMode
  mergeKey: string
  inputCount: number
}

/** 创建默认 Merge 节点配置 */
export function createDefaultMergeNodeConfig(): MergeNodeConfig {
  return {
    mode: 'append',
    mergeKey: '',
    inputCount: 2,
  }
}

/** 从原始 config 对象解析 MergeNodeConfig */
export function parseMergeNodeConfig(config: Record<string, unknown>): MergeNodeConfig {
  const rawMode = config.mode
  const mode: MergeMode = rawMode === 'merge-by-key' ? 'merge-by-key' : 'append'

  const mergeKey = typeof config.mergeKey === 'string' ? config.mergeKey : ''

  const rawCount =
    typeof config.inputCount === 'number' ? config.inputCount : 2
  const inputCount = Math.max(2, Math.min(10, Math.floor(rawCount)))

  return { mode, mergeKey, inputCount }
}

const MERGE_MODE_LABELS: Record<MergeMode, string> = {
  append: '追加拼接',
  'merge-by-key': '按键合并',
}

/** 获取合并模式的中文标签 */
export function getMergeModeLabel(mode: MergeMode): string {
  return MERGE_MODE_LABELS[mode] ?? '追加拼接'
}

/**
 * 从 inputCount 生成 Merge 节点的动态输入端口
 */
export function buildMergeInputPorts(inputCount: number): PortDefinition[] {
  const count = Math.max(2, Math.min(10, Math.floor(inputCount)))
  return Array.from({ length: count }, (_, i) =>
    createPort(`input-${i}`, `输入 ${i + 1}`, 'input', 'json', {
      description: `第 ${i + 1} 路输入，等待所有输入就绪后进行合并`,
    }),
  )
}
