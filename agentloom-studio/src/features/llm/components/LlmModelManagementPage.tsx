import { useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileJson,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Server,
  Sparkles,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Switch } from "@/shared/ui/switch";
import { useToast } from "@/shared/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";
import type {
  ApiKeyInfo,
  ApiProtocol,
  ConnectionTestResult,
  CreateLlmModelInput,
  CreateLlmProviderInput,
  DiscoveredModel,
  LiteLLMModelInfo,
  LlmModelInfo,
  LlmProviderEntity,
  ModelCapabilities,
  ModelPricing,
} from "../types";
import { API_PROTOCOL_VALUES } from "../types";
import {
  useCreateLlmModel,
  useCreateProvider,
  useDeleteLlmModel,
  useDeleteProvider,
  useDiscoverModels,
  useLlmApiKeys,
  useLlmModels,
  useLlmProviders,
  useLookupModelMetadata,
  useResetProviderBaseUrl,
  useTestProviderConnection,
  useUpdateLlmModel,
  useUpdateProvider,
} from "../hooks/useLlmModels";
import { ProviderIcon } from "./ProviderIcon";

// ============================================================================
// 常量
// ============================================================================

const PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  openai_chat: "OpenAI Chat",
  openai_responses: "OpenAI Responses",
  anthropic: "Anthropic",
  google: "Google",
  cohere: "Cohere",
};

// ============================================================================
// 工具函数
// ============================================================================

/** 格式化价格: $X.XX / 1M */
function formatPrice(value: number | undefined | null): string {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
}

