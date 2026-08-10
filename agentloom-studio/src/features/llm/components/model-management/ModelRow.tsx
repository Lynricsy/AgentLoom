import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3 transition-colors hover:border-border/80">
      {/* 启用开关 */}
      <Switch
        checked={model.isEnabled}
        onCheckedChange={() => onToggleEnabled(model)}
        className="shrink-0"
      />

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {model.name}
        </span>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
