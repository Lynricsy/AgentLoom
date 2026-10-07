import { useCallback, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
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
import { Switch } from "@/shared/ui/switch";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/lib/utils";
import type {
  CreateLlmModelInput,
  DiscoveredModel,
  LiteLLMModelInfo,
} from "../../types";
import {
  useCreateLlmModel,
  useLookupModelMetadata,
} from "../../hooks/useLlmModels";
import { buildPricingBadges, ModelMetaChip } from "./modelMeta";

interface AddModelFormProps {
  providerId: string;
  providerSlug: string;
  discoveredModels: DiscoveredModel[];
  onClose: () => void;
}

export function AddModelForm({
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
    <div className="rounded-lg border border-primary/30 bg-muted p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">添加模型</h4>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="关闭添加模型表单"
          onClick={onClose}
        >
          <X />
        </Button>
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
              <Button
                variant="link"
                size="xs"
                className="h-auto gap-1 p-0 text-2xs"
                onClick={() => setShowDiscovered(!showDiscovered)}
                aria-expanded={showDiscovered}
              >
                {showDiscovered ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                从已发现的 {discoveredModels.length} 个模型中选择
              </Button>
              {showDiscovered && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-surface p-1">
                  {discoveredModels.map((dm) => (
                    <Button
                      key={dm.id}
                      variant="ghost"
                      size="xs"
                      className={cn(
                        "w-full justify-start gap-2 rounded-sm px-2 py-1 font-normal",
                        modelId === dm.id && "bg-primary/10 text-primary",
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
                        <span className="shrink-0 text-2xs text-muted-foreground">
                          {dm.ownedBy}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LiteLLM 元数据结果 */}
          {lookupDone && (
            <div className="text-2xs">
              {metadata ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-success">
                    <Check className="h-3 w-3" />
                    <span>已获取元数据</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {metadata.contextWindow ? (
                      <ModelMetaChip tone="success" compact>
                        ctx {(metadata.contextWindow / 1000).toFixed(0)}k
                      </ModelMetaChip>
                    ) : null}
                    {metadata.pricing
                      ? buildPricingBadges(metadata.pricing).map((badge) => (
                          <ModelMetaChip
                            key={badge.key}
                            tone={badge.tone}
                            compact
                            numeric
                            title={badge.title}
                          >
                            {badge.label}
                          </ModelMetaChip>
                        ))
                      : null}
                  </div>
                  {metadata.pricing ? (
                    <p className="text-2xs text-muted-foreground">
                      定价单位：$/1M tokens
                    </p>
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
            >
              <SelectTrigger aria-label="模型类型" className="h-8 text-xs">
                <SelectValue placeholder="请选择模型类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">聊天</SelectItem>
                <SelectItem value="embedding">Embedding</SelectItem>
              </SelectContent>
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