function formatTokenThresholdLabel(tokens: number): string {
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M+`;
  if (tokens % 1_000 === 0) return `${tokens / 1_000}K+`;
  return `${tokens}+`;
}

function buildPricingBadges(pricing: ModelPricing) {
  return [
    {
      key: "input",
      label: `输入 ${formatPrice(pricing.inputPer1MTokens)} / 1M`,
    },
    {
      key: "output",
      label: `输出 ${formatPrice(pricing.outputPer1MTokens)} / 1M`,
    },
    ...(pricing.cachedReadPer1MTokens != null
      ? [
          {
            key: "cached-read",
            label: `缓存读 ${formatPrice(pricing.cachedReadPer1MTokens)} / 1M`,
          },
        ]
      : []),
    ...(pricing.cachedWritePer1MTokens != null
      ? [
          {
            key: "cached-write",
            label: `缓存写 ${formatPrice(pricing.cachedWritePer1MTokens)} / 1M`,
          },
        ]
      : []),
    ...(pricing.tiers ?? []).map((tier, index) => ({
      key: `tier-${index}`,
      label:
        `${formatTokenThresholdLabel(tier.aboveTokens)} ` +
        `输入 ${formatPrice(tier.inputPer1MTokens)} / ` +
        `输出 ${formatPrice(tier.outputPer1MTokens)}`,
    })),
  ];
}

/** 能力 badge 配置 */
const CAPABILITY_BADGES: {
  key: keyof ModelCapabilities;
  label: string;
  icon: typeof Eye;
}[] = [
  { key: "vision", label: "视觉", icon: Eye },
  { key: "functionCalling", label: "函数调用", icon: Wrench },
  { key: "reasoning", label: "推理", icon: Brain },
  { key: "structuredOutput", label: "结构化输出", icon: FileJson },
];

// ============================================================================
// 子组件: ProviderListPanel
// ============================================================================

interface ProviderListPanelProps {
  providers: LlmProviderEntity[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (provider: LlmProviderEntity) => void;
  onDelete: (provider: LlmProviderEntity) => void;
  onAdd: () => void;
}

function ProviderListPanel({
  providers,
  isLoading,
  selectedId,
  onSelect,
  onToggleEnabled,
  onDelete,
  onAdd,
}: ProviderListPanelProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.trim().toLowerCase();
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [providers, search]);

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-r border-border">
      {/* 搜索 */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索提供商..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-2 px-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg p-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {search.trim() ? "没有匹配的提供商" : "暂无提供商"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  selectedId === provider.id
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-muted/50",
                )}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(provider.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(provider.id);
                  }
                }}
              >
                <ProviderIcon
                  slug={provider.slug}
                  iconUrl={provider.iconUrl}
                  size={18}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {provider.name}
                </span>

                {/* 启用开关 */}
                <Switch
                  checked={provider.isEnabled}
                  onCheckedChange={() => onToggleEnabled(provider)}
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* 自定义 provider 删除按钮 */}
                {!provider.isBuiltin && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(provider);
                    }}
                    title="删除提供商"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加按钮 */}
      <div className="border-t border-border p-3">
        <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          添加自定义提供商
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件: ModelRow
// ============================================================================

interface ModelRowProps {
  model: LlmModelInfo;
  onEdit: (model: LlmModelInfo) => void;
  onDelete: (model: LlmModelInfo) => void;
  onToggleEnabled: (model: LlmModelInfo) => void;
}

function ModelRow({ model, onEdit, onDelete, onToggleEnabled }: ModelRowProps) {
  const capabilities = model.capabilities ?? {};
  const pricing = model.pricing;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3 transition-colors hover:border-border/80">
      {/* 启用开关 */}
      <Switch
        checked={model.isEnabled}
        onCheckedChange={() => onToggleEnabled(model)}
        className="shrink-0"
      />

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {model.name}
          </span>
          {model.isDefault && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              默认
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-500">
            {model.modelType === "embedding" ? "Embedding" : "聊天"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {model.modelId}
        </p>
        {pricing ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {buildPricingBadges(pricing).map((badge) => (
              <span
                key={badge.key}
                className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* 能力 badges */}
      <div className="hidden shrink-0 items-center gap-1 lg:flex">
        {CAPABILITY_BADGES.map(({ key, label, icon: Icon }) => {
          if (!capabilities[key]) return null;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={label}
            >
              <Icon className="h-3 w-3" />
              {label}
            </span>
          );
        })}
      </div>

      {/* 操作 */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(model)}
          title="编辑"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
          onClick={() => onDelete(model)}
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件: AddModelForm (内联添加模型)
// ============================================================================

interface AddModelFormProps {
  providerId: string;
  providerSlug: string;
  discoveredModels: DiscoveredModel[];
  onClose: () => void;
}

function AddModelForm({
  providerId,
  providerSlug,
  discoveredModels,
  onClose,
}: AddModelFormProps) {
  const { notify } = useToast();
  const createMutation = useCreateLlmModel();
  const lookupMutation = useLookupModelMetadata();

  const [name, setName] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelType, setModelType] = useState<"chat" | "embedding">("chat");
  const [isDefault, setIsDefault] = useState(false);
  const [metadata, setMetadata] = useState<LiteLLMModelInfo | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  /** 自动查询 LiteLLM 元数据 */
  const handleLookup = useCallback(async () => {
    if (!modelId.trim()) return;

    try {
      const result = await lookupMutation.mutateAsync({
        providerSlug,
        modelId: modelId.trim(),
      });
      setMetadata(result);
      setLookupDone(true);

      // 自动填充名称
      if (!name.trim() && modelId.trim()) {
        setName(modelId.trim());
      }
    } catch {
      setLookupDone(true);
      setMetadata(null);
    }
  }, [lookupMutation, modelId, name, providerSlug]);

  const handleSubmit = useCallback(async () => {
    if (!modelId.trim()) {
      notify({ description: "请输入模型 ID", variant: "error" });
      return;
    }

    const payload: CreateLlmModelInput = {
      name: name.trim() || modelId.trim(),
      providerId,
      modelId: modelId.trim(),
      modelType,
      isDefault,
      isEnabled: true,
    };

    // 使用 LiteLLM 元数据填充
    if (metadata) {
      payload.capabilities = metadata.capabilities;
      payload.contextWindow = metadata.contextWindow;
      payload.maxOutputTokens = metadata.maxOutputTokens;
      payload.pricing = metadata.pricing;
    }

    try {
      await createMutation.mutateAsync(payload);
      notify({
        title: "模型已添加",
        description: `${payload.name} 已创建`,
        variant: "success",
      });
      onClose();
    } catch (err) {
      notify({
        title: "创建失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [
    modelId,
    name,
    providerId,
    modelType,
    isDefault,
    metadata,
    createMutation,
    notify,
    onClose,
  ]);

  // 已发现的模型列表 -- 用于快速选择
  const [showDiscovered, setShowDiscovered] = useState(false);

  return (
    <div className="rounded-lg border border-primary/30 bg-surface-elevated p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">添加模型</h4>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* 模型 ID */}
        <div className="space-y-1.5">
          <Label className="text-xs">模型 ID</Label>
          <div className="flex gap-2">
            <Input
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value);
                setLookupDone(false);
                setMetadata(null);
              }}
              placeholder="例如: gpt-4o, claude-3-opus..."
              className="h-8 flex-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleLookup()}
              disabled={lookupMutation.isPending || !modelId.trim()}
              className="h-8 shrink-0"
            >
              {lookupMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="mr-1 h-3.5 w-3.5" />
              )}
              查询
            </Button>
          </div>

          {/* 已发现的模型快速选择 */}
          {discoveredModels.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={() => setShowDiscovered(!showDiscovered)}
              >
                {showDiscovered ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                从已发现的 {discoveredModels.length} 个模型中选择
              </button>
              {showDiscovered && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border bg-background p-1">
                  {discoveredModels.map((dm) => (
                    <button
                      key={dm.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted/50",
                        modelId === dm.id && "bg-primary/10",
                      )}
                      onClick={() => {
                        setModelId(dm.id);
                        if (!name.trim()) setName(dm.name || dm.id);
                        setLookupDone(false);
                        setMetadata(null);
                      }}
                    >
                      <span className="truncate font-medium">
                        {dm.name || dm.id}
                      </span>
                      {dm.ownedBy && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {dm.ownedBy}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LiteLLM 元数据结果 */}
          {lookupDone && (
            <div className="text-[11px]">
              {metadata ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-emerald-500">
                    <Check className="h-3 w-3" />
                    <span>已获取元数据</span>
                    {metadata.contextWindow && (
                      <span className="text-muted-foreground">
                        ctx: {(metadata.contextWindow / 1000).toFixed(0)}k
                      </span>
                    )}
                    {metadata.pricing && (
                      <span className="text-muted-foreground">
                        ${metadata.pricing.inputPer1MTokens}/
                        {metadata.pricing.outputPer1MTokens}
                      </span>
                    )}
                  </div>
                  {metadata.pricing ? (
                    <div className="flex flex-wrap gap-1">
                      {buildPricingBadges(metadata.pricing).map((badge) => (
                        <span
                          key={badge.key}
                          className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground">
                  未找到 LiteLLM 元数据，将使用手动配置
                </span>
              )}
            </div>
          )}
        </div>

        {/* 配置名称 */}
        <div className="space-y-1.5">
          <Label className="text-xs">配置名称</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="留空则使用模型 ID"
            className="h-8 text-xs"
          />
        </div>

        {/* 类型 + 默认 */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">模型类型</Label>
            <Select
              value={modelType}
              onValueChange={(v) => setModelType(v as "chat" | "embedding")}
              className="h-8 text-xs"
            >
              <option value="chat">聊天</option>
              <option value="embedding">Embedding</option>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            <span className="text-xs text-muted-foreground">设为默认</span>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            )}
            添加
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件: EditModelForm (内联编辑模型)
// ============================================================================

interface EditModelFormProps {
  model: LlmModelInfo;
  onClose: () => void;
}

function EditModelForm({ model, onClose }: EditModelFormProps) {
  const { notify } = useToast();
  const updateMutation = useUpdateLlmModel();
  const pricingMeta = model.pricing;

  const [name, setName] = useState(model.name);
  const [isDefault, setIsDefault] = useState(model.isDefault);
  const [contextWindow, setContextWindow] = useState(
    model.contextWindow != null ? String(model.contextWindow) : "",
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    model.maxOutputTokens != null ? String(model.maxOutputTokens) : "",
  );
  const [timeoutMs, setTimeoutMs] = useState(
    model.timeoutMs != null ? String(model.timeoutMs) : "",
  );

  // 能力
  const [vision, setVision] = useState(model.capabilities?.vision ?? false);
  const [functionCalling, setFunctionCalling] = useState(
    model.capabilities?.functionCalling ?? false,
  );
  const [reasoning, setReasoning] = useState(
    model.capabilities?.reasoning ?? false,
  );
  const [structuredOutput, setStructuredOutput] = useState(
    model.capabilities?.structuredOutput ?? false,
  );

  // 定价
  const [inputPrice, setInputPrice] = useState(
    model.pricing?.inputPer1MTokens != null
      ? String(model.pricing.inputPer1MTokens)
      : "",
  );
  const [outputPrice, setOutputPrice] = useState(
    model.pricing?.outputPer1MTokens != null
      ? String(model.pricing.outputPer1MTokens)
      : "",
  );

  const handleSubmit = useCallback(async () => {
    const capabilities: ModelCapabilities = {
      vision,
      functionCalling,
      reasoning,
      structuredOutput,
    };
    const hasExtraPricing =
      pricingMeta?.cachedReadPer1MTokens != null ||
      pricingMeta?.cachedWritePer1MTokens != null ||
      (pricingMeta?.tiers?.length ?? 0) > 0;

    let pricing: ModelPricing | null = null;
    if (inputPrice || outputPrice || hasExtraPricing) {
      pricing = {
        inputPer1MTokens:
          inputPrice.trim() !== ""
            ? parseFloat(inputPrice) || 0
            : (pricingMeta?.inputPer1MTokens ?? 0),
        outputPer1MTokens:
          outputPrice.trim() !== ""
            ? parseFloat(outputPrice) || 0
            : (pricingMeta?.outputPer1MTokens ?? 0),
        ...(pricingMeta?.cachedReadPer1MTokens != null
          ? { cachedReadPer1MTokens: pricingMeta.cachedReadPer1MTokens }
          : {}),
        ...(pricingMeta?.cachedWritePer1MTokens != null
          ? { cachedWritePer1MTokens: pricingMeta.cachedWritePer1MTokens }
          : {}),
        ...(pricingMeta?.tiers?.length ? { tiers: pricingMeta.tiers } : {}),
      };
    }

    try {
      await updateMutation.mutateAsync({
        id: model.id,
        payload: {
          name: name.trim() || model.name,
          isDefault,
          capabilities,
          pricing,
          contextWindow: contextWindow ? parseInt(contextWindow, 10) : null,
          maxOutputTokens: maxOutputTokens
            ? parseInt(maxOutputTokens, 10)
            : null,
          timeoutMs: timeoutMs ? parseInt(timeoutMs, 10) : undefined,
        },
      });
      notify({
        title: "模型已更新",
        description: `${name.trim() || model.name} 已保存`,
        variant: "success",
      });
      onClose();
    } catch (err) {
      notify({
        title: "更新失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [
    name,
    isDefault,
    vision,
    functionCalling,
    reasoning,
    structuredOutput,
    inputPrice,
    outputPrice,
    contextWindow,
    maxOutputTokens,
    timeoutMs,
    model,
    pricingMeta,
    updateMutation,
    notify,
    onClose,
  ]);

  return (
    <div className="rounded-lg border border-primary/30 bg-surface-elevated p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          编辑: {model.modelId}
        </h4>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* 名称 + 默认 */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">配置名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            <span className="text-xs text-muted-foreground">默认</span>
          </div>
        </div>

        {/* Context Window + Max Output */}
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">上下文窗口</Label>
            <Input
              type="number"
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
              placeholder="例如 128000"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">最大输出 Tokens</Label>
            <Input
              type="number"
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(e.target.value)}
              placeholder="例如 4096"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* 能力 */}
        <div className="space-y-1.5">
          <Label className="text-xs">模型能力</Label>
          <div className="flex flex-wrap gap-2">
            {[
              {
                key: "vision" as const,
                label: "视觉",
                state: vision,
                set: setVision,
                Icon: Eye,
              },
              {
                key: "functionCalling" as const,
                label: "函数调用",
                state: functionCalling,
                set: setFunctionCalling,
                Icon: Wrench,
              },
              {
                key: "reasoning" as const,
                label: "推理",
                state: reasoning,
                set: setReasoning,
                Icon: Brain,
              },
              {
                key: "structuredOutput" as const,
                label: "结构化输出",
                state: structuredOutput,
                set: setStructuredOutput,
                Icon: FileJson,
              },
            ].map(({ key, label, state, set, Icon }) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                  state
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-border/80",
                )}
                onClick={() => set(!state)}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 定价 */}
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">输入价格 ($/1M tokens)</Label>
            <Input
              type="number"
              step="0.01"
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
              placeholder="0.00"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">输出价格 ($/1M tokens)</Label>
            <Input
              type="number"
              step="0.01"
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
              placeholder="0.00"
              className="h-8 text-xs"
            />
          </div>
        </div>
        {pricingMeta ? (
          <div className="flex flex-wrap gap-1">
            {buildPricingBadges(pricingMeta).map((badge) => (
              <span
                key={badge.key}
                className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}

        {/* 超时 */}
        <div className="space-y-1.5">
          <Label className="text-xs">超时 (ms)</Label>
          <Input
            type="number"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            placeholder="默认无超时"
            className="h-8 text-xs"
          />
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            )}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件: ProviderConfigPanel
// ============================================================================

interface ProviderConfigPanelProps {
  provider: LlmProviderEntity;
  models: LlmModelInfo[];
  apiKeys: ApiKeyInfo[];
}

function ProviderConfigPanel({
  provider,
  models,
  apiKeys,
}: ProviderConfigPanelProps) {
  const { notify } = useToast();
  const updateProviderMutation = useUpdateProvider();
  const resetBaseUrlMutation = useResetProviderBaseUrl();
  const testConnectionMutation = useTestProviderConnection();
  const discoverMutation = useDiscoverModels();
  const deleteMutation = useDeleteLlmModel();
  const updateModelMutation = useUpdateLlmModel();

  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState<LlmModelInfo | null>(null);
  const [deleteConfirmModel, setDeleteConfirmModel] =
    useState<LlmModelInfo | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );

  // 匹配当前 provider 的 API Keys
  const providerApiKeys = useMemo(
    () => apiKeys.filter((k) => k.provider === provider.slug),
    [apiKeys, provider.slug],
  );

  // Base URL 是否不同于默认
  const baseUrlDiffers =
    provider.defaultBaseUrl != null &&
    provider.baseUrl !== provider.defaultBaseUrl;

  // --- 事件处理 ---

  const handleBaseUrlSave = useCallback(async () => {
    try {
      await updateProviderMutation.mutateAsync({
        id: provider.id,
        input: { baseUrl: baseUrl.trim() || undefined },
      });
      notify({ description: "Base URL 已更新", variant: "success" });
    } catch (err) {
      notify({
        title: "更新失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [updateProviderMutation, provider.id, baseUrl, notify]);

  const handleResetBaseUrl = useCallback(async () => {
    try {
      await resetBaseUrlMutation.mutateAsync(provider.id);
      setBaseUrl(provider.defaultBaseUrl ?? "");
      notify({ description: "Base URL 已恢复默认", variant: "success" });
    } catch (err) {
      notify({
        title: "恢复失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [resetBaseUrlMutation, provider.id, provider.defaultBaseUrl, notify]);

  const handleApiKeyChange = useCallback(
    async (apiKeyId: string) => {
      try {
        await updateProviderMutation.mutateAsync({
          id: provider.id,
          input: { apiKeyId: apiKeyId || undefined },
        });
        notify({ description: "API Key 已更新", variant: "success" });
      } catch (err) {
        notify({
          title: "更新失败",
          description: err instanceof Error ? err.message : "请稍后重试",
          variant: "error",
        });
      }
    },
    [updateProviderMutation, provider.id, notify],
  );

  const handleTestConnection = useCallback(async () => {
    setConnectionResult(null);
    try {
      const result = await testConnectionMutation.mutateAsync({
        id: provider.id,
      });
      setConnectionResult(result);
      if (result.success) {
        notify({
          title: "连接成功",
          description: `延迟 ${result.latencyMs}ms`,
          variant: "success",
        });
      } else {
        notify({
          title: "连接失败",
          description: "无法连接到提供商端点",
          variant: "error",
        });
      }
    } catch (err) {
      notify({
        title: "测试失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [testConnectionMutation, provider.id, notify]);

  const handleDiscoverModels = useCallback(async () => {
    try {
      const result = await discoverMutation.mutateAsync(provider.id);
      setDiscoveredModels(result);
      notify({
        title: "发现完成",
        description: `发现 ${result.length} 个可用模型`,
        variant: "success",
      });
    } catch (err) {
      notify({
        title: "发现失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [discoverMutation, provider.id, notify]);

  const handleToggleModelEnabled = useCallback(
    async (model: LlmModelInfo) => {
      try {
        await updateModelMutation.mutateAsync({
          id: model.id,
          payload: { isEnabled: !model.isEnabled },
        });
      } catch (err) {
        notify({
          title: "更新失败",
          description: err instanceof Error ? err.message : "请稍后重试",
          variant: "error",
        });
      }
    },
    [updateModelMutation, notify],
  );

  const handleConfirmDeleteModel = useCallback(async () => {
    if (!deleteConfirmModel) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirmModel.id);
      notify({
        title: "已删除",
        description: `已删除模型「${deleteConfirmModel.name}」`,
        variant: "success",
      });
      setDeleteConfirmModel(null);
    } catch (err) {
      notify({
        title: "删除失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [deleteConfirmModel, deleteMutation, notify]);

  // 当 provider 切换时重置本地状态
  useMemo(() => {
    setBaseUrl(provider.baseUrl ?? "");
    setConnectionResult(null);
    setShowAddModel(false);
    setEditingModel(null);
    setDeleteConfirmModel(null);
    setDiscoveredModels([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 provider.id 变更时重置
  }, [provider.id]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* 头部 */}
        <div className="flex items-center gap-3">
          <ProviderIcon
            slug={provider.slug}
            iconUrl={provider.iconUrl}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">
                {provider.name}
              </h2>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {PROTOCOL_LABELS[provider.apiProtocol] ?? provider.apiProtocol}
              </span>
              {provider.isBuiltin && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  内置
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {provider.slug}
              {!provider.isEnabled && (
                <span className="ml-2 text-amber-400">(已禁用)</span>
              )}
            </p>
          </div>
        </div>

        {/* Base URL */}
        <section className="space-y-2">
          <Label>Base URL</Label>
          <div className="flex gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider.defaultBaseUrl ?? "输入 API 端点 URL"}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBaseUrlSave()}
              disabled={updateProviderMutation.isPending}
              className="shrink-0"
            >
              {updateProviderMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "保存"
              )}
            </Button>
            {baseUrlDiffers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleResetBaseUrl()}
                disabled={resetBaseUrlMutation.isPending}
                className="shrink-0"
                title="恢复默认 URL"
              >
                {resetBaseUrlMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
          {provider.defaultBaseUrl && (
            <p className="text-[11px] text-muted-foreground">
              默认: {provider.defaultBaseUrl}
            </p>
          )}
        </section>

        {/* API Key */}
        <section className="space-y-2">
          <Label>API Key</Label>
          <Select
            value={provider.apiKeyId ?? ""}
            onValueChange={(v) => void handleApiKeyChange(v)}
          >
            <option value="">
              {providerApiKeys.length === 0
                ? "暂无可用的 API Key"
                : "暂不绑定 API Key"}
            </option>
            {providerApiKeys.map((apiKey) => (
              <option key={apiKey.id} value={apiKey.id}>
                {apiKey.label} / {apiKey.keyPreview}
                {apiKey.isDefault ? " (默认)" : ""}
              </option>
            ))}
          </Select>
          {providerApiKeys.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              该提供商暂无 API Key，请先在 API Keys 管理页面添加。
            </p>
          )}
        </section>

        {/* 连接测试 */}
        <section className="space-y-2">
          <Label>连接测试</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={testConnectionMutation.isPending}
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="mr-1.5 h-3.5 w-3.5" />
              )}
              测试连接
            </Button>
            {connectionResult && (
              <span
                className={cn(
                  "text-xs",
                  connectionResult.success
                    ? "text-emerald-500"
                    : "text-red-400",
                )}
              >
                {connectionResult.success
                  ? `连接成功 (${connectionResult.latencyMs}ms)`
                  : "连接失败"}
                {connectionResult.serverInfo?.version &&
                  ` - v${connectionResult.serverInfo.version}`}
              </span>
            )}
          </div>
        </section>

        {/* 分隔线 */}
        <hr className="border-border" />

        {/* 模型列表 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              模型配置 ({models.length})
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDiscoverModels()}
                disabled={discoverMutation.isPending}
              >
                {discoverMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                发现模型
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowAddModel(true);
                  setEditingModel(null);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加模型
              </Button>
            </div>
          </div>

          {/* 添加模型表单 */}
          {showAddModel && (
            <AddModelForm
              providerId={provider.id}
              providerSlug={provider.slug}
              discoveredModels={discoveredModels}
              onClose={() => setShowAddModel(false)}
            />
          )}

          {/* 编辑模型表单 */}
          {editingModel && (
            <EditModelForm
              key={editingModel.id}
              model={editingModel}
              onClose={() => setEditingModel(null)}
            />
          )}

          {/* 模型行列表 */}
          {models.length === 0 && !showAddModel ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Server className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                该提供商下暂无模型配置
              </p>
              <p className="text-xs text-muted-foreground">
                点击「发现模型」自动获取，或手动「添加模型」
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onEdit={(m) => {
                    setEditingModel(m);
                    setShowAddModel(false);
                  }}
                  onDelete={(m) => setDeleteConfirmModel(m)}
                  onToggleEnabled={(m) => void handleToggleModelEnabled(m)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 删除模型确认对话框 */}
      <AlertDialog
        open={deleteConfirmModel !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmModel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除模型「{deleteConfirmModel?.name}」吗？此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={() => void handleConfirmDeleteModel()}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// 子组件: CreateProviderDialog
// ============================================================================

interface CreateProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateProviderDialog({
  open,
  onOpenChange,
}: CreateProviderDialogProps) {
  const { notify } = useToast();
  const createMutation = useCreateProvider();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiProtocol, setApiProtocol] = useState<ApiProtocol>("openai_chat");

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      notify({ description: "请输入提供商名称", variant: "error" });
      return;
    }
    if (!baseUrl.trim()) {
      notify({ description: "请输入 Base URL", variant: "error" });
      return;
    }

    const input: CreateLlmProviderInput = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiProtocol,
      isEnabled: true,
    };

    try {
      await createMutation.mutateAsync(input);
      notify({
        title: "提供商已创建",
        description: `${name.trim()} 已添加`,
        variant: "success",
      });
      setName("");
      setBaseUrl("");
      setApiProtocol("openai_chat");
      onOpenChange(false);
    } catch (err) {
      notify({
        title: "创建失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [name, baseUrl, apiProtocol, createMutation, notify, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="create-provider-dialog-desc"
          className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              添加自定义提供商
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
            id="create-provider-dialog-desc"
          >
            配置自定义 LLM 提供商，通常为 OpenAI 兼容 API。
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: DeepSeek, Groq..."
              />
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div className="space-y-2">
              <Label>API 协议</Label>
              <Select
                value={apiProtocol}
                onValueChange={(v) => setApiProtocol(v as ApiProtocol)}
              >
                {API_PROTOCOL_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PROTOCOL_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <Button variant="outline">取消</Button>
              </Dialog.Close>
              <Button
                onClick={() => void handleSubmit()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                创建
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================================================
// 主组件: LlmModelManagementPage
// ============================================================================

export function LlmModelManagementPage() {
  const { notify } = useToast();
  const providersQuery = useLlmProviders();
  const modelsQuery = useLlmModels();
  const apiKeysQuery = useLlmApiKeys();
  const updateProviderMutation = useUpdateProvider();
  const deleteProviderMutation = useDeleteProvider();

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirmProvider, setDeleteConfirmProvider] =
    useState<LlmProviderEntity | null>(null);

  const providers = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data],
  );
  const allModels = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const apiKeys = useMemo(() => apiKeysQuery.data ?? [], [apiKeysQuery.data]);

  // 自动选中第一个 provider
  useMemo(() => {
    if (selectedProviderId == null && providers.length > 0 && providers[0]) {
      setSelectedProviderId(providers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 providers 首次加载时
  }, [providers.length]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedProviderModels = useMemo(
    () =>
      selectedProvider
        ? allModels.filter((m) => m.providerId === selectedProvider.id)
        : [],
    [allModels, selectedProvider],
  );

  // --- Provider 操作 ---

  const handleToggleProviderEnabled = useCallback(
    async (provider: LlmProviderEntity) => {
      try {
        await updateProviderMutation.mutateAsync({
          id: provider.id,
          input: { isEnabled: !provider.isEnabled },
        });
      } catch (err) {
        notify({
          title: "更新失败",
          description: err instanceof Error ? err.message : "请稍后重试",
          variant: "error",
        });
      }
    },
    [updateProviderMutation, notify],
  );

  const handleConfirmDeleteProvider = useCallback(async () => {
    if (!deleteConfirmProvider) return;
    try {
      await deleteProviderMutation.mutateAsync(deleteConfirmProvider.id);
      notify({
        title: "已删除",
        description: `已删除提供商「${deleteConfirmProvider.name}」`,
        variant: "success",
      });
      setDeleteConfirmProvider(null);
      // 如果删除的是当前选中的，则清除选中
      if (selectedProviderId === deleteConfirmProvider.id) {
        setSelectedProviderId(
          providers.length > 1
            ? (providers.find((p) => p.id !== deleteConfirmProvider.id)?.id ??
                null)
            : null,
        );
      }
    } catch (err) {
      notify({
        title: "删除失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [
    deleteConfirmProvider,
    deleteProviderMutation,
    notify,
    selectedProviderId,
    providers,
  ]);

  // 全局 loading 态
  const isLoading = providersQuery.isLoading || modelsQuery.isLoading;

  return (
    <div className="flex h-full flex-col">
      {/* 页头 */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold text-foreground">LLM 提供商</h1>
          <p className="text-sm text-muted-foreground">
            管理 AI 模型提供商和模型配置
          </p>
        </div>
      </div>

      {/* 主体: 左右布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧: Provider 列表 */}
        <ProviderListPanel
          providers={providers}
          isLoading={isLoading}
          selectedId={selectedProviderId}
          onSelect={setSelectedProviderId}
          onToggleEnabled={(p) => void handleToggleProviderEnabled(p)}
          onDelete={setDeleteConfirmProvider}
          onAdd={() => setShowCreateDialog(true)}
        />

        {/* 右侧: Provider 配置 */}
        {selectedProvider ? (
          <ProviderConfigPanel
            key={selectedProvider.id}
            provider={selectedProvider}
            models={selectedProviderModels}
            apiKeys={apiKeys}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48 rounded" />
                <Skeleton className="h-4 w-64 rounded" />
              </div>
            ) : providers.length === 0 ? (
              <>
                <Zap className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  暂无提供商
                </p>
                <p className="text-sm text-muted-foreground">
                  添加自定义提供商或等待内置提供商同步
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  添加自定义提供商
                </Button>
              </>
            ) : (
              <>
                <Server className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  从左侧选择一个提供商查看配置
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 创建 Provider 对话框 */}
      <CreateProviderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* 删除 Provider 确认对话框 */}
      <AlertDialog
        open={deleteConfirmProvider !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmProvider(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>确认删除提供商</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除提供商「{deleteConfirmProvider?.name}
            」吗？该提供商下的所有模型配置也将被删除，此操作不可撤销。
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteProviderMutation.isPending}
              onClick={() => void handleConfirmDeleteProvider()}
            >
              {deleteProviderMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
