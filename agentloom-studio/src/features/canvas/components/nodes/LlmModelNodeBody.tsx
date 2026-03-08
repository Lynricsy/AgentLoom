import { memo } from 'react'
import { AlertTriangle, Brain } from 'lucide-react'
import {
  getLlmConfigState,
  getProviderInfo,
  parseLlmModelConfig,
  ProviderIcon,
} from '@/features/llm'

type LlmNodeVisualState = 'unconfigured' | 'configured' | 'warning'

interface LlmModelNodeBodyProps {
  config: Record<string, unknown>
  state?: LlmNodeVisualState
}

export const LlmModelNodeBody = memo(function LlmModelNodeBody({
  config,
  state,
}: LlmModelNodeBodyProps) {
  const llmConfig = parseLlmModelConfig(config)
  const resolvedState = state ?? getLlmConfigState(config)

  if (!llmConfig) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span>点击配置模型</span>
      </div>
    )
  }

  const providerInfo = getProviderInfo(llmConfig.provider)
  const hasWarning = resolvedState === 'warning'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <ProviderIcon
          provider={llmConfig.provider}
          size={14}
          className={hasWarning ? 'text-warning' : 'text-primary/80'}
        />
        <span className="truncate text-xs font-medium text-foreground">
          {providerInfo?.name ?? llmConfig.provider}
        </span>
        {hasWarning ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3" />
            缺少 API Key
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="truncate text-[11px] font-medium text-foreground">{llmConfig.modelName}</p>
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{llmConfig.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            t:{llmConfig.parameters.temperature.toFixed(1)}
          </span>
          {typeof llmConfig.parameters.maxTokens === 'number' ? (
            <span className="rounded bg-muted px-1.5 py-0.5">
              max:{llmConfig.parameters.maxTokens}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
})
