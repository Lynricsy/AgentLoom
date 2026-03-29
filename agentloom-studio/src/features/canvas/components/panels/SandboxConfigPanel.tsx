import { memo, useCallback, type ChangeEvent } from 'react'
import { Container, Loader2 } from 'lucide-react'
import { usePersistentSandboxes } from '@/features/sandbox/api/sandboxQueries'
import type { SandboxSession } from '@/features/sandbox/types'
import {
  SandboxPresetSelector,
} from '@/features/sandbox/components/SandboxPresetSelector'
import {
  useSandboxPresetStore,
  getAllPresets,
  findMatchingPreset,
  type SandboxPreset,
} from '@/features/sandbox/stores/sandboxPresetStore'

interface SandboxConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

type LifecycleMode = 'session' | 'persistent'

interface SandboxConfig {
  cpu: number
  memory: number
  disk: number
  persistencePath: string
  timeout: number
  lifecycleMode: LifecycleMode
  persistentSandboxId: string
  persistentSandboxName: string
}

function parseSandboxConfig(config: Record<string, unknown>): SandboxConfig {
  return {
    cpu: typeof config.cpu === 'number' ? config.cpu : 1,
    memory: typeof config.memory === 'number' ? config.memory : 512,
    disk: typeof config.disk === 'number' ? config.disk : 2,
    persistencePath: typeof config.persistencePath === 'string' ? config.persistencePath : '',
    timeout: typeof config.timeout === 'number' ? config.timeout : 2,
    lifecycleMode: config.lifecycleMode === 'persistent' ? 'persistent' : 'session',
    persistentSandboxId: typeof config.persistentSandboxId === 'string' ? config.persistentSandboxId : '',
    persistentSandboxName: typeof config.persistentSandboxName === 'string' ? config.persistentSandboxName : '',
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseNumericValue(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const SELECTABLE_STATUSES = new Set(['ready', 'stopped'])

function PersistentSandboxSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (session: SandboxSession | null) => void
}) {
  const { data: sandboxes, isLoading } = usePersistentSandboxes()

  const available = (sandboxes ?? []).filter(
    (s) => SELECTABLE_STATUSES.has(s.status),
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        加载持久沙箱...
      </div>
    )
  }

  if (available.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        暂无可用的持久沙箱。请先在沙箱管理页面创建。
      </p>
    )
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => {
        const found = available.find((s) => s.id === e.target.value) ?? null
        onSelect(found)
      }}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <option value="">请选择持久沙箱</option>
      {available.map((s) => (
        <option key={s.id} value={s.id}>
          {s.config.name || s.id.slice(0, 8)} ({s.status === 'ready' ? '就绪' : '已停止'})
        </option>
      ))}
    </select>
  )
}

