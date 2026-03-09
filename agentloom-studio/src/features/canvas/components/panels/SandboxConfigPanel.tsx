import { memo, useCallback, type ChangeEvent } from 'react'
import { Container } from 'lucide-react'

interface SandboxConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface SandboxConfig {
  cpu: number
  memory: number
  disk: number
  persistencePath: string
  timeout: number
}

function parseSandboxConfig(config: Record<string, unknown>): SandboxConfig {
  return {
    cpu: typeof config.cpu === 'number' ? config.cpu : 1,
    memory: typeof config.memory === 'number' ? config.memory : 512,
    disk: typeof config.disk === 'number' ? config.disk : 2,
    persistencePath: typeof config.persistencePath === 'string' ? config.persistencePath : '',
    timeout: typeof config.timeout === 'number' ? config.timeout : 2,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const SandboxConfigPanel = memo(
  function SandboxConfigPanel({
    config,
    onApply,
  }: SandboxConfigPanelProps) {
    const sandbox = parseSandboxConfig(config)

    const applyField = useCallback(
      (field: keyof SandboxConfig, value: string | number) => {
        const next = { ...parseSandboxConfig(config), [field]: value }
        onApply({ config: next })
      },
      [config, onApply],
    )

    const handleCpu = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('cpu', clamp(Number(e.target.value), 0.5, 4))
      },
      [applyField],
    )

    const handleMemory = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('memory', clamp(Number(e.target.value), 256, 4096))
      },
      [applyField],
    )

    const handleDisk = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('disk', clamp(Number(e.target.value), 1, 10))
      },
      [applyField],
    )

    const handlePersistencePath = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('persistencePath', e.target.value)
      },
      [applyField],
    )

    const handleTimeout = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        applyField('timeout', clamp(Number(e.target.value), 1, 24))
      },
      [applyField],
    )

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <Container className="h-4 w-4 text-type-tool" />
          <span className="rounded-full bg-type-tool/10 px-2 py-0.5 text-xs font-medium text-type-tool">
            Sandbox
          </span>
        </div>

        <div>
          <label
            htmlFor="sandbox-cpu"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            CPU ({sandbox.cpu} 核)
          </label>
          <input
            id="sandbox-cpu"
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

        <div>
          <label
            htmlFor="sandbox-memory"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            Memory ({sandbox.memory} MB)
          </label>
          <input
            id="sandbox-memory"
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

        <div>
          <label
            htmlFor="sandbox-disk"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            Disk ({sandbox.disk} GB)
          </label>
          <input
            id="sandbox-disk"
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

        <div>
          <label
            htmlFor="sandbox-persistence-path"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            Persistence Path
          </label>
          <input
            id="sandbox-persistence-path"
            type="text"
            value={sandbox.persistencePath}
            onChange={handlePersistencePath}
            placeholder="/data/workspace"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="sandbox-timeout"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            Timeout ({sandbox.timeout} 小时)
          </label>
          <input
            id="sandbox-timeout"
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

        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
          <p className="font-medium text-foreground">当前配置</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{sandbox.cpu} 核</span>
            <span>&middot;</span>
            <span>{sandbox.memory} MB</span>
            <span>&middot;</span>
            <span>{sandbox.disk} GB</span>
            <span>&middot;</span>
            <span>{sandbox.timeout} 小时</span>
          </div>
          {sandbox.persistencePath && (
            <p className="break-all text-muted">
              Path: {sandbox.persistencePath}
            </p>
          )}
        </div>
      </div>
    )
  },
)
