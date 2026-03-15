import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RotateCcw, Sparkles, X } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select } from '@/shared/ui/select'
import { Slider } from '@/shared/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useToast } from '@/shared/ui/toast'
import {
  buildLlmNodePatch,
  DEFAULT_LLM_PARAMETERS,
  getProviderInfo,
  LLM_PROVIDERS,
  LLM_PROVIDER_IDS,
  parseLlmModelConfig,
  toLlmModelConfig,
  type ApiKeyInfo,
  type CreateLlmModelInput,
  type LlmModelConfig,
  type LlmModelInfo,
  type LlmNodeDataPatch,
  type LlmProvider,
} from '../types'
import {
  useCreateLlmModel,
  useLlmApiKeys,
  useLlmModels,
  useLlmProviders,
  useUpdateLlmModel,
} from '../hooks/useLlmModels'
import { ProviderIcon } from './ProviderIcon'
import { PrivateCloudConfigSection } from './PrivateCloudConfigSection'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const llmModelFormSchema = z.object({
  name: z.string().trim().min(1, '请输入配置名称').max(100, '配置名称不能超过 100 个字符'),
  provider: z.enum(LLM_PROVIDER_IDS),
  modelName: z.string().trim().min(1, '请选择模型'),
  apiKeyId: z.union([z.literal(''), z.string().trim().regex(UUID_PATTERN, '请选择有效的 API Key')]),
  temperature: z.number().min(0, 'Temperature 不能小于 0').max(2, 'Temperature 不能大于 2'),
  maxTokens: z.string().trim().refine((value) => value.length === 0 || /^[1-9]\d*$/.test(value), {
    message: 'Max Tokens 必须是正整数',
  }),
  topP: z.number().min(0, 'Top P 不能小于 0').max(1, 'Top P 不能大于 1'),
  frequencyPenalty: z.number().min(-2, 'Frequency Penalty 不能小于 -2').max(2, 'Frequency Penalty 不能大于 2'),
  presencePenalty: z.number().min(-2, 'Presence Penalty 不能小于 -2').max(2, 'Presence Penalty 不能大于 2'),
  stop: z.array(z.string().trim().min(1)),
  endpointUrl: z.string().url('请输入有效的 URL').optional().or(z.literal('')),
  authMethod: z.enum(['api_key', 'mtls', 'none']).optional(),
  authConfig: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1000, '超时时间不能小于 1000ms').max(300000, '超时时间不能大于 300000ms').optional(),
})

type LlmModelFormValues = z.infer<typeof llmModelFormSchema>
type ConfigMode = 'existing' | 'create'

interface LlmModelConfigPanelProps {
  config: LlmModelConfig | null
  onApply: (patch: LlmNodeDataPatch) => void
}

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

function createEmptyConfig(provider: LlmProvider = 'openai'): LlmModelConfig {
  const providerInfo = getProviderInfo(provider)
  const initialModelName = providerInfo?.models[0] ?? ''

  return {
    llmConfigId: null,
    name: initialModelName || '未命名模型配置',
    provider,
    modelName: initialModelName,
    parameters: { ...DEFAULT_LLM_PARAMETERS },
    apiKeyId: null,
    isDefault: false,
    endpointUrl: provider === 'private_cloud' ? '' : null,
    authMethod: provider === 'private_cloud' ? 'none' : null,
    authConfig: null,
    timeoutMs: null,
  }
}

