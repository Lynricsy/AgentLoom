import { memo, useCallback, type ComponentType, type ReactNode } from 'react'
import {
  Cpu,
  FilePenLine,
  FolderOpen,
  Settings2,
  Sparkles,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import type {
  AgentNativeToolPolicy,
  AgentRuntimeMode,
  AgentSelfEvolutionPolicy,
} from '@/features/agent'
import { Switch } from '@/shared/ui/switch'

interface AgentMainConfigPanelProps {
  config: Record<string, unknown>
  runtimeMode: AgentRuntimeMode
  onApply: (config: Record<string, unknown>) => void
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return {}
  }

  return value as Record<string, unknown>
}

function parseNativeToolPolicy(config: Record<string, unknown>): AgentNativeToolPolicy {
  const policy = asRecord(config.nativeToolPolicy)

  return {
    readEnabled: typeof policy.readEnabled === 'boolean' ? policy.readEnabled : true,
    writeEnabled: typeof policy.writeEnabled === 'boolean' ? policy.writeEnabled : true,
    editEnabled: typeof policy.editEnabled === 'boolean' ? policy.editEnabled : true,
    terminalEnabled:
      typeof policy.terminalEnabled === 'boolean' ? policy.terminalEnabled : true,
  }
}

function parseSelfEvolutionPolicy(
  config: Record<string, unknown>,
): AgentSelfEvolutionPolicy {
  const policy = asRecord(config.selfEvolutionPolicy)

  return {
    enabled: typeof policy.enabled === 'boolean' ? policy.enabled : false,
    resourceManagement:
      typeof policy.resourceManagement === 'boolean'
        ? policy.resourceManagement
        : false,
    externalEditing:
      typeof policy.externalEditing === 'boolean' ? policy.externalEditing : false,
    sandboxManagement:
      typeof policy.sandboxManagement === 'boolean'
        ? policy.sandboxManagement
        : false,
  }
}

interface SectionCardProps {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}

const SectionCard = memo(function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-200">
            {title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  )
})

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  icon: ComponentType<{ className?: string }>
  onCheckedChange: (checked: boolean) => void
}

const ToggleRow = memo(function ToggleRow({
  title,
  description,
  checked,
  disabled = false,
  icon: Icon,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 ${
        disabled
          ? 'border-neutral-800 bg-neutral-900/60 opacity-60'
          : 'border-neutral-700 bg-neutral-800/50'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <Icon className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{title}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p>
      </div>

      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
})

export const AgentMainConfigPanel = memo(function AgentMainConfigPanel({
  config,
  runtimeMode,
  onApply,
}: AgentMainConfigPanelProps) {
  const nativeToolPolicy = parseNativeToolPolicy(config)
  const selfEvolutionPolicy = parseSelfEvolutionPolicy(config)

  const patchNativeToolPolicy = useCallback(
    (field: keyof AgentNativeToolPolicy, value: boolean) => {
      onApply({
        ...config,
        nativeToolPolicy: {
          ...nativeToolPolicy,
          [field]: value,
        },
      })
    },
    [config, nativeToolPolicy, onApply],
  )

  const patchSelfEvolutionPolicy = useCallback(
    (field: keyof AgentSelfEvolutionPolicy, value: boolean) => {
      onApply({
        ...config,
        selfEvolutionPolicy: {
          ...selfEvolutionPolicy,
          [field]: value,
        },
      })
    },
    [config, onApply, selfEvolutionPolicy],
  )

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="运行形态"
        description="创建后固定，用于决定 Agent 是否拥有沙箱运行时与工作区能力。"
        icon={Cpu}
      >
        <div className="rounded-md border border-neutral-700 bg-neutral-800/50 px-3 py-3">
          <div className="text-sm font-medium text-neutral-200">
            {runtimeMode === 'sandbox' ? '有沙箱' : '无沙箱'}
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {runtimeMode === 'sandbox'
              ? '当前 Agent 通过 sandbox runtime 运行，可挂载工作区并使用文件/终端内置工具。'
              : '当前 Agent 通过 no_sandbox runtime 运行，不提供内置文件或终端工具；若被有沙箱 Agent 调用为子 Agent，系统会自动授予只读 read 权限。'}
          </p>
        </div>
      </SectionCard>

      {runtimeMode === 'sandbox' && (
        <SectionCard
          title="原生工具"
          description="控制 Agent 在沙箱内可直接调用的文件与终端能力。"
          icon={Wrench}
        >
          <ToggleRow
            title="文件读取"
            description="允许读取工作区和沙箱中的文本文件。"
            icon={FolderOpen}
            checked={nativeToolPolicy.readEnabled}
            onCheckedChange={(checked) => patchNativeToolPolicy('readEnabled', checked)}
          />
          <ToggleRow
            title="文件写入"
            description="允许创建和覆盖文件内容。"
            icon={Settings2}
            checked={nativeToolPolicy.writeEnabled}
            onCheckedChange={(checked) => patchNativeToolPolicy('writeEnabled', checked)}
          />
          <ToggleRow
            title="文本编辑"
            description="允许以局部 diff 方式修改现有文件。"
            icon={FilePenLine}
            checked={nativeToolPolicy.editEnabled}
            onCheckedChange={(checked) => patchNativeToolPolicy('editEnabled', checked)}
          />
          <ToggleRow
            title="终端执行"
            description="允许在沙箱中创建和运行终端命令。"
            icon={SquareTerminal}
            checked={nativeToolPolicy.terminalEnabled}
            onCheckedChange={(checked) =>
              patchNativeToolPolicy('terminalEnabled', checked)}
          />
        </SectionCard>
      )}

      <SectionCard
        title="自进化"
        description="允许 Agent 在权限边界内检查并调整自己的编排和资源。"
        icon={Sparkles}
      >
        <ToggleRow
          title="启用自进化"
          description="开启后，Agent 才能使用自进化内置 Skill 和 orchestration 接口。"
          icon={Sparkles}
          checked={selfEvolutionPolicy.enabled}
          onCheckedChange={(checked) =>
            patchSelfEvolutionPolicy('enabled', checked)}
        />
        <ToggleRow
          title="资源管理"
          description="允许创建并接入新的模型、Skill、MCP 等资源。"
          icon={Settings2}
          disabled={!selfEvolutionPolicy.enabled}
          checked={selfEvolutionPolicy.resourceManagement}
          onCheckedChange={(checked) =>
            patchSelfEvolutionPolicy('resourceManagement', checked)}
        />
        <ToggleRow
          title="外部编辑"
          description="允许编辑当前 Agent 之外的 Agent 与 Workflow。"
          icon={FilePenLine}
          disabled={!selfEvolutionPolicy.enabled}
          checked={selfEvolutionPolicy.externalEditing}
          onCheckedChange={(checked) =>
            patchSelfEvolutionPolicy('externalEditing', checked)}
        />
        <ToggleRow
          title="沙箱管理"
          description="允许调整自身沙箱规格、工作区绑定与恢复配置。"
          icon={SquareTerminal}
          disabled={!selfEvolutionPolicy.enabled}
          checked={selfEvolutionPolicy.sandboxManagement}
          onCheckedChange={(checked) =>
            patchSelfEvolutionPolicy('sandboxManagement', checked)}
        />
      </SectionCard>
    </div>
  )
})
