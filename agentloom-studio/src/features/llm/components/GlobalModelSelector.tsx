import { useMemo } from 'react'
import { Select, type SelectProps } from '@/shared/ui/select'
import { useLlmModels, useLlmProviders } from '../hooks/useLlmModels'
import type { LlmModelInfo, LlmProviderEntity } from '../types'

interface ProviderModelGroup {
  provider: LlmProviderEntity
  models: LlmModelInfo[]
}

export interface GlobalModelSelectorProps
  extends Omit<SelectProps, 'value' | 'onValueChange' | 'children'> {
  /** 当前选中的模型配置 ID */
  value: string
  /** 选中值变更回调 */
  onValueChange: (value: string) => void
  /** 过滤模型类型，不传则显示全部 */
  modelType?: 'chat' | 'embedding'
  /** 空选项的显示文本 */
  placeholder?: string
  /** 仅显示已启用的模型（默认 true） */
  enabledOnly?: boolean
}

/**
 * 全局模型选择器 — 按 Provider 分组，仅显示已启用的 Provider 和模型。
 * 使用 `<optgroup>` 实现 Provider 分组。
 */
export function GlobalModelSelector({
  value,
  onValueChange,
  modelType,
  placeholder = '请选择模型',
  enabledOnly = true,
  ...selectProps
}: GlobalModelSelectorProps) {
  const { data: providers } = useLlmProviders()
  const { data: models } = useLlmModels()

  const groups = useMemo<ProviderModelGroup[]>(() => {
    if (!providers || !models) return []

    // 按 sortOrder 排序 + 仅已启用的 Provider
    const enabledProviders = enabledOnly
      ? providers.filter((p) => p.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder)
      : [...providers].sort((a, b) => a.sortOrder - b.sortOrder)

    const providerMap = new Map(enabledProviders.map((p) => [p.id, p]))

    // 按 Provider 分组
    const groupMap = new Map<string, LlmModelInfo[]>()

    for (const model of models) {
      // 过滤模型类型
      if (modelType && model.modelType !== modelType) continue
      // 过滤已启用
      if (enabledOnly && !model.isEnabled) continue
      // 过滤 Provider 是否启用
      if (!providerMap.has(model.providerId)) continue

      const existing = groupMap.get(model.providerId) ?? []
      existing.push(model)
      groupMap.set(model.providerId, existing)
    }

    const result: ProviderModelGroup[] = []
    for (const provider of enabledProviders) {
      const providerModels = groupMap.get(provider.id)
      if (providerModels && providerModels.length > 0) {
        result.push({ provider, models: providerModels })
      }
    }

    return result
  }, [providers, models, modelType, enabledOnly])

  return (
    <Select value={value} onValueChange={onValueChange} {...selectProps}>
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.provider.id} label={group.provider.name}>
          {group.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.modelId})
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