function toFormValues(config: LlmModelConfig | null): LlmModelFormValues {
  const current = config ?? createEmptyConfig()

  return {
    name: current.name,
    provider: current.provider,
    modelName: current.modelName,
    apiKeyId: current.apiKeyId ?? '',
    temperature: current.parameters.temperature,
    maxTokens:
      typeof current.parameters.maxTokens === 'number'
        ? String(current.parameters.maxTokens)
        : '',
    topP: current.parameters.topP,
    frequencyPenalty: current.parameters.frequencyPenalty,
    presencePenalty: current.parameters.presencePenalty,
    stop: current.parameters.stop,
    endpointUrl: current.endpointUrl ?? '',
    authMethod: (current.authMethod === 'api_key' || current.authMethod === 'mtls' ? current.authMethod : 'none') as 'api_key' | 'mtls' | 'none',
    authConfig: Object.fromEntries(
      Object.entries(current.authConfig ?? {}).map(([k, v]) => [k, String(v ?? '')]),
    ),
    timeoutMs: typeof current.timeoutMs === 'number' ? current.timeoutMs : undefined,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '发生未知错误'
}

function buildCreatePayload(values: LlmModelFormValues): CreateLlmModelInput {
  const payload: CreateLlmModelInput = {
    name: values.name.trim(),
    provider: values.provider,
    modelName: values.modelName.trim(),
    apiKeyId: values.apiKeyId || null,
    parameters: {
      temperature: values.temperature,
      maxTokens: values.maxTokens ? Number.parseInt(values.maxTokens, 10) : undefined,
      topP: values.topP,
      frequencyPenalty: values.frequencyPenalty,
      presencePenalty: values.presencePenalty,
      stop: values.stop,
    },
    isDefault: false,
  }

  if (values.provider === 'private_cloud') {
    payload.endpointUrl = values.endpointUrl || undefined
    payload.authMethod = values.authMethod || undefined
    payload.authConfig = values.authConfig && Object.keys(values.authConfig).length > 0
      ? values.authConfig
      : undefined
    payload.timeoutMs = values.timeoutMs
    payload.apiKeyId = null
  }

  return payload
}

function TagInput({ tags, onChange, placeholder = '输入后回车添加 stop token' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const commitValue = useCallback(() => {
    const nextValue = inputValue.trim()
    if (!nextValue || tags.includes(nextValue)) {
      setInputValue('')
      return
    }

    onChange([...tags, nextValue])
    setInputValue('')
  }, [inputValue, onChange, tags])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitValue()
        return
      }

      if (event.key === 'Backspace' && inputValue.length === 0 && tags.length > 0) {
        onChange(tags.slice(0, -1))
      }
    },
    [commitValue, inputValue.length, onChange, tags],
  )

  return (
    <div className="space-y-2">
      <div className="flex min-h-[44px] flex-wrap gap-1 rounded-md border border-input bg-background px-2 py-2 focus-within:ring-2 focus-within:ring-primary/30">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-foreground"
          >
            {tag}
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              aria-label={`删除 ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitValue}
          placeholder={tags.length === 0 ? placeholder : '继续添加'}
          className="min-w-[96px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">可添加多个停止序列，用回车确认。</p>
    </div>
  )
}

function ExistingConfigSummary({ apiKeys, current }: { apiKeys: ApiKeyInfo[]; current: LlmModelInfo | null }) {
  if (!current) {
    return null
  }

  const apiKey = apiKeys.find((item) => item.id === current.apiKeyId) ?? null
  const providerInfo = getProviderInfo(current.provider)

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <div className="flex items-center gap-2 text-foreground">
        <ProviderIcon provider={current.provider} size={14} />
        <span className="font-medium">{current.name}</span>
      </div>

      <dl className="mt-3 space-y-2 text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <dt>Provider</dt>
          <dd>{providerInfo?.name ?? current.provider}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>模型</dt>
          <dd>{current.modelName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Temperature</dt>
          <dd>{current.parameters.temperature.toFixed(1)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>API Key</dt>
          <dd>{apiKey ? apiKey.label : '未绑定'}</dd>
        </div>
      </dl>
    </div>
  )
}

export const LlmModelConfigPanel = memo(function LlmModelConfigPanel({
  config,
  onApply,
}: LlmModelConfigPanelProps) {
  const { notify } = useToast()
  const normalizedConfig = parseLlmModelConfig(config)
  const llmModelsQuery = useLlmModels()
  const providersQuery = useLlmProviders()
  const apiKeysQuery = useLlmApiKeys()
  const createMutation = useCreateLlmModel()
  const updateMutation = useUpdateLlmModel()
  const [mode, setMode] = useState<ConfigMode>(config?.llmConfigId ? 'existing' : 'create')
  const [selectedConfigId, setSelectedConfigId] = useState(config?.llmConfigId ?? '')

  const form = useForm<LlmModelFormValues>({
    resolver: zodResolver(llmModelFormSchema) as Resolver<LlmModelFormValues>,
    defaultValues: toFormValues(config),
  })

  const providerCatalog = useMemo(
    () => (providersQuery.data && providersQuery.data.length > 0 ? providersQuery.data : LLM_PROVIDERS),
    [providersQuery.data],
  )
  const selectedProvider = useWatch({ control: form.control, name: 'provider' })
  const selectedModelName = useWatch({ control: form.control, name: 'modelName' })
  const selectedApiKeyId = useWatch({ control: form.control, name: 'apiKeyId' })
  const selectedTemperature = useWatch({ control: form.control, name: 'temperature' })
  const selectedTopP = useWatch({ control: form.control, name: 'topP' })
  const selectedFrequencyPenalty = useWatch({ control: form.control, name: 'frequencyPenalty' })
  const selectedPresencePenalty = useWatch({ control: form.control, name: 'presencePenalty' })

  const providerApiKeys = useMemo(
    () => (apiKeysQuery.data ?? []).filter((item) => item.provider === selectedProvider),
    [apiKeysQuery.data, selectedProvider],
  )
  const selectedExistingConfig = useMemo(
    () => llmModelsQuery.data?.find((item) => item.id === selectedConfigId) ?? null,
    [llmModelsQuery.data, selectedConfigId],
  )

  const availableModels = useMemo(() => {
    const providerInfo = providerCatalog.find((item) => item.id === selectedProvider)
    const models = providerInfo ? [...providerInfo.models] : []

    if (selectedModelName && !models.includes(selectedModelName)) {
      models.unshift(selectedModelName)
    }

    return models
  }, [providerCatalog, selectedModelName, selectedProvider])

  const mutationError = createMutation.error || updateMutation.error
  const createError = mutationError ? getErrorMessage(mutationError) : null
  const queryError = llmModelsQuery.error || providersQuery.error || apiKeysQuery.error

  useEffect(() => {
    const initialConfig = normalizedConfig ?? createEmptyConfig()

    form.reset(toFormValues(initialConfig))
    setSelectedConfigId(initialConfig.llmConfigId ?? '')
    setMode(initialConfig.llmConfigId ? 'existing' : 'create')
  }, [form, normalizedConfig])

  useEffect(() => {
    if (selectedProvider === 'custom' || selectedProvider === 'private_cloud') {
      return
    }

    if (availableModels.length === 0) {
      return
    }

    const [nextModel] = availableModels

    if (nextModel && !availableModels.includes(selectedModelName)) {
      form.setValue('modelName', nextModel, { shouldValidate: true })
    }
  }, [availableModels, form, selectedModelName, selectedProvider])

  useEffect(() => {
    if (!selectedApiKeyId) {
      return
    }

    const matchesProvider = providerApiKeys.some((apiKey) => apiKey.id === selectedApiKeyId)

    if (!matchesProvider) {
      form.setValue('apiKeyId', '', { shouldValidate: true, shouldDirty: true })
    }
  }, [form, providerApiKeys, selectedApiKeyId])

  const handleModeChange = useCallback(
    (nextMode: ConfigMode) => {
      setMode(nextMode)

      if (nextMode === 'create') {
        setSelectedConfigId('')
        return
      }

      const currentConfig = normalizedConfig ?? createEmptyConfig()
      setSelectedConfigId(currentConfig.llmConfigId ?? '')
      form.reset(toFormValues(currentConfig))
    },
    [form, normalizedConfig],
  )

  const handleResetParameters = useCallback(() => {
    form.setValue('temperature', DEFAULT_LLM_PARAMETERS.temperature, { shouldValidate: true })
    form.setValue('maxTokens', '', { shouldValidate: true })
    form.setValue('topP', DEFAULT_LLM_PARAMETERS.topP, { shouldValidate: true })
    form.setValue('frequencyPenalty', DEFAULT_LLM_PARAMETERS.frequencyPenalty, { shouldValidate: true })
    form.setValue('presencePenalty', DEFAULT_LLM_PARAMETERS.presencePenalty, { shouldValidate: true })
    form.setValue('stop', DEFAULT_LLM_PARAMETERS.stop, { shouldValidate: true })
  }, [form])

  const handleExistingSelect = useCallback(
    (value: string) => {
      setSelectedConfigId(value)

      const selectedConfig = llmModelsQuery.data?.find((item) => item.id === value)
      if (!selectedConfig) {
        return
      }

      const nextConfig = toLlmModelConfig(selectedConfig)
      form.reset(toFormValues(nextConfig))
      onApply(buildLlmNodePatch(selectedConfig))

      notify({
        title: '已应用模型配置',
        description: `已将 ${selectedConfig.name} 绑定到当前 LLM 节点`,
        variant: 'success',
      })
    },
    [form, llmModelsQuery.data, notify, onApply],
  )

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = buildCreatePayload(values)
      const currentConfigId = selectedConfigId.trim()
      const savedModel = currentConfigId
        ? await updateMutation.mutateAsync({ id: currentConfigId, payload })
        : await createMutation.mutateAsync(payload)

      onApply(buildLlmNodePatch(savedModel))
      setSelectedConfigId(savedModel.id)
      form.reset(toFormValues(toLlmModelConfig(savedModel)))
      setMode('existing')

      notify({
        title: currentConfigId ? 'LLM 配置已更新' : 'LLM 配置已保存',
        description: `${savedModel.name} 已应用到当前节点`,
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '保存失败',
        description: getErrorMessage(error),
        variant: 'error',
      })
    }
  })

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">LLM 模型配置</h3>
        <p className="text-xs text-muted-foreground">
          选择已有模型配置，或创建一份新的 Provider / Model / Parameters 组合并立即应用到当前节点。
        </p>
      </div>

      {queryError ? (
        <div className="rounded-lg border border-error/50 bg-error/5 px-3 py-2 text-xs text-error">
          {getErrorMessage(queryError)}
        </div>
      ) : null}

      <Tabs value={mode} defaultValue={mode} onValueChange={(value) => handleModeChange(value as ConfigMode)}>
        <TabsList>
          <TabsTrigger value="existing">选择已有配置</TabsTrigger>
          <TabsTrigger value="create">创建新配置</TabsTrigger>
        </TabsList>

        <TabsContent value="existing">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>已保存配置</Label>
              <Select
                value={selectedConfigId}
                onValueChange={handleExistingSelect}
                disabled={llmModelsQuery.isLoading || !llmModelsQuery.data?.length}
              >
                <option value="">请选择已有配置</option>
                {(llmModelsQuery.data ?? []).map((item) => {
                  const providerInfo = getProviderInfo(item.provider)
                  return (
                    <option key={item.id} value={item.id}>
                      {providerInfo?.name ?? item.provider} / {item.modelName} / {item.name}
                    </option>
                  )
                })}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                选择后会立即调用 `updateNodeData(nodeId, {'{'} llmConfigId, parameters {'}'})` 所在的数据链路，并交给现有自动保存流程处理。
              </p>
            </div>

            {selectedConfigId ? (
              <ExistingConfigSummary apiKeys={apiKeysQuery.data ?? []} current={selectedExistingConfig} />
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                尚未选择配置。请从列表中选一项，节点会自动切换到已配置状态。
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="create">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>配置名称</Label>
                <Input placeholder="例如：OpenAI 主模型" {...form.register('name')} />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-error">{form.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Controller
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      {providerCatalog.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>

              {selectedProvider === 'private_cloud' ? (
                <div className="sm:col-span-2">
                  <PrivateCloudConfigSection />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>模型</Label>
                    {selectedProvider === 'custom' ? (
                      <Input placeholder="输入自定义模型名称" {...form.register('modelName')} />
                    ) : (
                      <Controller
                        control={form.control}
                        name="modelName"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <option value="">请选择模型</option>
                            {availableModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </Select>
                        )}
                      />
                    )}
                    {form.formState.errors.modelName ? (
                      <p className="text-[11px] text-error">{form.formState.errors.modelName.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>API Key</Label>
                    <Controller
                      control={form.control}
                      name="apiKeyId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <option value="">暂不绑定 API Key</option>
                          {providerApiKeys.map((apiKey) => (
                            <option key={apiKey.id} value={apiKey.id}>
                              {apiKey.label} / {apiKey.keyPreview}
                              {apiKey.isDefault ? ' / 默认' : ''}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                    {selectedApiKeyId ? null : (
                      <p className="text-[11px] text-warning">未选择 API Key 时，节点会进入 warning 视觉状态。</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">参数设置</p>
                  <p className="text-[11px] text-muted-foreground">这些参数会和配置 ID 一起写回节点数据并触发自动保存。</p>
                </div>

                <Button type="button" variant="ghost" size="sm" onClick={handleResetParameters}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  重置默认
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Temperature</Label>
                  <span className="text-[11px] text-muted-foreground">{selectedTemperature.toFixed(1)}</span>
                </div>
                <Controller
                  control={form.control}
                  name="temperature"
                  render={({ field }) => (
                    <Slider
                      min={0}
                      max={2}
                      step={0.1}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0] ?? DEFAULT_LLM_PARAMETERS.temperature)}
                    />
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input type="number" min={1} placeholder="留空表示使用模型默认值" {...form.register('maxTokens')} />
                  {form.formState.errors.maxTokens ? (
                    <p className="text-[11px] text-error">{form.formState.errors.maxTokens.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Top P</Label>
                    <span className="text-[11px] text-muted-foreground">{selectedTopP.toFixed(2)}</span>
                  </div>
                  <Controller
                    control={form.control}
                    name="topP"
                    render={({ field }) => (
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0] ?? DEFAULT_LLM_PARAMETERS.topP)}
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Frequency Penalty</Label>
                    <span className="text-[11px] text-muted-foreground">{selectedFrequencyPenalty.toFixed(1)}</span>
                  </div>
                  <Controller
                    control={form.control}
                    name="frequencyPenalty"
                    render={({ field }) => (
                      <Slider
                        min={-2}
                        max={2}
                        step={0.1}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0] ?? DEFAULT_LLM_PARAMETERS.frequencyPenalty)}
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Presence Penalty</Label>
                    <span className="text-[11px] text-muted-foreground">{selectedPresencePenalty.toFixed(1)}</span>
                  </div>
                  <Controller
                    control={form.control}
                    name="presencePenalty"
                    render={({ field }) => (
                      <Slider
                        min={-2}
                        max={2}
                        step={0.1}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0] ?? DEFAULT_LLM_PARAMETERS.presencePenalty)}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stop Sequences</Label>
                <Controller
                  control={form.control}
                  name="stop"
                  render={({ field }) => (
                    <TagInput tags={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>

            {createError ? (
              <div className="rounded-lg border border-error/50 bg-error/5 px-3 py-2 text-xs text-error">
                {createError}
              </div>
            ) : null}

            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p>
                  {selectedConfigId
                    ? '保存后会更新当前选中的模型配置，并将最新的 llmConfigId 与参数写回当前节点，随后由现有 workflow 自动保存链路完成持久化。'
                    : '保存后会创建新的模型配置，并将 llmConfigId 与参数写回当前节点，随后由现有 workflow 自动保存链路完成持久化。'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => form.reset(toFormValues(config))}>
                还原当前节点值
              </Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? '保存中...'
                  : selectedConfigId
                    ? '更新并应用当前配置'
                    : '保存并应用新配置'}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  )
})
