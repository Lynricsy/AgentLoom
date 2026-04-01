/**
 * 条件节点共享类型定义
 *
 * Condition 节点与 break / continue 等控制流节点共用。
 */

import { createPort, type PortDefinition } from './nodeTypeRegistry'

export const CONDITION_EXEC_PORT_ID = 'exec-in'
export const CONDITION_VALUE_PORT_PREFIX = 'input-'
export const DEFAULT_CONDITION_VALUE_PORT_ID = `${CONDITION_VALUE_PORT_PREFIX}0`
export const CONDITION_EXPRESSION_PORT_PATTERN = /ports\[(\d+)\]/g

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
  sourcePortId: string
  fieldPath: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildConditionValueSchema(label: string) {
  return {
    kind: 'json' as const,
    shape: 'object' as const,
    title: label,
    properties: {},
    additionalProperties: true,
  }
}

function createConditionValuePort(id: string, index: number): PortDefinition {
  return createPort(id, `输入 ${index + 1}`, 'input', 'json', {
    acceptsAnyDataType: true,
    description: `第 ${index + 1} 个条件输入口，可接收任意上游端口值`,
    schema: buildConditionValueSchema(`输入 ${index + 1}`),
  })
}

export function getConditionValueInputPorts(
  inputPorts: readonly PortDefinition[],
): PortDefinition[] {
  return inputPorts.filter((port) => port.id !== CONDITION_EXEC_PORT_ID)
}

export function buildConditionInputPorts(
  count: number,
  previousValuePortIds?: readonly string[],
): PortDefinition[] {
  const safeCount = Math.max(1, Math.min(12, Math.floor(count)))
  const valuePorts = Array.from({ length: safeCount }, (_, index) =>
    createConditionValuePort(
      previousValuePortIds?.[index] ?? `${CONDITION_VALUE_PORT_PREFIX}${index}`,
      index,
    ),
  )

  return [
    createPort(CONDITION_EXEC_PORT_ID, '', 'input', 'exec', {
      description: '执行流入口，前序节点完成后触发条件判断',
    }),
    ...valuePorts,
  ]
}

export function getConditionPortOrder(
  inputPorts: readonly PortDefinition[],
): string[] {
  return getConditionValueInputPorts(inputPorts).map((port) => port.id)
}

function normalizeFieldPath(path: unknown): string {
  return typeof path === 'string' ? path.trim() : ''
}

function createRuleFromUnknown(
  raw: unknown,
  defaultPortId: string,
): ConditionRule {
  if (!isRecord(raw)) {
    return createDefaultRule(defaultPortId)
  }

  const sourcePortId =
    typeof raw.sourcePortId === 'string' && raw.sourcePortId.trim().length > 0
      ? (raw.sourcePortId === 'input-in' || raw.sourcePortId === 'input'
          ? defaultPortId
          : raw.sourcePortId.trim())
      : defaultPortId
  const fieldPath = normalizeFieldPath(raw.fieldPath ?? raw.path ?? raw.field)
  const operator =
    typeof raw.operator === 'string' && CONDITION_OPERATORS.includes(raw.operator as ConditionOperator)
      ? (raw.operator as ConditionOperator)
      : 'equals'
  const value = raw.value != null ? String(raw.value) : ''

  return {
    sourcePortId,
    fieldPath,
    operator,
    value,
  }
}

