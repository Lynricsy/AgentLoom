import { memo, useCallback, useMemo, type ChangeEvent } from 'react'
import { GitMerge } from 'lucide-react'
import {
  parseMergeNodeConfig,
  buildMergeInputPorts,
  type MergeNodeConfig,
  type MergeMode,
} from '../../types/condition.types'
import { DynamicPortEditor, type DynamicPortEntry } from './DynamicPortEditor'

// ── MergeConfigPanel ──────────────────────────────────────────────

interface MergeConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

const createMergePortId = (index: number) => `input-${index}`
const createMergeDefaultLabel = (index: number) => `输入 ${index + 1}`

export const MergeConfigPanel = memo(function MergeConfigPanel({
  config,
  onApply,
}: MergeConfigPanelProps) {
  const parsed = useMemo(() => parseMergeNodeConfig(config), [config])

  const applyConfig = useCallback(
    (patch: Partial<MergeNodeConfig>) => {
      const next: MergeNodeConfig = { ...parsed, ...patch }
      const inputPorts = buildMergeInputPorts(next.inputCount, next.portLabels)
      onApply({ config: next, inputPorts })
    },
    [parsed, onApply],
  )

  // ── mode ─────────────────────────────────────────────────────
  const handleModeChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyConfig({ mode: e.target.value as MergeMode })
    },
    [applyConfig],
  )

  // ── mergeKey ─────────────────────────────────────────────────
  const handleMergeKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyConfig({ mergeKey: e.target.value })
    },
    [applyConfig],
  )

  // ── ports (count + labels) ───────────────────────────────────
  const portEntries: DynamicPortEntry[] = useMemo(
    () =>
      Array.from({ length: parsed.inputCount }, (_, i) => {
        const portId = createMergePortId(i)
        return {
          id: portId,
          label: parsed.portLabels?.[portId] ?? createMergeDefaultLabel(i),
        }
      }),
    [parsed.inputCount, parsed.portLabels],
  )

  const handlePortsChange = useCallback(
    (ports: DynamicPortEntry[]) => {
      const nextLabels: Record<string, string> = {}
      for (let i = 0; i < ports.length; i++) {
        const port = ports[i]!
        const defaultLabel = createMergeDefaultLabel(i)
        if (port.label && port.label !== defaultLabel) {
          nextLabels[createMergePortId(i)] = port.label
        }
      }

      applyConfig({
        inputCount: ports.length,
        portLabels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined,
      })
    },
    [applyConfig],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">合并配置</span>
      </div>

      {/* 合并模式 */}
      <div>
        <label
          htmlFor="merge-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          合并模式
        </label>
        <select
          id="merge-mode"
          value={parsed.mode}
          onChange={handleModeChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="append">追加拼接</option>
          <option value="merge-by-key">按键合并</option>
        </select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {parsed.mode === 'append'
            ? '将所有输入数据按顺序拼接为数组'
            : '按指定键字段合并对象'}
        </p>
      </div>

      {/* 合并键（仅 merge-by-key 模式） */}
      {parsed.mode === 'merge-by-key' && (
        <div>
          <label
            htmlFor="merge-key"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            合并键
          </label>
          <input
            id="merge-key"
            type="text"
            value={parsed.mergeKey}
            onChange={handleMergeKeyChange}
            placeholder="例: id"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            用于匹配合并的键字段名称
          </p>
        </div>
      )}

      {/* 输入端口编辑器 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">输入端口</p>
        <DynamicPortEditor
          ports={portEntries}
          onChange={handlePortsChange}
          minPorts={2}
          maxPorts={10}
          createPortId={createMergePortId}
          createDefaultLabel={createMergeDefaultLabel}
          addLabel="添加输入"
        />
      </div>

      {/* 配置摘要 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-col gap-1 text-muted-foreground">
          <span>
            合并模式: {parsed.mode === 'append' ? '追加拼接' : '按键合并'}
          </span>
          {parsed.mode === 'merge-by-key' && (
            <span>
              合并键: {parsed.mergeKey || '(未设置)'}
            </span>
          )}
          <span>输入端口: {parsed.inputCount} 个</span>
        </div>
      </div>
    </div>
  )
})
