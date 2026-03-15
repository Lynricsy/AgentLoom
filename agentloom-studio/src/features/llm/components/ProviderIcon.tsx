import { memo } from 'react'
import { Bot, Globe, Search, Server, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import type { LlmProvider } from '../types'

const PROVIDER_ICONS: Record<LlmProvider, LucideIcon> = {
  openai: Sparkles,
  anthropic: Bot,
  google: Globe,
  deepseek: Search,
  custom: Settings,
  private_cloud: Server,
}

interface ProviderIconProps {
  provider: LlmProvider
  className?: string
  size?: number
}

export const ProviderIcon = memo(function ProviderIcon({
  provider,
  className,
  size = 16,
}: ProviderIconProps) {
  const Icon = PROVIDER_ICONS[provider] ?? Settings
  return <Icon className={className} size={size} />
})
