import { memo, useCallback, useState } from 'react'
import { Cpu, Puzzle } from 'lucide-react'
import { useStore } from '@xyflow/react'
import { shallow } from 'zustand/shallow'
import { parse as parseYaml } from 'yaml'
import type { CanvasNodeData } from '@/features/canvas'
import { RUNTIME_PLUGIN_DSH_VERSION } from '@/features/runtime-plugin'
import { Textarea } from '@/shared/ui/textarea'
import {
  HARNESS_PLUGINS_INPUT_HANDLE,
  formatRuntimePluginLabel,
  parseHarnessNodeConfig,
  parseRuntimePluginNodeConfig,
} from '../../lib/harnessNodeConfig'

interface HarnessConfigPanelProps {
  nodeId: string
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
}

/** 校验 profile patch：空文本合法；否则必须能解析为 YAML 列表。返回错误文案或 null */
function validateProfilePatch(text: string): string | null {
  if (!text.trim()) return null
  try {
    return Array.isArray(parseYaml(text)) ? null : '必须是 YAML 列表'
  } catch (error) {
    return `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`
  }
}

export const HarnessConfigPanel = memo(function HarnessConfigPanel({
  nodeId,
  config,
  onApply,
}: HarnessConfigPanelProps) {
  const [draft, setDraft] = useState(() => parseHarnessNodeConfig(config).profilePatch)
  const [patchError, setPatchError] = useState<string | null>(() =>
    validateProfilePatch(draft),
  )

  // 按 plugins-in 连线顺序列出已挂载的 runtime-plugin 节点（即编译后的加载顺序）
  const connectedPlugins = useStore(
    (state) =>
      state.edges
        .filter(
          (edge) =>
            edge.target === nodeId &&
            edge.targetHandle === HARNESS_PLUGINS_INPUT_HANDLE,
        )
        .map((edge) => {
          const source = state.nodeLookup.get(edge.source)
          const data = source?.data as CanvasNodeData | undefined
          return (
            formatRuntimePluginLabel(parseRuntimePluginNodeConfig(data?.config)) ||
            data?.label ||
            edge.source
          )
        }),
    shallow,
  )

  const handleBlur = useCallback(() => {
    // 校验失败仍保存：服务端编译时会给出最终错误，这里只做即时提示
    setPatchError(validateProfilePatch(draft))
    onApply({ ...config, engine: 'dsh', profilePatch: draft })
  }, [config, draft, onApply])

  return (
    <div className="space-y-5 px-4 py-4" data-testid="harness-config-panel">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-node-tool" />
        <span className="rounded-full bg-node-tool/10 px-2 py-0.5 text-xs font-medium text-node-tool">
          Harness
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">引擎</span>
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
          DeepSeek Harness {RUNTIME_PLUGIN_DSH_VERSION}
        </div>
        <p className="text-xs text-muted-foreground">
          仅 sandbox 运行态生效；Agent 核心在 microVM 内以 dsh 子进程运行。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`harness-profile-patch-${nodeId}`}
          className="text-xs font-medium text-foreground"
        >
          Profile patch (YAML)
        </label>
        <p className="text-xs text-muted-foreground">
          cordis.patch.yml 片段，在平台层与插件层之后应用，优先级最高。
        </p>
        <Textarea
          id={`harness-profile-patch-${nodeId}`}
          aria-label="Profile patch (YAML)"
          aria-invalid={patchError ? true : undefined}
          rows={8}
          spellCheck={false}
          className="font-mono text-xs"
          placeholder={'- id: tool-todo\n  disabled: true'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleBlur}
        />
        {patchError && (
          <p className="text-xs text-error" data-testid="harness-profile-patch-error">
            {patchError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">已挂载插件</span>
        {connectedPlugins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚未连接 runtime 插件节点，把 Runtime 插件节点连到「Runtime 插件」端口即可挂载。
          </p>
        ) : (
          <ol className="space-y-1" data-testid="harness-connected-plugins">
            {connectedPlugins.map((label, index) => (
              <li
                key={`${index}-${label}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">{index + 1}.</span>
                <Puzzle className="h-3.5 w-3.5 shrink-0 text-node-plugin" />
                <span className="truncate font-mono text-foreground">{label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
})
