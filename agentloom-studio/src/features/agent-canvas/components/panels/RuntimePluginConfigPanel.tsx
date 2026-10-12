import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Puzzle } from 'lucide-react'
import {
  DynamicConfigForm,
  type NodeConfigFieldSchema,
  type NodeConfigSchema,
} from '@/features/canvas'
import { useActiveRuntimePlugins, type RuntimePluginRecord } from '@/features/runtime-plugin'
import { FormField } from '@/shared/components/form-field/FormField'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
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

  // 面板对缺省 source 按 package 展示，写回时必须显式落盘，否则服务端编译拒绝缺少 source 的节点
  const patchConfig = useCallback(
    (patch: Record<string, unknown>) => {
      onApply({ ...config, source: parsed.source, ...patch })
    },
    [config, onApply, parsed.source],
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
        <Puzzle className="size-4 shrink-0 text-type-runtime-plugin" />
        <Badge tone="var(--color-type-runtime-plugin)">Runtime 插件</Badge>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">
          来源<span className="ml-0.5 text-error">*</span>
        </span>
        <RadioGroup
          aria-label="来源"
          className="flex flex-wrap gap-x-4 gap-y-2"
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
          <FormField label="插件" htmlFor={`runtime-plugin-select-${nodeId}`} required>
            {isLoading ? (
              <div role="status">
                <Skeleton className="h-9 w-full" />
                <span className="sr-only">加载中…</span>
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
          </FormField>

          {isSelectedPluginUnavailable && (
            <Alert
              variant="warning"
              title="当前选择的插件已停用或已删除，请重新选择。"
              data-testid="runtime-plugin-unavailable-warning"
            >
              <p className="break-all font-mono text-xs">
                {parsed.pluginName
                  ? `${parsed.pluginName}@${parsed.pluginVersion}`
                  : parsed.runtimePluginId}
              </p>
            </Alert>
          )}

          {parsed.runtimePluginId && formSchema && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">插件配置</span>
              <DynamicConfigForm
                configSchema={formSchema}
                values={pluginConfigValues}
                onApply={handlePluginConfigApply}
                onValidationChange={setPluginConfigHasErrors}
              />
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
          <FormField
            label="npm 包名"
            htmlFor={`runtime-plugin-npm-name-${nodeId}`}
            required
            error={npmNameError}
            hint="package.json 声明了 dsh.bundle.patch 时按 bundle 挂载，否则把包本身作为单个插件挂载；会话启动时在 microVM 内执行 npm install。"
          >
            <Input
              id={`runtime-plugin-npm-name-${nodeId}`}
              aria-label="npm 包名"
              aria-invalid={npmNameError ? true : undefined}
              placeholder="@deepseek-ai/dsh-tool-todo"
              value={parsed.npmName}
              onChange={(event) => patchConfig({ npmName: event.target.value.trim() })}
            />
          </FormField>
          <FormField
            label="版本"
            htmlFor={`runtime-plugin-npm-version-${nodeId}`}
            required
            error={npmVersionError}
          >
            <Input
              id={`runtime-plugin-npm-version-${nodeId}`}
              aria-label="版本"
              aria-invalid={npmVersionError ? true : undefined}
              placeholder="0.2.0-rc.2"
              value={parsed.npmVersion}
              onChange={(event) => patchConfig({ npmVersion: event.target.value.trim() })}
            />
          </FormField>
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
          className="shrink-0"
          checked={parsed.enabled}
          onCheckedChange={(checked) => patchConfig({ enabled: checked })}
        />
      </div>
    </div>
  )
})
