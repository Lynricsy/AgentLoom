import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useToast } from "@/shared/ui/toast";
import {
  adaptModelEntityToInfo,
  buildLlmNodePatch,
  DEFAULT_LLM_PARAMETERS,
  getProviderInfo,
  LLM_PROVIDERS,
  normalizeLlmParameters,
  parseLlmModelConfig,
  toLlmModelConfig,
  type CreateLlmModelInput,
  type LlmModelConfig,
  type LlmModelInfo,
  type LlmNodeDataPatch,
  type LlmProvider,
  type LlmProviderEntity,
  type LlmProviderInfo,
} from "../types";
import {
  useCreateLlmModel,
  useLlmModels,
  useLlmProviders,
  useUpdateProvider,
  useUpdateLlmModel,
} from "../hooks/useLlmModels";
import { ManagedApiKeyField } from "./ManagedApiKeyField";
import { ProviderIcon } from "./ProviderIcon";
import { PrivateCloudConfigSection } from "./PrivateCloudConfigSection";
import { GlobalModelSelector } from "./GlobalModelSelector";
import {
  buildProviderCredentialInput,
  hasEffectiveProviderApiKey,
} from "./providerCredentialUtils";

const llmModelFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "请输入配置名称")
      .max(100, "配置名称不能超过 100 个字符"),
    provider: z.string().min(1, "请选择 Provider"),
    modelName: z.string().trim().min(1, "请选择模型"),
    apiKey: z.string(),
    clearApiKey: z.boolean(),
    temperature: z
      .number()
      .min(0, "Temperature 不能小于 0")
      .max(2, "Temperature 不能大于 2"),
    maxTokens: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || /^[1-9]\d*$/.test(value), {
        message: "Max Tokens 必须是正整数",
      }),
    topP: z.number().min(0, "Top P 不能小于 0").max(1, "Top P 不能大于 1"),
    frequencyPenalty: z
      .number()
      .min(-2, "Frequency Penalty 不能小于 -2")
      .max(2, "Frequency Penalty 不能大于 2"),
    presencePenalty: z
      .number()
      .min(-2, "Presence Penalty 不能小于 -2")
      .max(2, "Presence Penalty 不能大于 2"),
    stop: z.array(z.string().trim().min(1)),
    endpointUrl: z
      .string()
      .url("请输入有效的 URL")
      .optional()
      .or(z.literal("")),
    authMethod: z.enum(["api_key", "mtls", "none"]).optional(),
    authConfig: z.record(z.string(), z.string()).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(5000, "超时时间不能小于 5000ms")
      .max(600000, "超时时间不能大于 600000ms")
      .optional(),
  })
  .superRefine((values, ctx) => {
    if (values.provider !== "private_cloud") {
      return;
    }

    if (!values.endpointUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endpointUrl"],
        message: "请输入私有云端点 URL",
      });
    }

    if (!values.authMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authMethod"],
        message: "请选择认证方式",
      });
    }
  });

type LlmModelFormValues = z.infer<typeof llmModelFormSchema>;
type ConfigMode = "existing" | "create";