function normalizeConditionGroup(
  raw: unknown,
  defaultPortId: string,
): ConditionGroup {
  if (!isRecord(raw)) {
    return createDefaultConditionGroup(defaultPortId)
  }

  const logic: ConditionLogic = raw.logic === 'or' ? 'or' : 'and'
  const rules = Array.isArray(raw.rules)
    ? raw.rules.map((rule) => createRuleFromUnknown(rule, defaultPortId))
    : [createDefaultRule(defaultPortId)]

  return {
    logic,
    rules: rules.length > 0 ? rules : [createDefaultRule(defaultPortId)],
  }
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
export function createDefaultRule(
  sourcePortId = DEFAULT_CONDITION_VALUE_PORT_ID,
): ConditionRule {
  return {
    sourcePortId,
    fieldPath: '',
    operator: 'equals',
    value: '',
  }
}

/** 创建默认条件组 */
export function createDefaultConditionGroup(
  sourcePortId = DEFAULT_CONDITION_VALUE_PORT_ID,
): ConditionGroup {
  return { rules: [createDefaultRule(sourcePortId)], logic: 'and' }
}

/** 创建默认分支 */
export function createDefaultBranch(
  index: number,
  sourcePortId = DEFAULT_CONDITION_VALUE_PORT_ID,
): ConditionBranch {
  return {
    id: `branch-${index}`,
    label: index === 0 ? 'IF' : 'ELSE IF',
    conditions: createDefaultConditionGroup(sourcePortId),
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

function describeConditionSource(rule: ConditionRule): string {
  const match = rule.sourcePortId.match(/^input-(\d+)$/)
  const portLabel = match ? `ports[${Number(match[1]) + 1}]` : rule.sourcePortId
  if (!rule.fieldPath) {
    return portLabel
  }

  if (rule.fieldPath.startsWith('[')) {
    return `${portLabel}${rule.fieldPath}`
  }

  return `${portLabel}.${rule.fieldPath}`
}

/**
 * 格式化条件规则为摘要文本
 */
export function formatRuleSummary(rule: ConditionRule): string {
  const op = OPERATOR_META[rule.operator]
  if (!op) return ''

  const source = describeConditionSource(rule)

  if (!op.requiresValue) {
    return source ? `${source} ${op.label}` : op.label
  }

  if (!source && !rule.value) return ''
  if (!source) return `? ${op.label} ${rule.value}`
  if (!rule.value) return `${source} ${op.label} ?`
  return `${source} ${op.label} ${rule.value}`
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
  const firstPortId =
    Array.isArray(config.inputPorts) && config.inputPorts.length > 0
      ? getConditionPortOrder(config.inputPorts as PortDefinition[])[0] ?? DEFAULT_CONDITION_VALUE_PORT_ID
      : DEFAULT_CONDITION_VALUE_PORT_ID

  // 已经是新格式
  if (Array.isArray(config.branches)) {
    return {
      branches: config.branches.map((branch, index) => {
        if (!isRecord(branch)) {
          return createDefaultBranch(index, firstPortId)
        }

        return {
          id:
            typeof branch.id === 'string' && branch.id.trim().length > 0
              ? branch.id
              : `branch-${index}`,
          label: index === 0 ? 'IF' : 'ELSE IF',
          conditions: normalizeConditionGroup(branch.conditions, firstPortId),
          mode: branch.mode === 'expression' ? 'expression' : 'visual',
          expression:
            typeof branch.expression === 'string' ? branch.expression : '',
        }
      }),
    }
  }

  const mode = config.mode

  if (mode === 'expression') {
    const expression = typeof config.expression === 'string' ? config.expression : ''
    return {
      branches: [
        {
          id: 'branch-0',
          label: 'IF',
          conditions: createDefaultConditionGroup(firstPortId),
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
            rules: [
              {
                sourcePortId: firstPortId,
                fieldPath: field,
                operator: 'equals',
                value,
              },
            ],
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

export interface ConditionExpressionRewriteResult {
  ok: boolean
  expression: string
  error?: string
}

export function rewriteConditionExpressionPorts(
  expression: string,
  previousPortOrder: readonly string[],
  nextPortOrder: readonly string[],
): ConditionExpressionRewriteResult {
  if (!expression.trim()) {
    return { ok: true, expression }
  }

  let error: string | undefined
  const rewritten = expression.replace(
    CONDITION_EXPRESSION_PORT_PATTERN,
    (fullMatch, rawIndex) => {
      const oldIndex = Number.parseInt(rawIndex, 10)
      if (!Number.isFinite(oldIndex) || oldIndex <= 0) {
        error = `无法解析表达式中的端口引用：${fullMatch}`
        return fullMatch
      }

      const previousPortId = previousPortOrder[oldIndex - 1]
      if (!previousPortId) {
        error = `表达式引用了不存在的输入端口：${fullMatch}`
        return fullMatch
      }

      const nextIndex = nextPortOrder.indexOf(previousPortId)
      if (nextIndex === -1) {
        error = `表达式仍然引用了已删除的输入端口：${fullMatch}`
        return fullMatch
      }

      return `ports[${nextIndex + 1}]`
    },
  )

  return error
    ? { ok: false, expression, error }
    : { ok: true, expression: rewritten }
}

export function rewriteConditionBranchExpressions(
  branches: readonly ConditionBranch[],
  previousPortOrder: readonly string[],
  nextPortOrder: readonly string[],
): { ok: true; branches: ConditionBranch[] } | { ok: false; error: string } {
  const nextBranches: ConditionBranch[] = []

  for (const branch of branches) {
    if (branch.mode !== 'expression') {
      nextBranches.push(branch)
      continue
    }

    const rewritten = rewriteConditionExpressionPorts(
      branch.expression,
      previousPortOrder,
      nextPortOrder,
    )
    if (!rewritten.ok) {
      return { ok: false, error: rewritten.error ?? '条件表达式迁移失败' }
    }

    nextBranches.push({
      ...branch,
      expression: rewritten.expression,
    })
  }

  return { ok: true, branches: nextBranches }
}

export function renumberConditionBranches(
  branches: readonly ConditionBranch[],
): ConditionBranch[] {
  return branches.map((branch, index) => ({
    ...branch,
    id: `branch-${index}`,
    label: index === 0 ? 'IF' : 'ELSE IF',
  }))
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
      .map((r) => createRuleFromUnknown(r, DEFAULT_CONDITION_VALUE_PORT_ID))
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
