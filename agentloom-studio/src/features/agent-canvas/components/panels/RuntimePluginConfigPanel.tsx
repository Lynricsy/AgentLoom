import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Puzzle } from 'lucide-react'
import {
  DynamicConfigForm,
  type NodeConfigFieldSchema,
  type NodeConfigSchema,
} from '@/features/canvas'
import { useActiveRuntimePlugins, type RuntimePluginRecord } from '@/features/runtime-plugin'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import {
  isPlainRecord,
  isValidRuntimePluginNpmName,
  parseRuntimePluginNodeConfig,
  type RuntimePluginSource,
} from '../../lib/harnessNodeConfig'

interface RuntimePluginConfigPanelProps {
  nodeId: string
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

interface PluginConfigFormSchema {
  /** 可由 DynamicConfigForm 渲染的标量字段 */
  formSchema: NodeConfigSchema | null
  /** object / array 等无法在表单中编辑的字段名 */
  unsupportedFields: string[]
}

/**
 * 把插件 manifest 声明的 JSON Schema 收敛为 DynamicConfigForm 能渲染的标量子集。
 * object/array 字段不进表单，提示用户改在 harness 节点的 profile patch 中配置。
 */
function toPluginConfigFormSchema(
  configSchema: Record<string, unknown> | null,
): PluginConfigFormSchema {
  const properties = isPlainRecord(configSchema?.properties)
    ? configSchema.properties
    : {}
  const declaredRequired = Array.isArray(configSchema?.required)
    ? configSchema.required.filter((key): key is string => typeof key === 'string')
    : []
  const formProperties: Record<string, NodeConfigFieldSchema> = {}
  const unsupportedFields: string[] = []

  for (const [key, rawField] of Object.entries(properties)) {
    const field = isPlainRecord(rawField) ? rawField : {}
    const fieldType =
      field.type === 'integer' ? 'number' : field.type
    if (fieldType !== 'string' && fieldType !== 'number' && fieldType !== 'boolean') {
      unsupportedFields.push(key)
      continue
    }
    const enumValues = Array.isArray(field.enum)
      ? field.enum.filter((value): value is string => typeof value === 'string')
      : []
    formProperties[key] = {
      type: fieldType,
      title: typeof field.title === 'string' && field.title ? field.title : key,
      ...(typeof field.description === 'string'
        ? { description: field.description }
        : {}),
      ...(field.default !== undefined ? { default: field.default } : {}),
      ...(fieldType === 'string' && enumValues.length > 0 ? { enum: enumValues } : {}),
    }
  }

  const formKeys = Object.keys(formProperties)
  return {
    formSchema:
      formKeys.length > 0
        ? {
            type: 'object',
            properties: formProperties,
            required: declaredRequired.filter((key) => key in formProperties),
          }
        : null,
    unsupportedFields,
  }
}

export const RuntimePluginConfigPanel = memo(function RuntimePluginConfigPanel({
  nodeId,
  config,
  onApply,
  onValidationChange,
}: RuntimePluginConfigPanelProps) {
  const parsed = parseRuntimePluginNodeConfig(config)
  const { data: pluginsResponse, isLoading } = useActiveRuntimePlugins()
  const activePlugins = useMemo(
    () => pluginsResponse?.data ?? [],
    [pluginsResponse],
  )
  const [pluginConfigHasErrors, setPluginConfigHasErrors] = useState(false)

  const selectedPlugin = activePlugins.find(
    (plugin) => plugin.id === parsed.runtimePluginId,
  )
  const isSelectedPluginUnavailable =
    parsed.source === 'package' &&
    Boolean(parsed.runtimePluginId) &&
    !isLoading &&
    !selectedPlugin

  const { formSchema, unsupportedFields } = useMemo(
    () => toPluginConfigFormSchema(parsed.configSchema),
    [parsed.configSchema],
  )
  const rawPluginConfig = config.pluginConfig
  const pluginConfigValues = useMemo(
    () => (isPlainRecord(rawPluginConfig) ? rawPluginConfig : {}),
    [rawPluginConfig],
  )

  const npmNameError =
    parsed.source === 'npm'
      ? !parsed.npmName
        ? 'npm 包名为必填项'
        : isValidRuntimePluginNpmName(parsed.npmName)
          ? null
          : 'npm 包名不合法（小写字母、数字、- . _ ~，可带 @scope/）'
      : null
  const npmVersionError =
    parsed.source === 'npm' && !parsed.npmVersion.trim() ? '版本为必填项' : null

  const hasErrors =
    parsed.source === 'npm'
      ? Boolean(npmNameError || npmVersionError)
      : !parsed.runtimePluginId ||
        isSelectedPluginUnavailable ||
        (formSchema !== null && pluginConfigHasErrors)

  useEffect(() => {
    onValidationChange(hasErrors)
  }, [hasErrors, onValidationChange])

  const patchConfig = useCallback(
    (patch: Record<string, unknown>) => {
      onApply({ ...config, ...patch })
    },
    [config, onApply],
  )

  const handleSelectPlugin = useCallback(
    (pluginId: string) => {
      const plugin = activePlugins.find((item: RuntimePluginRecord) => item.id === pluginId)
      if (!plugin) return
      // 换插件时旧 pluginConfig 与新 schema 无关，必须清空
      patchConfig({
        runtimePluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        configSchema: plugin.configSchema,
        pluginConfig: {},
      })
    },
    [activePlugins, patchConfig],
  )

  const handlePluginConfigApply = useCallback(
    (patch: Record<string, unknown>) => {
      patchConfig({ pluginConfig: isPlainRecord(patch.config) ? patch.config : {} })
    },
    [patchConfig],
  )

  return (
    <div className="space-y-5 px-4 py-4" data-testid="runtime-plugin-config-panel">
      <div className="flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-type-runtime-plugin" />
        <span className="rounded-full bg-type-runtime-plugin/10 px-2 py-0.5 text-xs font-medium text-type-runtime-plugin">
          Runtime 插件
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">
          来源<span className="ml-0.5 text-error">*</span>
        </span>
        <RadioGroup
          aria-label="来源"
          className="flex gap-4"
          value={parsed.source}
          onValueChange={(value) => patchConfig({ source: value as RuntimePluginSource })}
        >
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <RadioGroupItem value="package" id={`runtime-plugin-source-package-${nodeId}`} />
            已上传的插件包
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
            <RadioGroupItem value="npm" id={`runtime-plugin-source-npm-${nodeId}`} />
            npm 包（VM 内在线安装）
          </label>
        </RadioGroup>
      </div>

      {parsed.source === 'package' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`runtime-plugin-select-${nodeId}`}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
            >
              插件
              <span className="text-error">*</span>
            </label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>加载中...</span>
              </div>
            ) : activePlugins.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                暂无已启用的 runtime 插件，请先到「资源 / Runtime 插件」上传并启用。
              </p>
            ) : (
              <Select value={selectedPlugin?.id ?? ''} onValueChange={handleSelectPlugin}>
                <SelectTrigger aria-label="选择 runtime 插件" id={`runtime-plugin-select-${nodeId}`}>
                  <SelectValue placeholder="请选择插件" />
                </SelectTrigger>
                <SelectContent>
                  {activePlugins.map((plugin) => (
                    <SelectItem key={plugin.id} value={plugin.id}>
                      {plugin.name}@{plugin.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isSelectedPluginUnavailable && (
            <div
              className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs"
              data-testid="runtime-plugin-unavailable-warning"
            >
              <p className="font-medium text-warning">
                当前选择的插件已停用或已删除，请重新选择。
              </p>
              <p className="break-all text-warning/80">
                {parsed.pluginName
                  ? `${parsed.pluginName}@${parsed.pluginVersion}`
                  : parsed.runtimePluginId}
              </p>
            </div>
          )}

          {parsed.runtimePluginId && formSchema && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">插件配置</span>
              <div className="-mx-4">
                <DynamicConfigForm
                  configSchema={formSchema}
                  values={pluginConfigValues}
                  onApply={handlePluginConfigApply}
                  onValidationChange={setPluginConfigHasErrors}
                />
              </div>
            </div>
          )}

          {parsed.runtimePluginId && unsupportedFields.length > 0 && (
            <div
              className="space-y-1 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground"
              data-testid="runtime-plugin-unsupported-fields"
            >
              {unsupportedFields.map((field) => (
                <p key={field}>
                  <span className="font-mono text-foreground">{field}</span>
                  ：此字段请在 profile patch 中配置
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`runtime-plugin-npm-name-${nodeId}`}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
            >
              npm 包名
              <span className="text-error">*</span>
            </label>
            <Input
              id={`runtime-plugin-npm-name-${nodeId}`}
              aria-label="npm 包名"
              aria-invalid={npmNameError ? true : undefined}
              placeholder="@deepseek-ai/dsh-tool-todo"
              value={parsed.npmName}
              onChange={(event) => patchConfig({ npmName: event.target.value.trim() })}
            />
            {npmNameError && <p className="text-xs text-error">{npmNameError}</p>}
            <p className="text-xs text-muted-foreground">
              package.json 声明了 dsh.bundle.patch 时按 bundle 挂载，否则把包本身作为单个插件挂载；会话启动时在 microVM 内执行 npm install。
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`runtime-plugin-npm-version-${nodeId}`}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
            >
              版本
              <span className="text-error">*</span>
            </label>
            <Input
              id={`runtime-plugin-npm-version-${nodeId}`}
              aria-label="版本"
              aria-invalid={npmVersionError ? true : undefined}
              placeholder="0.2.0-rc.2"
              value={parsed.npmVersion}
              onChange={(event) => patchConfig({ npmVersion: event.target.value.trim() })}
            />
            {npmVersionError && <p className="text-xs text-error">{npmVersionError}</p>}
          </div>
        </>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-foreground">启用</span>
          <span className="text-xs text-muted-foreground">
            停用后保留节点与连线，但会话中不加载该插件。
          </span>
        </div>
        <Switch
          aria-label="启用"
          checked={parsed.enabled}
          onCheckedChange={(checked) => patchConfig({ enabled: checked })}
        />
      </div>
    </div>
  )
})
