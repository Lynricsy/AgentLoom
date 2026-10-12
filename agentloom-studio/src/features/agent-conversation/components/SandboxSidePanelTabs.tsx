import { useState, type ReactNode } from "react";
import { Cpu, Monitor } from "lucide-react";
import { motion } from "motion/react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { fadeIn } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";

type SandboxSideTab = "computer" | "harness";

interface SandboxSidePanelTabsProps {
  computerPanel: ReactNode;
  harnessPanel: ReactNode;
}

/**
 * 沙箱右栏上半区的「电脑 / Harness」切换。
 * 两个面板都保持挂载、只切可见性：电脑面板的子 tab 与轮询状态不因切换而重置；
 * 切到可见时淡入，避免硬切闪烁。
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
      <TabsList className="w-auto shrink-0 self-start" aria-label="右栏视图">
        <TabsTrigger value="computer" className="flex items-center gap-1.5">
          <Monitor className="size-3.5" />
          电脑
        </TabsTrigger>
        <TabsTrigger value="harness" className="flex items-center gap-1.5">
          <Cpu className="size-3.5" />
          Harness
        </TabsTrigger>
      </TabsList>

      <motion.div
        initial={false}
        animate={{ opacity: tab === "computer" ? 1 : 0 }}
        transition={fadeIn.transition}
        className={cn("min-h-0 flex-1", tab !== "computer" && "hidden")}
      >
        {computerPanel}
      </motion.div>
      <motion.div
        initial={false}
        animate={{ opacity: tab === "harness" ? 1 : 0 }}
        transition={fadeIn.transition}
        className={cn("min-h-0 flex-1", tab !== "harness" && "hidden")}
      >
        {harnessPanel}
      </motion.div>
    </Tabs>
  );
}
