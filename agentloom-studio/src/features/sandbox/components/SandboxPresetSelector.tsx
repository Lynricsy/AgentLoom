import { memo, useState } from "react";
import { Cpu, MemoryStick, HardDrive, X, Plus, Pencil } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  useSandboxPresetStore,
  getAllPresets,
  findMatchingPreset,
  type SandboxPreset,
} from "../stores/sandboxPresetStore";

interface SandboxPresetSelectorProps {
  selectedPresetId?: string;
  onSelect: (preset: SandboxPreset) => void;
  onSaveAsPreset?: (preset: {
    name: string;
    cpu: number;
    memory: number;
    disk: number;
  }) => void;
  currentConfig?: { cpu: number; memory: number; disk: number };
  compact?: boolean;
}

const PresetCard = memo(function PresetCard({
  preset,
  isSelected,
  onSelect,
  onRemove,
  onStartRename,
  compact,
}: {
  preset: SandboxPreset;
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onStartRename?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={onSelect}
        className={cn(
          "h-auto w-full flex-col items-stretch gap-0 whitespace-normal rounded-lg px-3 text-left font-normal shadow-none [&_svg]:size-2.5",
          compact ? "py-2" : "py-2.5",
          isSelected
            ? "border-primary bg-primary/5 hover:border-primary hover:bg-primary/5"
            : "border-border bg-muted hover:border-primary/50 hover:bg-muted",
        )}
      >
        <span
          className={cn(
            "block text-xs font-medium",
            isSelected ? "text-primary" : "text-foreground",
          )}
        >
          {preset.name}
          {preset.isBuiltin && (
            <span className="ml-1 text-2xs text-muted-foreground">
              (内置)
            </span>
          )}
        </span>

        <span className="mt-1 flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Cpu className="h-2.5 w-2.5" />
            {preset.cpu}核
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MemoryStick className="h-2.5 w-2.5" />
            {preset.memory}MB
          </span>
          <span className="inline-flex items-center gap-0.5">
            <HardDrive className="h-2.5 w-2.5" />
            {preset.disk}GB
          </span>
        </span>
      </Button>

      {!preset.isBuiltin && (onStartRename || onRemove) && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {onStartRename && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${preset.name} 重命名`}
              onClick={onStartRename}
              className="h-5 w-5 rounded-full bg-muted text-muted-foreground shadow-sm ring-1 ring-border hover:bg-muted hover:text-foreground [&_svg]:size-3"
            >
              <Pencil />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${preset.name} 删除`}
              onClick={onRemove}
              className="h-5 w-5 rounded-full bg-muted text-muted-foreground shadow-sm ring-1 ring-border hover:bg-muted hover:text-foreground [&_svg]:size-3"
            >
              <X />
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

export const SandboxPresetSelector = memo(function SandboxPresetSelector({
  selectedPresetId,
  onSelect,
  onSaveAsPreset,
  currentConfig,
  compact = false,
}: SandboxPresetSelectorProps) {
  const customPresets = useSandboxPresetStore((s) => s.customPresets);
  const removePreset = useSandboxPresetStore((s) => s.removePreset);
  const renamePreset = useSandboxPresetStore((s) => s.renamePreset);
  const allPresets = getAllPresets(customPresets);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState("");

  // 判断当前配置是否已经匹配某个预设
  const matchedPreset = currentConfig
    ? findMatchingPreset(allPresets, currentConfig)
    : undefined;
  const activePresetId = selectedPresetId ?? matchedPreset?.id;
  const canSave = currentConfig && !matchedPreset && onSaveAsPreset;

  function handleSavePreset() {
    if (!newPresetName.trim() || !currentConfig || !onSaveAsPreset) return;
    onSaveAsPreset({
      name: newPresetName.trim(),
      ...currentConfig,
    });
    setNewPresetName("");
    setShowSaveForm(false);
  }

  function handleStartRename(preset: SandboxPreset) {
    setShowSaveForm(false);
    setNewPresetName("");
    setEditingPresetId(preset.id);
    setEditingPresetName(preset.name);
  }

  function clearRename() {
    setEditingPresetId(null);
    setEditingPresetName("");
  }

  function handleRenamePreset() {
    if (!editingPresetId || !editingPresetName.trim()) return;
    renamePreset(editingPresetId, editingPresetName.trim());
    clearRename();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          className={cn(
            "font-medium text-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          配置预设
        </label>
        {canSave && !showSaveForm && (
          <Button
            variant="link"
            size="xs"
            onClick={() => {
              clearRename();
              setShowSaveForm(true);
            }}
            className="h-auto gap-1 p-0 text-2xs font-normal hover:text-primary/80 hover:no-underline [&_svg]:size-3"
          >
            <Plus />
            保存为预设
          </Button>
        )}
      </div>

      <div
        className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-3")}
      >
        {allPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={activePresetId === preset.id}
            onSelect={() => onSelect(preset)}
            onRemove={
              !preset.isBuiltin ? () => removePreset(preset.id) : undefined
            }
            onStartRename={
              !preset.isBuiltin ? () => handleStartRename(preset) : undefined
            }
            compact={compact}
          />
        ))}
      </div>

      {editingPresetId && (
        <div className="flex items-center gap-2">
          <Input
            value={editingPresetName}
            onChange={(e) => setEditingPresetName(e.target.value)}
            placeholder="重命名预设"
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenamePreset();
              if (e.key === "Escape") clearRename();
            }}
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleRenamePreset}
            disabled={!editingPresetName.trim()}
          >
            重命名
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={clearRename}
          >
            取消
          </Button>
        </div>
      )}

      {showSaveForm && (
        <div className="flex items-center gap-2">
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="预设名称"
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSavePreset();
              if (e.key === "Escape") {
                setShowSaveForm(false);
                setNewPresetName("");
              }
            }}
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleSavePreset}
            disabled={!newPresetName.trim()}
          >
            保存
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setShowSaveForm(false);
              setNewPresetName("");
            }}
          >
            取消
          </Button>
        </div>
      )}
    </div>
  );
});
