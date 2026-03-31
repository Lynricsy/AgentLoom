import { memo } from 'react'
import { AlertTriangle, Brain, Server } from 'lucide-react'
import {
  getLlmConfigState,
  getProviderInfo,
  parseLlmModelConfig,
  ProviderIcon,
} from '@/features/llm'
import { NodeBadge } from '../shared/NodeBadge'

type LlmNodeVisualState = 'unconfigured' | 'configured' | 'warning'

interface LlmModelNodeBodyProps {
  source: Record<string, unknown>
  state?: LlmNodeVisualState
}

function extractHostname(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const MAX_VISIBLE_BADGES = 3

export const LlmModelNodeBody = memo(function LlmModelNodeBody({
  source,
  state,
}: LlmModelNodeBodyProps) {
  const llmConfig = parseLlmModelConfig(source)
  const resolvedState = state ?? getLlmConfigState(source)

  if (!llmConfig) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span>点击配置模型</span>
      </div>
    )
  }

  const providerInfo = getProviderInfo(llmConfig.provider)
  const hasWarning = resolvedState === 'warning'
  const isPrivateCloud = llmConfig.provider === 'private_cloud'

  const warningLabel = isPrivateCloud
    ? (!llmConfig.endpointUrl
        ? '缺少端点'
        : llmConfig.authMethod === 'api_key' && !llmConfig.apiKeyId
          ? '缺少 API Key'
          : '缺少模型')
    : '缺少 API Key'

  // 收集参数 badges
  const paramBadges: { key: string; label: string }[] = [
    { key: 'name', label: llmConfig.name },
    { key: 'temp', label: `t:${llmConfig.parameters.temperature.toFixed(1)}` },
  ]
  if (typeof llmConfig.parameters.maxTokens === 'number') {
    paramBadges.push({ key: 'max', label: `max:${llmConfig.parameters.maxTokens}` })
  }

  const visibleBadges = paramBadges.slice(0, MAX_VISIBLE_BADGES)
  const overflowCount = paramBadges.length - MAX_VISIBLE_BADGES

  return (
    <div className="flex flex-col gap-2">
      {/* Provider : Model (merged into one line) */}
      <div className="flex items-center gap-1">
        <ProviderIcon
          provider={llmConfig.provider}
          size={14}
          className={hasWarning ? 'text-warning' : 'text-primary/80'}
        />
        <span className="truncate font-medium text-foreground">
          {providerInfo?.name ?? llmConfig.provider}: {llmConfig.modelName}
        </span>
        {hasWarning ? (
          <NodeBadge variant="status" color="warning" className="shrink-0">
            <AlertTriangle className="h-3 w-3" />
            {warningLabel}
          </NodeBadge>
        ) : null}
      </div>

      {/* Parameter badges */}
      <div className="flex flex-wrap gap-1">
        {visibleBadges.map((badge) => (
          <NodeBadge key={badge.key} variant="info" color="default">
            {badge.label}
          </NodeBadge>
        ))}
        {overflowCount > 0 ? (
          <NodeBadge variant="info" color="muted">
            +{overflowCount}
          </NodeBadge>
        ) : null}
      </div>

      {/* Private cloud endpoint (optional) */}
      {isPrivateCloud && llmConfig.endpointUrl ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Server className="h-3 w-3 shrink-0" />
          <span className="truncate">{extractHostname(llmConfig.endpointUrl)}</span>
          {llmConfig.authMethod ? (
            <NodeBadge variant="info" color="default">
              {llmConfig.authMethod === 'api_key' ? 'Key' : llmConfig.authMethod}
            </NodeBadge>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
