import { memo, useCallback } from 'react'
import { Container } from 'lucide-react'
import { Slider } from '@/shared/ui/slider'
import { Switch } from '@/shared/ui/switch'
import type { AgentGlobalSandboxConfig } from '@/features/agent/types'

interface SandboxNodeConfigPanelProps {
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
}

const CPU_LIMITS = { min: 0.5, max: 8, step: 0.5 } as const
const MEMORY_LIMITS = { min: 128, max: 8192, step: 128 } as const
const TIMEOUT_LIMITS = { min: 30, max: 3600, step: 30 } as const

function parseSandboxConfig(raw: Record<string, unknown>): Required<Pick<AgentGlobalSandboxConfig, 'enabled' | 'cpuLimit' | 'memoryLimitMb' | 'timeoutSeconds'>> {
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    cpuLimit: typeof raw.cpuLimit === 'number' ? raw.cpuLimit : 1,
    memoryLimitMb: typeof raw.memoryLimitMb === 'number' ? raw.memoryLimitMb : 512,
    timeoutSeconds: typeof raw.timeoutSeconds === 'number' ? raw.timeoutSeconds : 300,
  }
}

interface ConfigSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}

const ConfigSlider = memo(function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: ConfigSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-xs font-mono text-neutral-300">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
      />
    </div>
  )
})

export const SandboxNodeConfigPanel = memo(function SandboxNodeConfigPanel({
  config,
  onApply,
}: SandboxNodeConfigPanelProps) {
  const sandbox = parseSandboxConfig(config)

  const patchField = useCallback(
    (field: string, value: unknown) => {
      onApply({ ...config, [field]: value })
    },
    [config, onApply],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Container className="h-4 w-4 text-orange-400" />
        <span className="text-xs font-medium text-neutral-200">沙箱配置</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">启用沙箱</span>
        <Switch
          checked={sandbox.enabled}
          onCheckedChange={(checked) => patchField('enabled', checked)}
        />
      </div>

      {sandbox.enabled && (
        <>
          <ConfigSlider
            label="CPU"
            value={sandbox.cpuLimit}
            {...CPU_LIMITS}
            unit=" cores"
            onChange={(v) => patchField('cpuLimit', v)}
          />

          <ConfigSlider
            label="内存"
            value={sandbox.memoryLimitMb}
            {...MEMORY_LIMITS}
            unit=" MB"
            onChange={(v) => patchField('memoryLimitMb', v)}
          />

          <ConfigSlider
            label="超时"
            value={sandbox.timeoutSeconds}
            {...TIMEOUT_LIMITS}
            unit="s"
            onChange={(v) => patchField('timeoutSeconds', v)}
          />

          <div className="rounded border border-neutral-700 bg-neutral-800/50 px-2.5 py-2 text-xs text-neutral-400">
            <span className="text-neutral-300 font-medium">当前配置：</span>
            {sandbox.cpuLimit} 核 · {sandbox.memoryLimitMb} MB · {sandbox.timeoutSeconds}s
          </div>
        </>
      )}
    </div>
  )
})
