import type { AutonomyMode } from '@/features/canvas/autonomy.types'

export const AUTONOMY_MODES = ['MANUAL_CONFIRM', 'RULE_BASED', 'LLM_SUGGEST'] as const

export interface AutonomyModeOption {
  value: AutonomyMode
  label: string
  description: string
}

const AUTONOMY_MODE_META: Record<AutonomyMode, Omit<AutonomyModeOption, 'value'>> = {
  MANUAL_CONFIRM: {
    label: '手动确认',
    description: '缺失输入必须由人工确认后再继续执行，不做自动推断。',
  },
  RULE_BASED: {
    label: '规则补全',
    description: '仅按白名单字段进行规则补全，未命中时再走兜底策略。',
  },
  LLM_SUGGEST: {
    label: 'LLM 建议',
    description: 'LLM 可以给出建议，但建议可回退，不构成强承诺，仍可随时撤销或修改。',
  },
}

export const AUTONOMY_MODE_OPTIONS: AutonomyModeOption[] = AUTONOMY_MODES.map((value) => ({
  value,
  label: AUTONOMY_MODE_META[value].label,
  description: AUTONOMY_MODE_META[value].description,
}))

function getAutonomyModeRank(mode: AutonomyMode): number {
  return AUTONOMY_MODES.indexOf(mode)
}

export function isAutonomyMode(value: unknown): value is AutonomyMode {
  return AUTONOMY_MODES.includes(value as AutonomyMode)
}

export function compareAutonomyModes(left: AutonomyMode, right: AutonomyMode): number {
  return getAutonomyModeRank(left) - getAutonomyModeRank(right)
}

export function isAutonomyModeWithinCap(mode: AutonomyMode, cap: AutonomyMode): boolean {
  return compareAutonomyModes(mode, cap) <= 0
}

export function getAutonomyModeLabel(mode: AutonomyMode): string {
  return AUTONOMY_MODE_META[mode].label
}

export function getAutonomyModeDescription(mode: AutonomyMode): string {
  return AUTONOMY_MODE_META[mode].description
}

export function formatAutonomyModeValue(value?: string | null): string {
  if (!value) {
    return '—'
  }

  return isAutonomyMode(value) ? getAutonomyModeLabel(value) : value
}