interface LlmModelConfigPanelProps {
  config: LlmModelConfig | null;
  onApply: (patch: LlmNodeDataPatch) => void;
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function createEmptyConfig(provider: LlmProvider = "openai"): LlmModelConfig {
  const providerInfo = getProviderInfo(provider);
  const initialModelName = providerInfo?.models[0] ?? "";

  return {
    llmConfigId: null,
    name: initialModelName || "未命名模型配置",
    provider,
    modelType: "chat",
    modelName: initialModelName,
    parameters: { ...DEFAULT_LLM_PARAMETERS },
    apiKeyId: null,
    embeddingDimensions: null,
    isDefault: false,
    endpointUrl: provider === "private_cloud" ? "" : null,
    authMethod: provider === "private_cloud" ? "api_key" : null,
    authConfig: null,
    timeoutMs: null,
  };
}

function toFormValues(config: LlmModelConfig | null): LlmModelFormValues {
  const current = config ?? createEmptyConfig();

  return {
    name: current.name,
    provider: current.provider,
    modelName: current.modelName,
    apiKey: "",
    clearApiKey: false,
    temperature: current.parameters.temperature,
    maxTokens:
      typeof current.parameters.maxTokens === "number"
        ? String(current.parameters.maxTokens)
        : "",
    topP: current.parameters.topP,
    frequencyPenalty: current.parameters.frequencyPenalty,
    presencePenalty: current.parameters.presencePenalty,
    stop: current.parameters.stop,
    endpointUrl: current.endpointUrl ?? "",
    authMethod: (current.authMethod === "api_key" ||
    current.authMethod === "mtls"
      ? current.authMethod
      : "none") as "api_key" | "mtls" | "none",
    authConfig: Object.fromEntries(
      Object.entries(current.authConfig ?? {}).map(([k, v]) => [
        k,
        String(v ?? ""),
      ]),
    ),
    timeoutMs:
      typeof current.timeoutMs === "number" ? current.timeoutMs : undefined,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生未知错误";
}

function buildCreatePayload(
  values: LlmModelFormValues,
  providers?: LlmProviderEntity[],
): CreateLlmModelInput {
  const providerEntity = providers?.find((p) => p.slug === values.provider);
  if (!providerEntity) {
    throw new Error(`Provider「${values.provider}」尚未加载完成，请稍后重试`);
  }

  return {
    name: values.name.trim(),
    providerId: providerEntity.id,
    modelId: values.modelName.trim(),
    modelType: "chat",
    parameters: {
      temperature: values.temperature,
      maxTokens: values.maxTokens
        ? Number.parseInt(values.maxTokens, 10)
        : undefined,
      topP: values.topP,
      frequencyPenalty: values.frequencyPenalty,
      presencePenalty: values.presencePenalty,
      stop: values.stop,
    },
    isDefault: false,
    timeoutMs: values.timeoutMs,
  };
}

function TagInput({
  tags,
  onChange,
  placeholder = "输入后回车添加 stop token",
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const commitValue = useCallback(() => {
    const nextValue = inputValue.trim();
    if (!nextValue || tags.includes(nextValue)) {
      setInputValue("");
      return;
    }

    onChange([...tags, nextValue]);
    setInputValue("");
  }, [inputValue, onChange, tags]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitValue();
        return;
      }

      if (
        event.key === "Backspace" &&
        inputValue.length === 0 &&
        tags.length > 0
      ) {
        onChange(tags.slice(0, -1));
      }
    },
    [commitValue, inputValue.length, onChange, tags],
  );

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
          placeholder={tags.length === 0 ? placeholder : "继续添加"}
          className="min-w-[96px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        可添加多个停止序列，用回车确认。
      </p>
    </div>
  );
}

function ExistingConfigSummary({ current }: { current: LlmModelInfo | null }) {
  if (!current) {
    return null;
  }

  const providerInfo = getProviderInfo(
    current.provider,
    current.providerEntity ? [current.providerEntity] : undefined,
  );
  const params = normalizeLlmParameters(current.parameters);
  const hasConfiguredApiKey = Boolean(current.providerEntity?.apiKeyId);

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
          <dd>{params.temperature.toFixed(1)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>API Key</dt>
          <dd>{hasConfiguredApiKey ? "已配置" : "未绑定"}</dd>
        </div>
      </dl>
    </div>
  );
}

