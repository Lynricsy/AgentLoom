import { memo } from 'react'
import { Brain } from 'lucide-react'
import type { LlmModelConfig } from '@/features/llm'
import { LLM_PROVIDERS } from '@/features/llm'

interface LlmModelNodeBodyProps {
  config: Record<string, unknown>
}

export const LlmModelNodeBody = memo(function LlmModelNodeBody({
  config,
}: LlmModelNodeBodyProps) {
  const llmConfig = config as Partial<LlmModelConfig> | undefined
  const provider = llmConfig?.provider
  const modelName = llmConfig?.modelName ?? llmConfig?.modelId

  const providerInfo = provider
    ? LLM_PROVIDERS.find((p) => p.id === provider)
    : null

  if (!provider) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span>点击配置模型</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        <span className="truncate text-xs font-medium">
          {providerInfo?.name ?? provider}
        </span>
      </div>
      {modelName && (
        <span className="truncate text-[11px] text-muted-foreground">
          {modelName}
        </span>
      )}
    </div>
  )
})
