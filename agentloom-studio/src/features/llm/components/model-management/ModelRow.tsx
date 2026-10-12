import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { TooltipHint } from "@/shared/ui/tooltip";
import type { LlmModelInfo } from "../../types";
import {
  buildPricingBadges,
  CAPABILITY_BADGES,
  ModelMetaChip,
} from "./modelMeta";

interface ModelRowProps {
  model: LlmModelInfo;
  onEdit: (model: LlmModelInfo) => void;
  onDelete: (model: LlmModelInfo) => void;
  onToggleEnabled: (model: LlmModelInfo) => void;
}

export function ModelRow({ model, onEdit, onDelete, onToggleEnabled }: ModelRowProps) {
  const capabilities = model.capabilities ?? {};
  const pricing = model.pricing;
  const activeCapabilities = CAPABILITY_BADGES.filter(
    ({ key }) => capabilities[key],
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 transition-colors duration-150 hover:border-border-hover">
      {/* 启用开关 */}
      <Switch
        checked={model.isEnabled}
        onCheckedChange={() => onToggleEnabled(model)}
        aria-label={`启用 ${model.name}`}
        className="shrink-0"
      />

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground" title={model.name}>
          {model.name}
        </span>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={model.modelId}>
          {model.modelId}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {model.isDefault && (
            <ModelMetaChip tone="warning">默认</ModelMetaChip>
          )}
          <ModelMetaChip tone="primary">
            {model.modelType === "embedding" ? "Embedding" : "聊天"}
          </ModelMetaChip>
          {activeCapabilities.map(({ key, label, icon: Icon }) => (
            <ModelMetaChip key={key} tone="neutral" icon={Icon}>
              {label}
            </ModelMetaChip>
          ))}
        </div>

        {pricing ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {buildPricingBadges(pricing).map((badge) => (
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
      </div>

      {/* 操作 */}
      <div className="flex shrink-0 items-center gap-1">
        <TooltipHint label="编辑模型">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`编辑模型 ${model.name}`}
            onClick={() => onEdit(model)}
          >
            <Pencil />
          </Button>
        </TooltipHint>
        <TooltipHint label="删除模型">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`删除模型 ${model.name}`}
            className="text-muted-foreground hover:text-error"
            onClick={() => onDelete(model)}
          >
            <Trash2 />
          </Button>
        </TooltipHint>
      </div>
    </div>
  );
}
