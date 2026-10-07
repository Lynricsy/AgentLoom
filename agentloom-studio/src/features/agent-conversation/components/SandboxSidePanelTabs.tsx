import { useState, type ReactNode } from "react";
import { Cpu, Monitor } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/utils";

type SandboxSideTab = "computer" | "harness";

interface SandboxSidePanelTabsProps {
  computerPanel: ReactNode;
  harnessPanel: ReactNode;
}

/**
 * 沙箱右栏上半区的「电脑 / Harness」切换。
 * 两个面板都保持挂载、只切可见性：电脑面板的子 tab 与轮询状态不因切换而重置。
 */
export function SandboxSidePanelTabs({
  computerPanel,
  harnessPanel,
}: SandboxSidePanelTabsProps) {
  const [tab, setTab] = useState<SandboxSideTab>("computer");

  return (
    <Tabs
      value={tab}
      defaultValue="computer"
      onValueChange={(value) => setTab(value as SandboxSideTab)}
      className="flex h-full flex-col gap-1.5 space-y-0"
    >
      <TabsList className="w-auto shrink-0 self-start p-0.5" aria-label="右栏视图">
        <TabsTrigger value="computer" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
          <Monitor className="h-3 w-3" />
          电脑
        </TabsTrigger>
        <TabsTrigger value="harness" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
          <Cpu className="h-3 w-3" />
          Harness
        </TabsTrigger>
      </TabsList>

      <div className={cn("min-h-0 flex-1", tab !== "computer" && "hidden")}>
        {computerPanel}
      </div>
      <div className={cn("min-h-0 flex-1", tab !== "harness" && "hidden")}>
        {harnessPanel}
      </div>
    </Tabs>
  );
}
