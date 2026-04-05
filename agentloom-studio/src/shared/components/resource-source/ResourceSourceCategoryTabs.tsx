import {
  RESOURCE_SOURCE_CATEGORY_OPTIONS,
  type ResourceSourceKind,
} from "@/shared/lib/resourceSource";
import { cn } from "@/shared/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

interface ResourceSourceCategoryTabsProps {
  value: ResourceSourceKind;
  onChange: (value: ResourceSourceKind) => void;
  className?: string;
}

export function ResourceSourceCategoryTabs({
  value,
  onChange,
  className,
}: ResourceSourceCategoryTabsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        来源分类
      </span>

      <Tabs
        value={value}
        defaultValue={value}
        onValueChange={(nextValue) => onChange(nextValue as ResourceSourceKind)}
        className="space-y-0"
      >
        <TabsList
          aria-label="来源分类"
          className="w-auto flex-wrap gap-1 rounded-full border border-border/70 bg-muted/40"
        >
          {RESOURCE_SOURCE_CATEGORY_OPTIONS.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="flex-none rounded-full px-4 py-1.5 text-sm"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