export const SandboxConfigPanel = memo(
  function SandboxConfigPanel({
    config,
    onApply,
  }: SandboxConfigPanelProps) {
    const sandbox = parseSandboxConfig(config)

    const applyPatch = useCallback(
      (patch: Partial<SandboxConfig>) => {
        const next = { ...parseSandboxConfig(config), ...patch }
        onApply({ config: next })
      },
      [config, onApply],
    )

    const applyField = useCallback(
      (field: keyof SandboxConfig, value: string | number) => {
        applyPatch({ [field]: value })
      },
      [applyPatch],
    )

    const handleLifecycleMode = useCallback(
      (mode: LifecycleMode) => {
        applyPatch({ lifecycleMode: mode })
      },
      [applyPatch],
    )

    const handleSelectPersistentSandbox = useCallback(
      (session: SandboxSession | null) => {
        applyPatch({
          persistentSandboxId: session?.id ?? '',
          persistentSandboxName: session?.config.name ?? '',
        })
      },
      [applyPatch],
    )

    const customPresets = useSandboxPresetStore((s) => s.customPresets)
    const addPreset = useSandboxPresetStore((s) => s.addPreset)
    const allPresets = getAllPresets(customPresets)
    const currentSessionConfig = { cpu: sandbox.cpu, memory: sandbox.memory, disk: sandbox.disk }
    const matchedPreset = findMatchingPreset(allPresets, currentSessionConfig)

    const handlePresetSelect = useCallback(
      (preset: SandboxPreset) => {
        applyPatch({ cpu: preset.cpu, memory: preset.memory, disk: preset.disk })
      },
      [applyPatch],
    )

    const handleSaveAsPreset = useCallback(
      (preset: { name: string; cpu: number; memory: number; disk: number }) => {
        addPreset(preset)
      },
      [addPreset],
    )

    const handleCpu = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('cpu', clamp(parseNumericValue(e.target.value, sandbox.cpu), 0.5, 4))
      },
      [applyField, sandbox.cpu],
    )

    const handleMemory = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField(
          'memory',
          clamp(parseNumericValue(e.target.value, sandbox.memory), 256, 4096),
        )
      },
      [applyField, sandbox.memory],
    )

    const handleDisk = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('disk', clamp(parseNumericValue(e.target.value, sandbox.disk), 1, 10))
      },
      [applyField, sandbox.disk],
    )

    const handleTimeout = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField(
          'timeout',
          clamp(parseNumericValue(e.target.value, sandbox.timeout), 1, 24),
        )
      },
      [applyField, sandbox.timeout],
    )

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <Container className="h-4 w-4 text-type-tool" />
          <span className="rounded-full bg-type-tool/10 px-2 py-0.5 text-xs font-medium text-type-tool">
            Sandbox
          </span>
        </div>

        {/* Lifecycle mode toggle */}
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">
            生命周期模式
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleLifecycleMode('session')}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                sandbox.lifecycleMode === 'session'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              临时
            </button>
            <button
              type="button"
              onClick={() => handleLifecycleMode('persistent')}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                sandbox.lifecycleMode === 'persistent'
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              持久
            </button>
          </div>
        </div>

        {sandbox.lifecycleMode === 'session' ? (
          <>
            {/* Preset Selector */}
            <SandboxPresetSelector
              selectedPresetId={matchedPreset?.id}
              onSelect={handlePresetSelect}
              onSaveAsPreset={handleSaveAsPreset}
              currentConfig={currentSessionConfig}
              compact
            />

            {/* CPU */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="sandbox-cpu"
                  className="block text-xs font-medium text-foreground"
                >
                  CPU ({sandbox.cpu} 核)
                </label>
                <input
                  aria-label="CPU 数值"
                  type="number"
                  min={0.5}
                  max={4}
                  step={0.5}
                  value={sandbox.cpu}
                  onChange={handleCpu}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                />
              </div>
              <input
                id="sandbox-cpu"
                aria-label="CPU 滑块"
                type="range"
                min={0.5}
                max={4}
                step={0.5}
                value={sandbox.cpu}
                onChange={handleCpu}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0.5 核</span>
                <span>4 核</span>
              </div>
            </div>

            {/* Memory */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="sandbox-memory"
                  className="block text-xs font-medium text-foreground"
                >
                  Memory ({sandbox.memory} MB)
                </label>
                <input
                  aria-label="Memory 数值"
                  type="number"
                  min={256}
                  max={4096}
                  step={256}
                  value={sandbox.memory}
                  onChange={handleMemory}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                />
              </div>
              <input
                id="sandbox-memory"
                aria-label="Memory 滑块"
                type="range"
                min={256}
                max={4096}
                step={256}
                value={sandbox.memory}
                onChange={handleMemory}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>256 MB</span>
                <span>4096 MB</span>
              </div>
            </div>

            {/* Disk */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="sandbox-disk"
                  className="block text-xs font-medium text-foreground"
                >
                  Disk ({sandbox.disk} GB)
                </label>
                <input
                  aria-label="Disk 数值"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={sandbox.disk}
                  onChange={handleDisk}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                />
              </div>
              <input
                id="sandbox-disk"
                aria-label="Disk 滑块"
                type="range"
                min={1}
                max={10}
                step={1}
                value={sandbox.disk}
                onChange={handleDisk}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1 GB</span>
                <span>10 GB</span>
              </div>
            </div>

            {/* Timeout */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="sandbox-timeout"
                  className="block text-xs font-medium text-foreground"
                >
                  Timeout ({sandbox.timeout} 小时)
                </label>
                <input
                  aria-label="Timeout 数值"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={sandbox.timeout}
                  onChange={handleTimeout}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                />
              </div>
              <input
                id="sandbox-timeout"
                aria-label="Timeout 滑块"
                type="range"
                min={1}
                max={24}
                step={0.5}
                value={sandbox.timeout}
                onChange={handleTimeout}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1 小时</span>
                <span>24 小时</span>
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
              <p className="font-medium text-foreground">当前配置</p>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  临时
                </span>
                <span>{sandbox.cpu} 核</span>
                <span>&middot;</span>
                <span>{sandbox.memory} MB</span>
                <span>&middot;</span>
                <span>{sandbox.disk} GB</span>
                <span>&middot;</span>
                <span>{sandbox.timeout} 小时</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Persistent sandbox selector */}
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">
                选择持久沙箱
              </label>
              <PersistentSandboxSelector
                selectedId={sandbox.persistentSandboxId}
                onSelect={handleSelectPersistentSandbox}
              />
            </div>

            {/* Summary */}
            <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
              <p className="font-medium text-foreground">当前配置</p>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                  持久
                </span>
                {sandbox.persistentSandboxName ? (
                  <span>{sandbox.persistentSandboxName}</span>
                ) : (
                  <span className="italic">未选择沙箱</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  },
)
