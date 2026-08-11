import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { NativeSelect } from "@/shared/ui/native-select";
import { Slider } from "@/shared/ui/slider";
import { Switch } from "@/shared/ui/switch";
import { useToast } from "@/shared/ui/toast";
import {
  DEFAULT_LLM_PARAMETERS,
  getProviderInfo,
  LLM_MODEL_TYPES,
  LLM_PROVIDERS,
  normalizeLlmParameters,
  type CreateLlmModelInput,
  type LlmModelInfo,
  type LlmProvider,
  type LlmProviderEntity,
  type LlmProviderInfo,
} from "../types";
import {
  useCreateLlmModel,
  useLlmProviders,
  useUpdateProvider,
  useUpdateLlmModel,
} from "../hooks/useLlmModels";
import { ManagedApiKeyField } from "./ManagedApiKeyField";
import { ProviderIcon } from "./ProviderIcon";
import { PrivateCloudConfigSection } from "./PrivateCloudConfigSection";
import {
  buildProviderCredentialInput,
  hasEffectiveProviderApiKey,
} from "./providerCredentialUtils";
const EMBEDDING_PROVIDER_IDS = new Set<LlmProvider>([
  "openai",
  "private_cloud",
]);

const dialogFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "请输入配置名称")
      .max(100, "配置名称不能超过 100 个字符"),
    provider: z.string().min(1, "请选择 Provider"),
    modelType: z.enum(LLM_MODEL_TYPES),
    modelName: z.string().trim().min(1, "请选择或输入模型名称"),
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
    frequencyPenalty: z.number().min(-2).max(2),
    presencePenalty: z.number().min(-2).max(2),
    stop: z.array(z.string()),
    isDefault: z.boolean(),
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
    embeddingDimensions: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || /^[1-9]\d*$/.test(value), {
        message: "Embedding 维度必须是正整数",
      }),
  })
  .superRefine((values, ctx) => {
    if (values.provider !== "private_cloud") return;

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

    if (
      values.modelType === "embedding" &&
      !EMBEDDING_PROVIDER_IDS.has(values.provider)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Embedding 模型仅支持 OpenAI 或 OpenAI 兼容私有云端点",
      });
    }
  })
  .superRefine((values, ctx) => {
    if (values.modelType !== "embedding") return;

    if (!values.embeddingDimensions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["embeddingDimensions"],
        message: "请填写 Embedding 维度",
      });
    }
  });

type DialogFormValues = z.infer<typeof dialogFormSchema>;

function buildDialogPayload(
  values: DialogFormValues,
  providers?: LlmProviderEntity[],
): CreateLlmModelInput {
  const providerEntity = providers?.find((p) => p.slug === values.provider);
  if (!providerEntity) {
    throw new Error(`Provider「${values.provider}」尚未加载完成，请稍后重试`);
  }

  const payload: CreateLlmModelInput = {
    name: values.name.trim(),
    providerId: providerEntity.id,
    modelId: values.modelName.trim(),
    modelType: values.modelType,
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
    isDefault: values.isDefault,
    timeoutMs: values.timeoutMs,
  };

  if (values.modelType === "embedding" && values.embeddingDimensions) {
    payload.embeddingDimensions = Number.parseInt(
      values.embeddingDimensions,
      10,
    );
  }

  return payload;
}

function getDefaultFormValues(
  provider: LlmProvider = "openai",
): DialogFormValues {
  const providerInfo = getProviderInfo(provider);
  const initialModel = providerInfo?.models[0] ?? "";

  return {
    name: "",
    provider,
    modelType: "chat",
    modelName: initialModel,
    apiKey: "",
    clearApiKey: false,
    temperature: DEFAULT_LLM_PARAMETERS.temperature,
    maxTokens: "",
    topP: DEFAULT_LLM_PARAMETERS.topP,
    frequencyPenalty: DEFAULT_LLM_PARAMETERS.frequencyPenalty,
    presencePenalty: DEFAULT_LLM_PARAMETERS.presencePenalty,
    stop: [],
    isDefault: false,
    endpointUrl: "",
    authMethod: "none",
    authConfig: {},
    timeoutMs: undefined,
    embeddingDimensions: "",
  };
}

function modelToFormValues(model: LlmModelInfo): DialogFormValues {
  const params = normalizeLlmParameters(model.parameters);
  return {
    name: model.name,
    provider: model.provider,
    modelType: model.modelType ?? "chat",
    modelName: model.modelName,
    apiKey: "",
    clearApiKey: false,
    temperature: params.temperature,
    maxTokens:
      typeof params.maxTokens === "number" ? String(params.maxTokens) : "",
    topP: params.topP,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    stop: params.stop,
    isDefault: model.isDefault,
    endpointUrl: model.providerEntity?.baseUrl ?? "",
    authMethod: "none" as const,
    authConfig: {},
    timeoutMs:
      typeof model.timeoutMs === "number" ? model.timeoutMs : undefined,
    embeddingDimensions:
      typeof model.embeddingDimensions === "number"
        ? String(model.embeddingDimensions)
        : "",
  };
}

