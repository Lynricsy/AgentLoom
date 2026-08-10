import { useCallback, useState } from "react";
import { Brain, Eye, FileJson, Loader2, Wrench, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/lib/utils";
import type {
  LlmModelInfo,
  ModelCapabilities,
  ModelPricing,
} from "../../types";
import { useUpdateLlmModel } from "../../hooks/useLlmModels";
import { buildPricingBadges, ModelMetaChip } from "./modelMeta";

interface EditModelFormProps {
  model: LlmModelInfo;
  onClose: () => void;
}

export function EditModelForm({ model, onClose }: EditModelFormProps) {
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
          <div className="flex flex-wrap gap-1.5">
            {buildPricingBadges(pricingMeta).map((badge) => (
              <ModelMetaChip
                key={badge.key}
                tone={badge.tone}
                compact
                numeric
                title={badge.title}
              >
                {badge.label}
              </ModelMetaChip>
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
