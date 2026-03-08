import { memo, useCallback, useId, useState, type KeyboardEvent } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { LlmModelConfig, LlmProvider, LlmParameters } from '../types'
import { DEFAULT_LLM_PARAMETERS, LLM_PROVIDERS } from '../types'
import { ProviderIcon } from './ProviderIcon'

interface LlmModelConfigPanelProps {
  config: LlmModelConfig | null
  onChange: (config: LlmModelConfig) => void
  onClose: () => void
}

function createEmptyConfig(provider: LlmProvider = 'openai'): LlmModelConfig {
  const providerInfo = LLM_PROVIDERS.find((p) => p.id === provider)
  return {
    provider,
    modelId: providerInfo?.models[0] ?? '',
    modelName: providerInfo?.models[0] ?? '',
    parameters: { ...DEFAULT_LLM_PARAMETERS },
  }
}

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function SliderField({ label, value, min, max, step, onChange }: SliderFieldProps) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-foreground">{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  )
}

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  inputId?: string
}

function TagInput({ tags, onChange, inputId }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault()
        if (!tags.includes(inputValue.trim())) {
          onChange([...tags, inputValue.trim()])
        }
        setInputValue('')
      } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
        onChange(tags.slice(0, -1))
      }
    },
    [inputValue, tags, onChange],
  )

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index))
    },
    [tags, onChange],
  )

  return (
    <div className="flex min-h-[36px] flex-wrap gap-1 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-primary">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tags.indexOf(tag))}
            className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? '输入后回车添加' : ''}
        className="min-w-[60px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

export const LlmModelConfigPanel = memo(function LlmModelConfigPanel({
  config,
  onChange,
  onClose,
}: LlmModelConfigPanelProps) {
  const currentConfig = config ?? createEmptyConfig()
  const providerInfo = LLM_PROVIDERS.find((p) => p.id === currentConfig.provider)
  const modelSelectId = useId()
  const maxTokensId = useId()
  const stopSeqId = useId()

  const updateField = useCallback(
    <K extends keyof LlmModelConfig>(field: K, value: LlmModelConfig[K]) => {
      onChange({ ...currentConfig, [field]: value })
    },
    [currentConfig, onChange],
  )

  const updateParam = useCallback(
    <K extends keyof LlmParameters>(field: K, value: LlmParameters[K]) => {
      onChange({
        ...currentConfig,
        parameters: { ...currentConfig.parameters, [field]: value },
      })
    },
    [currentConfig, onChange],
  )

  const handleProviderChange = useCallback(
    (provider: LlmProvider) => {
      const newProviderInfo = LLM_PROVIDERS.find((p) => p.id === provider)
      onChange({
        ...currentConfig,
        provider,
        modelId: newProviderInfo?.models[0] ?? '',
        modelName: newProviderInfo?.models[0] ?? '',
      })
    },
    [currentConfig, onChange],
  )

  const handleResetParams = useCallback(() => {
    onChange({
      ...currentConfig,
      parameters: { ...DEFAULT_LLM_PARAMETERS },
    })
  }, [currentConfig, onChange])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">LLM 模型配置</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Provider</span>
          <div className="grid grid-cols-5 gap-1">
            {LLM_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderChange(p.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition-colors',
                  currentConfig.provider === p.id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted',
                )}
                title={p.description}
              >
                <ProviderIcon provider={p.id} size={18} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={modelSelectId} className="text-xs font-medium text-foreground">模型</label>
          <select
            id={modelSelectId}
            value={currentConfig.modelId}
            onChange={(e) => {
              updateField('modelId', e.target.value)
              updateField('modelName', e.target.value)
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {providerInfo?.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            {currentConfig.provider === 'custom' && (
              <option value="">自定义模型</option>
            )}
          </select>
          {currentConfig.provider === 'custom' && (
            <input
              type="text"
              value={currentConfig.modelId}
              onChange={(e) => {
                updateField('modelId', e.target.value)
                updateField('modelName', e.target.value)
              }}
              placeholder="输入自定义模型 ID"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-xs font-medium text-foreground">参数设置</span>
          <button
            type="button"
            onClick={handleResetParams}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            重置默认
          </button>
        </div>

        <SliderField
          label="Temperature"
          value={currentConfig.parameters.temperature}
          min={0}
          max={2}
          step={0.1}
          onChange={(v) => updateParam('temperature', v)}
        />

        <div className="space-y-1.5">
          <label htmlFor={maxTokensId} className="text-xs font-medium text-foreground">Max Tokens</label>
          <input
            id={maxTokensId}
            type="number"
            value={currentConfig.parameters.maxTokens ?? ''}
            onChange={(e) =>
              updateParam(
                'maxTokens',
                e.target.value ? parseInt(e.target.value, 10) : undefined,
              )
            }
            placeholder="默认（模型最大值）"
            min={1}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <SliderField
          label="Top P"
          value={currentConfig.parameters.topP}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateParam('topP', v)}
        />

        <SliderField
          label="Frequency Penalty"
          value={currentConfig.parameters.frequencyPenalty}
          min={-2}
          max={2}
          step={0.1}
          onChange={(v) => updateParam('frequencyPenalty', v)}
        />

        <SliderField
          label="Presence Penalty"
          value={currentConfig.parameters.presencePenalty}
          min={-2}
          max={2}
          step={0.1}
          onChange={(v) => updateParam('presencePenalty', v)}
        />

        <div className="space-y-1.5">
          <label htmlFor={stopSeqId} className="text-xs font-medium text-foreground">Stop Sequences</label>
          <TagInput
            inputId={stopSeqId}
            tags={currentConfig.parameters.stop}
            onChange={(tags) => updateParam('stop', tags)}
          />
        </div>
      </div>
    </div>
  )
})