interface LlmModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingModel: LlmModelInfo | null;
}

export function LlmModelConfigDialog({
  open,
  onOpenChange,
  editingModel,
}: LlmModelConfigDialogProps) {
  const { notify } = useToast();
  const isEditMode = editingModel !== null;
  const createMutation = useCreateLlmModel();
  const updateMutation = useUpdateLlmModel();
  const updateProviderMutation = useUpdateProvider();
  const providersQuery = useLlmProviders();
  const [paramsExpanded, setParamsExpanded] = useState(false);

  const form = useForm<DialogFormValues>({
    resolver: zodResolver(dialogFormSchema) as Resolver<DialogFormValues>,
    defaultValues: editingModel
      ? modelToFormValues(editingModel)
      : getDefaultFormValues(),
  });

  const selectedProvider = useWatch({
    control: form.control,
    name: "provider",
  });
  const selectedModelType = useWatch({
    control: form.control,
    name: "modelType",
  });
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

  const providerCatalog = useMemo<LlmProviderInfo[]>(() => {
    const source: LlmProviderInfo[] =
      providersQuery.data && providersQuery.data.length > 0
        ? providersQuery.data.map((p) => ({
            id: p.slug,
            name: p.name,
            description: "",
            models: [] as string[],
          }))
        : [...LLM_PROVIDERS];

    if (selectedModelType !== "embedding") {
      return source;
    }

    return source.filter((provider) => EMBEDDING_PROVIDER_IDS.has(provider.id));
  }, [providersQuery.data, selectedModelType]);
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
      editingModel?.providerEntity ??
      null,
    [editingModel?.providerEntity, providersQuery.data, selectedProvider],
  );

  // Provider 切换时重置模型选择（仅创建模式）
  useEffect(() => {
    if (isEditMode) return;
    if (selectedProvider === "custom" || selectedProvider === "private_cloud")
      return;

    if (availableModels.length > 0) {
      const [firstModel] = availableModels;
      if (firstModel && !availableModels.includes(selectedModelName)) {
        form.setValue("modelName", firstModel, { shouldValidate: true });
      }
    }
  }, [availableModels, form, isEditMode, selectedModelName, selectedProvider]);

  useEffect(() => {
    if (selectedModelType !== "embedding") {
      return;
    }

    if (EMBEDDING_PROVIDER_IDS.has(selectedProvider)) {
      return;
    }

    form.setValue("provider", "openai", {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form, selectedModelType, selectedProvider]);

  // 自动填充名称：provider 或 model 变更时，如果名称为空则自动生成
  useEffect(() => {
    const currentName = form.getValues("name");
    if (currentName) return;

    const providerInfo = getProviderInfo(selectedProvider);
    const providerName = providerInfo?.name ?? selectedProvider;
    if (selectedModelName) {
      form.setValue("name", `${providerName} ${selectedModelName}`);
    }
  }, [form, selectedProvider, selectedModelName]);

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

      if (providerInput) {
        await updateProviderMutation.mutateAsync({
          id: selectedProviderEntity.id,
          input: providerInput,
        });
      }

      const payload = buildDialogPayload(
        values,
        providersQuery.data ?? undefined,
      );

      if (isEditMode) {
        await updateMutation.mutateAsync({ id: editingModel.id, payload });
        notify({
          title: "模型配置已更新",
          description: `${payload.name} 已保存`,
          variant: "success",
        });
      } else {
        await createMutation.mutateAsync(payload);
        notify({
          title: "模型配置已创建",
          description: `${payload.name} 已添加`,
          variant: "success",
        });
      }

      onOpenChange(false);
    } catch (error) {
      notify({
        title: "保存失败",
        description: error instanceof Error ? error.message : "发生未知错误",
        variant: "error",
      });
    }
  });

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    updateProviderMutation.isPending;

  const handleProviderChange = useCallback(
    (value: string) => {
      const nextProvider = value as LlmProvider;
      form.setValue("provider", nextProvider, { shouldValidate: true });

      // 切换 provider 时重置相关字段
      form.setValue("modelName", "", { shouldValidate: false });
      form.setValue("apiKey", "", { shouldValidate: false });
      form.setValue("clearApiKey", false, { shouldValidate: false });

      if (nextProvider === "private_cloud") {
        form.setValue("endpointUrl", "", { shouldValidate: false });
        form.setValue("authMethod", "api_key", { shouldValidate: false });
      } else {
        form.setValue("endpointUrl", "", { shouldValidate: false });
        form.setValue("authMethod", "none", { shouldValidate: false });
      }

      // 为标准 provider 自动选择第一个模型
      const providerInfo = providerCatalog.find((p) => p.id === nextProvider);
      if (
        providerInfo &&
        providerInfo.models.length > 0 &&
        providerInfo.models[0]
      ) {
        form.setValue("modelName", providerInfo.models[0], {
          shouldValidate: true,
        });
      }
    },
    [form, providerCatalog],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="llm-config-dialog-description"
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              {isEditMode ? "编辑模型配置" : "添加模型配置"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description
            className="mt-1 text-sm text-muted-foreground"
            id="llm-config-dialog-description"
          >
            {isEditMode
              ? "修改模型配置的参数和设置。"
              : "配置新的模型，选择用途、提供商、模型和参数。"}
          </Dialog.Description>

          <FormProvider {...form}>
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label>模型用途</Label>
                <Controller
                  control={form.control}
                  name="modelType"
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEditMode}
                    >
                      <option value="chat">聊天 / 推理</option>
                      <option value="embedding">Embedding / 向量化</option>
                    </NativeSelect>
                  )}
                />
              </div>

              {/* Provider 选择 */}
              <div className="space-y-2">
                <Label>提供商</Label>
                {isEditMode ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    <ProviderIcon provider={selectedProvider} size={16} />
                    <span>
                      {getProviderInfo(selectedProvider)?.name ??
                        selectedProvider}
                    </span>
                  </div>
                ) : (
                  <NativeSelect
                    value={selectedProvider}
                    onValueChange={handleProviderChange}
                  >
                    {providerCatalog.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>

              {/* 模型和 API Key（非 private_cloud） */}
              {selectedProvider === "private_cloud" ? (
                <PrivateCloudConfigSection provider={selectedProviderEntity} />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>模型</Label>
                    {selectedProvider === "custom" ? (
                      <>
                        <Input
                          placeholder="输入自定义模型名称"
                          {...form.register("modelName")}
                        />
                        {form.formState.errors.modelName ? (
                          <p className="text-[11px] text-error">
                            {form.formState.errors.modelName.message}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Controller
                          control={form.control}
                          name="modelName"
                          render={({ field }) => (
                            <NativeSelect
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <option value="">请选择模型</option>
                              {availableModels.map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                            </NativeSelect>
                          )}
                        />
                        {form.formState.errors.modelName ? (
                          <p className="text-[11px] text-error">
                            {form.formState.errors.modelName.message}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
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
                          inputTestId="provider-api-key-input"
                        />
                      )}
                    />
                  </div>
                </>
              )}

              {/* 配置名称 */}
              <div className="space-y-2">
                <Label>配置名称</Label>
                <Input
                  placeholder="例如：GPT-4o 主配置"
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-error">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              {selectedModelType === "embedding" ? (
                <div className="space-y-2">
                  <Label>Embedding 维度</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="例如 1536"
                    {...form.register("embeddingDimensions")}
                  />
                  {form.formState.errors.embeddingDimensions ? (
                    <p className="text-[11px] text-error">
                      {form.formState.errors.embeddingDimensions.message}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      向量库会按该维度创建索引，需与模型返回维度保持一致。
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
                    onClick={() => setParamsExpanded(!paramsExpanded)}
                  >
                    <span>参数设置</span>
                    {paramsExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {paramsExpanded && (
                    <div className="space-y-4 border-t border-border px-3 py-3">
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
                              onValueChange={(v) =>
                                field.onChange(
                                  v[0] ?? DEFAULT_LLM_PARAMETERS.temperature,
                                )
                              }
                            />
                          )}
                        />
                      </div>

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
                              onValueChange={(v) =>
                                field.onChange(
                                  v[0] ?? DEFAULT_LLM_PARAMETERS.topP,
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
                              min={0}
                              max={2}
                              step={0.1}
                              value={[field.value]}
                              onValueChange={(v) =>
                                field.onChange(
                                  v[0] ??
                                    DEFAULT_LLM_PARAMETERS.frequencyPenalty,
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
                              min={0}
                              max={2}
                              step={0.1}
                              value={[field.value]}
                              onValueChange={(v) =>
                                field.onChange(
                                  v[0] ??
                                    DEFAULT_LLM_PARAMETERS.presencePenalty,
                                )
                              }
                            />
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 设为默认 */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>设为默认配置</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedModelType === "embedding"
                      ? "默认 Embedding 模型会在新建知识库时自动选中"
                      : "默认配置会在新建 LLM 节点时自动选中"}
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="isDefault"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {isEditMode ? "保存修改" : "创建配置"}
                </Button>
              </div>
            </form>
          </FormProvider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
