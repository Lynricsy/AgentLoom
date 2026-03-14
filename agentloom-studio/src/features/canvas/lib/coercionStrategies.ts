import type { CoercionStrategy } from '../types'
import type { PortDataType } from '../types/typeSchema'

const STRATEGY_LABELS: Record<CoercionStrategy, string> = {
  parseInt: 'Parse Integer',
  parseFloat: 'Parse Float',
  Number: 'To Number',
  toString: 'To String',
  toFixed: 'Fixed Decimal',
  'JSON.stringify': 'JSON Stringify',
  'JSON.parse': 'JSON Parse',
  first: 'First Element',
  last: 'Last Element',
  join: 'Join Array',
}

type CoercionKey = `${PortDataType}→${PortDataType}`

export const COERCION_REGISTRY = new Map<CoercionKey, CoercionStrategy[]>([
  ['text→json', ['parseInt', 'parseFloat', 'Number', 'JSON.parse']],
  ['json→text', ['toString', 'toFixed', 'JSON.stringify', 'first', 'last', 'join']],
])

export function getAvailableStrategies(
  sourceType: PortDataType,
  targetType: PortDataType,
): CoercionStrategy[] {
  if (sourceType === targetType) return []
  const key: CoercionKey = `${sourceType}→${targetType}`
  return COERCION_REGISTRY.get(key) ?? []
}

export function isCoercible(
  sourceType: PortDataType,
  targetType: PortDataType,
): boolean {
  return getAvailableStrategies(sourceType, targetType).length > 0
}

export function getStrategyLabel(strategy: CoercionStrategy): string {
  return STRATEGY_LABELS[strategy]
}
