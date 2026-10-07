import {
  useEffect,
  useId,
  useMemo,
  useState,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
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

/** 触发器需要透传的原生属性子集，与旧 NativeSelect 契约保持一致 */
type GlobalModelSelectorNativeProps = Pick<
  SelectHTMLAttributes<HTMLSelectElement>,
  "aria-label" | "className" | "disabled" | "id" | "name" | "required"
>;

export interface GlobalModelSelectorProps
  extends GlobalModelSelectorNativeProps {
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
 * 用 `Popover` + `Command` 而不是原生 `<select>`，这样才能同时满足：
 * 1. 按 Provider 分组
 * 2. 显示 Provider 图标
 * 3. 保留仅已启用模型的过滤逻辑
 * 4. 模型多时可按名称 / modelId 搜索
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
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-required={required}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal disabled:cursor-not-allowed",
              className,
            )}
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
              <span className="truncate text-subtle-foreground">
                {placeholder}
              </span>
            )}

            <ChevronDown
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandInput aria-label="搜索模型" placeholder="搜索模型…" />
            <CommandList id={listboxId}>
              <CommandEmpty>没有匹配的模型</CommandEmpty>

              {allowEmpty ? (
                <CommandItem
                  value={`__empty__ ${placeholder}`}
                  aria-selected={value === ""}
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{placeholder}</span>
                  {value === "" ? <Check className="size-4 shrink-0" /> : null}
                </CommandItem>
              ) : null}

              {groups.map((group) => (
                <CommandGroup
                  key={group.provider.id}
                  heading={group.provider.name}
                >
                  {group.models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={`${model.name} ${model.modelId} ${group.provider.name}`}
                      aria-selected={model.id === value}
                      onSelect={() => {
                        onValueChange(model.id);
                        setOpen(false);
                      }}
                    >
                      <ProviderIcon
                        slug={group.provider.slug}
                        iconUrl={group.provider.iconUrl}
                        size={16}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {model.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {model.modelId}
                        </span>
                      </span>
                      {model.isDefault ? (
                        <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-medium text-warning">
                          默认
                        </span>
                      ) : null}
                      {model.id === value ? (
                        <Check className="size-4 shrink-0" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
