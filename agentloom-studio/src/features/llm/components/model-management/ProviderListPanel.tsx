import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/utils";
import type { LlmProviderEntity } from "../../types";
import { ProviderIcon } from "../ProviderIcon";

interface ProviderListPanelProps {
  providers: LlmProviderEntity[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (provider: LlmProviderEntity) => void;
  onDelete: (provider: LlmProviderEntity) => void;
  onAdd: () => void;
}

export function ProviderListPanel({
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
    <div className="flex w-full shrink-0 flex-col border-b border-border lg:w-[280px] lg:border-b-0 lg:border-r">
      {/* 搜索 */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
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
          <p className="px-3 py-6 text-center text-xs text-muted">
            {search.trim() ? "没有匹配的提供商" : "暂无提供商"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-card px-2.5 py-2 transition-colors",
                  selectedId === provider.id
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-surface-elevated",
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
                    aria-label={`删除提供商 ${provider.name}`}
                    className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
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
