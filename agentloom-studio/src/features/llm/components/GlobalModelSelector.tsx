import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { SelectProps } from "@/shared/ui/select";
import { useLlmModels, useLlmProviders } from "../hooks/useLlmModels";
import type { LlmModelInfo, LlmProviderEntity } from "../types";
import { ProviderIcon } from "./ProviderIcon";

interface ProviderModelGroup {
  provider: LlmProviderEntity;
  models: LlmModelInfo[];
}

interface SelectedModelEntry {
  provider: LlmProviderEntity;
  model: LlmModelInfo;
}

export interface GlobalModelSelectorProps extends Pick<
  SelectProps,
  "aria-label" | "className" | "disabled" | "id" | "name" | "required"
> {
  /** 当前选中的模型配置 ID */
  value: string;
  /** 选中值变更回调 */
  onValueChange: (value: string) => void;
  /** 过滤模型类型，不传则显示全部 */
  modelType?: "chat" | "embedding";
  /** 空选项的显示文本 */
  placeholder?: string;
  /** 仅显示已启用的模型（默认 true） */
  enabledOnly?: boolean;
  /** 是否允许选择空值（默认 true） */
  allowEmpty?: boolean;
}

/**
 * 全局模型选择器。
 *
 * 使用自定义浮层而不是原生 `<select>`，这样才能同时满足：
 * 1. 按 Provider 分组
 * 2. 显示 Provider 图标
 * 3. 保留仅已启用模型的过滤逻辑
 */
export function GlobalModelSelector({
  value,
  onValueChange,
  modelType,
  placeholder = "请选择模型",
  enabledOnly = true,
  allowEmpty = true,
  id,
  name,
  required,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: GlobalModelSelectorProps) {
  const { data: providers } = useLlmProviders();
  const { data: models } = useLlmModels();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const listboxId = id ? `${id}-listbox` : `global-model-selector-${reactId}`;

  const groups = useMemo<ProviderModelGroup[]>(() => {
    if (!providers || !models) return [];

    const sortedProviders = [...providers]
      .filter((provider) => (enabledOnly ? provider.isEnabled : true))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.name.localeCompare(right.name);
      });

    const providerMap = new Map(
      sortedProviders.map((provider) => [provider.id, provider]),
    );
    const grouped = new Map<string, LlmModelInfo[]>();

    for (const model of models) {
      if (modelType && model.modelType !== modelType) {
        continue;
      }
      if (enabledOnly && !model.isEnabled) {
        continue;
      }
      if (!providerMap.has(model.providerId)) {
        continue;
      }

      const existing = grouped.get(model.providerId) ?? [];
      existing.push(model);
      grouped.set(model.providerId, existing);
    }

    return sortedProviders
      .map((provider) => ({
        provider,
        models:
          grouped.get(provider.id)?.sort((left, right) => {
            if (left.isDefault !== right.isDefault) {
              return left.isDefault ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
          }) ?? [],
      }))
      .filter((group) => group.models.length > 0);
  }, [enabledOnly, modelType, models, providers]);

  const selectedEntry = useMemo<SelectedModelEntry | null>(() => {
    if (!value || !providers || !models) {
      return null;
    }

    const model = models.find((item) => item.id === value);
    if (!model) {
      return null;
    }

    const provider =
      model.providerEntity ??
      providers.find((item) => item.id === model.providerId) ??
      null;
    if (!provider) {
      return null;
    }

    return { provider, model };
  }, [models, providers, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div ref={containerRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-required={required}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        {selectedEntry ? (
          <span className="flex min-w-0 items-center gap-2">
            <ProviderIcon
              slug={selectedEntry.provider.slug}
              iconUrl={selectedEntry.provider.iconUrl}
              size={16}
            />
            <span className="min-w-0 truncate">
              {selectedEntry.model.name}
              <span className="ml-1 text-muted-foreground">
                ({selectedEntry.provider.name})
              </span>
            </span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-surface-elevated p-2 shadow-2xl"
        >
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                value === ""
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted/60",
              )}
              onClick={() => {
                onValueChange("");
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{placeholder}</span>
              {value === "" ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          ) : null}

          {groups.map((group) => (
            <div key={group.provider.id} className="mt-2 first:mt-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <ProviderIcon
                  slug={group.provider.slug}
                  iconUrl={group.provider.iconUrl}
                  size={14}
                />
                <span>{group.provider.name}</span>
              </div>

              <div className="space-y-1">
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={model.id === value}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      model.id === value
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted/60",
                    )}
                    onClick={() => {
                      onValueChange(model.id);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {model.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {model.modelId}
                      </span>
                    </span>
                    {model.isDefault ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        默认
                      </span>
                    ) : null}
                    {model.id === value ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