export const LlmModelConfigPanel = memo(function LlmModelConfigPanel({
  config,
  onApply,
}: LlmModelConfigPanelProps) {
  const { notify } = useToast();
  // parseLlmModelConfig 是纯函数，每次调用都返回新的对象字面量；而画布侧的
  // customPanelRegistry 也是每次渲染现算一份 config 传进来（引用永不稳定）。
  // 若在渲染期直接调用，下方 reset effect 的依赖便会每次渲染都变化 ->
  // form.reset 触发重渲染 -> effect 再次执行，形成无限循环（面板一打开就冻结）。
  // 因此这里按「内容」而非「引用」稳定化：内容指纹未变就复用上一次的解析结果。
  // 这是一个纯派生缓存（值只由 config 决定），在渲染期写 ref 是安全的。
  const normalizedConfigCacheRef = useRef<{
    fingerprint: string;
    value: LlmModelConfig | null;
  } | null>(null);
  const normalizedConfig = useMemo(() => {
    const parsed = parseLlmModelConfig(config);
    const fingerprint = JSON.stringify(parsed);

    if (normalizedConfigCacheRef.current?.fingerprint === fingerprint) {
      return normalizedConfigCacheRef.current.value;
    }

    normalizedConfigCacheRef.current = { fingerprint, value: parsed };

    return parsed;
  }, [config]);
  const llmModelsQuery = useLlmModels();
  const providersQuery = useLlmProviders();
  const createMutation = useCreateLlmModel();
  const updateMutation = useUpdateLlmModel();
  const updateProviderMutation = useUpdateProvider();
  const [mode, setMode] = useState<ConfigMode>(
    config?.llmConfigId ? "existing" : "create",
  );
  const [selectedConfigId, setSelectedConfigId] = useState(
    config?.llmConfigId ?? "",
  );

  const form = useForm<LlmModelFormValues>({
    resolver: zodResolver(llmModelFormSchema) as Resolver<LlmModelFormValues>,
    defaultValues: toFormValues(config),
  });

  const selectedProvider = useWatch({
    control: form.control,
    name: "provider",
  });
  const providerCatalog = useMemo<LlmProviderInfo[]>(() => {
    if (providersQuery.data && providersQuery.data.length > 0) {
      return providersQuery.data
        .filter(
          (provider) =>
            provider.isEnabled || provider.slug === selectedProvider,
        )
        .map((provider) => {
          const fallbackInfo = LLM_PROVIDERS.find(
            (item) => item.id === provider.slug,
          );

          return {
            id: provider.slug,
            name: provider.name,
            description: fallbackInfo?.description ?? "",
            models: fallbackInfo ? [...fallbackInfo.models] : [],
          };
        });
    }
    return [...LLM_PROVIDERS];
  }, [providersQuery.data, selectedProvider]);
  const selectedModelName = useWatch({
    control: form.control,
    name: "modelName",
  });
  const clearApiKey = useWatch({
    control: form.control,
    name: "clearApiKey",
  });
  const selectedTemperature = useWatch({
    control: form.control,
    name: "temperature",
  });
  const selectedTopP = useWatch({ control: form.control, name: "topP" });
  const selectedFrequencyPenalty = useWatch({
    control: form.control,
    name: "frequencyPenalty",
  });
  const selectedPresencePenalty = useWatch({
    control: form.control,
    name: "presencePenalty",
  });

  const selectedExistingConfig = useMemo(
    () =>
      llmModelsQuery.data?.find((item) => item.id === selectedConfigId) ?? null,
    [llmModelsQuery.data, selectedConfigId],
  );
  const hasSelectableExistingModels = useMemo(() => {
    if (!llmModelsQuery.data || llmModelsQuery.data.length === 0) {
      return false;
    }

    if (!providersQuery.data || providersQuery.data.length === 0) {
      return llmModelsQuery.data.some(
        (item) => item.modelType === "chat" && item.isEnabled,
      );
    }

    const enabledProviderIds = new Set(
      providersQuery.data
        .filter((provider) => provider.isEnabled)
        .map((provider) => provider.id),
    );

    return llmModelsQuery.data.some(
      (item) =>
        item.modelType === "chat" &&
        item.isEnabled &&
        enabledProviderIds.has(item.providerId),
    );
  }, [llmModelsQuery.data, providersQuery.data]);

  const availableModels = useMemo(() => {
    const providerInfo = providerCatalog.find(
      (item) => item.id === selectedProvider,
    );
    const models = providerInfo ? [...providerInfo.models] : [];

    if (selectedModelName && !models.includes(selectedModelName)) {
      models.unshift(selectedModelName);
    }

    return models;
  }, [providerCatalog, selectedModelName, selectedProvider]);
  const selectedProviderEntity = useMemo(
    () =>
      providersQuery.data?.find((item) => item.slug === selectedProvider) ??
      selectedExistingConfig?.providerEntity ??
      null,
    [
      providersQuery.data,
      selectedExistingConfig?.providerEntity,
      selectedProvider,
    ],
  );

  const mutationError =
    createMutation.error ||
    updateMutation.error ||
    updateProviderMutation.error;
  const createError = mutationError ? getErrorMessage(mutationError) : null;
  const queryError = llmModelsQuery.error || providersQuery.error;

  useEffect(() => {
    const initialConfig = normalizedConfig ?? createEmptyConfig();

    form.reset(toFormValues(initialConfig));
    setSelectedConfigId(initialConfig.llmConfigId ?? "");
    setMode(initialConfig.llmConfigId ? "existing" : "create");
  }, [form, normalizedConfig]);

  useEffect(() => {
    if (selectedProvider === "custom" || selectedProvider === "private_cloud") {
      return;
    }

    if (availableModels.length === 0) {
      return;
    }

    const [nextModel] = availableModels;

    if (nextModel && !availableModels.includes(selectedModelName)) {
      form.setValue("modelName", nextModel, { shouldValidate: true });
    }
  }, [availableModels, form, selectedModelName, selectedProvider]);

  const handleModeChange = useCallback(
    (nextMode: ConfigMode) => {
      setMode(nextMode);

      if (nextMode === "create") {
        setSelectedConfigId("");
        return;
      }

      const currentConfig = normalizedConfig ?? createEmptyConfig();
      setSelectedConfigId(currentConfig.llmConfigId ?? "");
      form.reset(toFormValues(currentConfig));
    },
    [form, normalizedConfig],
  );

  const handleResetParameters = useCallback(() => {
    form.setValue("temperature", DEFAULT_LLM_PARAMETERS.temperature, {
      shouldValidate: true,
    });
    form.setValue("maxTokens", "", { shouldValidate: true });
    form.setValue("topP", DEFAULT_LLM_PARAMETERS.topP, {
      shouldValidate: true,
    });
    form.setValue("frequencyPenalty", DEFAULT_LLM_PARAMETERS.frequencyPenalty, {
      shouldValidate: true,
    });
    form.setValue("presencePenalty", DEFAULT_LLM_PARAMETERS.presencePenalty, {
      shouldValidate: true,
    });
    form.setValue("stop", DEFAULT_LLM_PARAMETERS.stop, {
      shouldValidate: true,
    });
  }, [form]);

  const handleExistingSelect = useCallback(
    (value: string) => {
      setSelectedConfigId(value);

      const selectedConfig = llmModelsQuery.data?.find(
        (item) => item.id === value,
      );
      if (!selectedConfig) {
        return;
      }

      const nextConfig = toLlmModelConfig(selectedConfig);
      form.reset(toFormValues(nextConfig));
      onApply(buildLlmNodePatch(selectedConfig));

      notify({
        title: "已应用模型配置",
        description: `已将 ${selectedConfig.name} 绑定到当前 LLM 节点`,
        variant: "success",
      });
    },
    [form, llmModelsQuery.data, notify, onApply],
  );

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (
        values.provider === "private_cloud" &&
        values.authMethod === "api_key" &&
        !hasEffectiveProviderApiKey({
          provider: selectedProviderEntity,
          apiKey: values.apiKey,
          clearApiKey: values.clearApiKey,
        })
      ) {
        form.setError("apiKey", {
          type: "manual",
          message: "请输入 API Key",
        });
        return;
      }

      if (!selectedProviderEntity) {
        throw new Error("Provider 尚未加载完成，请稍后重试");
      }

      const providerInput = buildProviderCredentialInput({
        provider: selectedProviderEntity,
        apiKey: values.apiKey,
        clearApiKey:
          values.provider === "private_cloud" && values.authMethod !== "api_key"
            ? true
            : values.clearApiKey,
        baseUrl:
          values.provider === "private_cloud" ? values.endpointUrl : undefined,
        includeBaseUrl: values.provider === "private_cloud",
      });

      const syncedProvider = providerInput
        ? await updateProviderMutation.mutateAsync({
            id: selectedProviderEntity.id,
            input: providerInput,
          })
        : selectedProviderEntity;

      const payload = buildCreatePayload(
        values,
        providersQuery.data ?? undefined,
      );
      const currentConfigId = selectedConfigId.trim();
      const savedModel = currentConfigId
        ? await updateMutation.mutateAsync({ id: currentConfigId, payload })
        : await createMutation.mutateAsync(payload);

      const adapted = adaptModelEntityToInfo({
        ...savedModel,
        provider: savedModel.provider ?? syncedProvider,
      });
      onApply(buildLlmNodePatch(adapted));
      setSelectedConfigId(savedModel.id);
      form.reset(toFormValues(toLlmModelConfig(adapted)));
      setMode("existing");

      notify({
        title: currentConfigId ? "LLM 配置已更新" : "LLM 配置已保存",
        description: `${savedModel.name} 已应用到当前节点`,
        variant: "success",
      });
    } catch (error) {
      notify({
        title: "保存失败",
        description: getErrorMessage(error),
        variant: "error",
      });
    }
  });

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">LLM 模型配置</h3>
        <p className="text-xs text-muted-foreground">
          选择已有模型配置，或创建一份新的 Provider / Model / Parameters
          组合并立即应用到当前节点。
        </p>
      </div>

      {queryError ? (
        <div className="rounded-lg border border-error/50 bg-error/5 px-3 py-2 text-xs text-error">
          {getErrorMessage(queryError)}
        </div>
      ) : null}

      <Tabs
        value={mode}
        defaultValue={mode}
        onValueChange={(value) => handleModeChange(value as ConfigMode)}
      >
        <TabsList>
          <TabsTrigger value="existing">选择已有配置</TabsTrigger>
          <TabsTrigger value="create">创建新配置</TabsTrigger>
        </TabsList>

        <TabsContent value="existing">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>已保存配置</Label>
              <GlobalModelSelector
                aria-label="已保存配置"
                value={selectedConfigId}
                onValueChange={handleExistingSelect}
                modelType="chat"
                allowEmpty={false}
                placeholder="请选择已有配置"
                disabled={
                  llmModelsQuery.isLoading || !hasSelectableExistingModels
                }
              />
              <p className="text-[11px] text-muted-foreground">
                选择后会立即调用 `updateNodeData(nodeId, {"{"} llmConfigId,
                parameters {"}"})` 所在的数据链路，并交给现有自动保存流程处理。
              </p>
            </div>

            {selectedConfigId ? (
              <ExistingConfigSummary current={selectedExistingConfig} />
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
                <Input
                  placeholder="例如：OpenAI 主模型"
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-error">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Controller
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger aria-label="Provider">
                        <SelectValue placeholder="请选择 Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerCatalog.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {selectedProvider === "private_cloud" ? (
                <div className="sm:col-span-2">
                  <PrivateCloudConfigSection
                    provider={selectedProviderEntity}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>模型</Label>
                    {selectedProvider === "custom" ? (
                      <Input
                        placeholder="输入自定义模型名称"
                        {...form.register("modelName")}
                      />
                    ) : (
                      <Controller
                        control={form.control}
                        name="modelName"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger aria-label="模型">
                              <SelectValue placeholder="请选择模型" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableModels.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                    {form.formState.errors.modelName ? (
                      <p className="text-[11px] text-error">
                        {form.formState.errors.modelName.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label>API Key</Label>
                    <Controller
                      control={form.control}
                      name="apiKey"
                      render={({ field }) => (
                        <ManagedApiKeyField
                          value={field.value}
                          onValueChange={(next) => {
                            field.onChange(next);
                            if (next.trim().length > 0) {
                              form.setValue("clearApiKey", false, {
                                shouldDirty: true,
                              });
                            }
                          }}
                          hasStoredApiKey={Boolean(
                            selectedProviderEntity?.apiKeyId,
                          )}
                          clearRequested={clearApiKey}
                          onClearRequestedChange={(next) =>
                            form.setValue("clearApiKey", next, {
                              shouldDirty: true,
                            })
                          }
                          errorText={
                            form.formState.errors.apiKey?.message as
                              | string
                              | undefined
                          }
                          helperText="输入后会由服务端加密托管。这里修改的是 Provider 级凭据，会影响该 Provider 下的所有模型。"
                          inputTestId="panel-provider-api-key-input"
                        />
                      )}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    参数设置
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    这些参数会和配置 ID 一起写回节点数据并触发自动保存。
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetParameters}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  重置默认
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Temperature</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedTemperature.toFixed(1)}
                  </span>
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
                      onValueChange={(value) =>
                        field.onChange(
                          value[0] ?? DEFAULT_LLM_PARAMETERS.temperature,
                        )
                      }
                    />
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="留空表示使用模型默认值"
                    {...form.register("maxTokens")}
                  />
                  {form.formState.errors.maxTokens ? (
                    <p className="text-[11px] text-error">
                      {form.formState.errors.maxTokens.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Top P</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedTopP.toFixed(2)}
                    </span>
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
                        onValueChange={(value) =>
                          field.onChange(
                            value[0] ?? DEFAULT_LLM_PARAMETERS.topP,
                          )
                        }
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Frequency Penalty</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedFrequencyPenalty.toFixed(1)}
                    </span>
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
                        onValueChange={(value) =>
                          field.onChange(
                            value[0] ?? DEFAULT_LLM_PARAMETERS.frequencyPenalty,
                          )
                        }
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Presence Penalty</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedPresencePenalty.toFixed(1)}
                    </span>
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
                        onValueChange={(value) =>
                          field.onChange(
                            value[0] ?? DEFAULT_LLM_PARAMETERS.presencePenalty,
                          )
                        }
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
                    ? "保存后会更新当前选中的模型配置，并将最新的 llmConfigId 与参数写回当前节点，随后由现有 workflow 自动保存链路完成持久化。"
                    : "保存后会创建新的模型配置，并将 llmConfigId 与参数写回当前节点，随后由现有 workflow 自动保存链路完成持久化。"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => form.reset(toFormValues(config))}
              >
                还原当前节点值
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : selectedConfigId
                    ? "更新并应用当前配置"
                    : "保存并应用新配置"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
});
