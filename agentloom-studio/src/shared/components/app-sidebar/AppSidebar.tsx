import { useCallback, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useAuthToken } from "@/features/auth";
import { getInterventionPolicyRoleFromToken } from "@/features/intervention-policy";
import { NotificationBell } from "@/features/notification";
import { BrandMark } from "@/shared/components/brand";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { NavItemLink } from "./NavItemLink";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

const STORAGE_KEY = "agentloom-sidebar-collapsed";
const GROUP_EXPANDED_KEY = "agentloom-sidebar-group-expanded";

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getInitialGroupExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUP_EXPANDED_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* noop */
  }
  return {};
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [groupExpanded, setGroupExpanded] = useState(getInitialGroupExpanded);
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const role = getInterventionPolicyRoleFromToken(useAuthToken());

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setGroupExpanded((prev) => {
      const next = { ...prev, [groupId]: !(prev[groupId] ?? true) };
      try {
        localStorage.setItem(GROUP_EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const settingsActive = pathname.startsWith("/settings");

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-300 ease-out-expo",
        collapsed
          ? "w-[var(--spacing-sidebar-collapsed)]"
          : "w-[var(--spacing-sidebar)]",
      )}
    >
      {/* 品牌区 + 折叠开关：品牌常驻（flex-1 随宽度收缩并淡出），开关始终贴在右侧；
          收起后品牌宽度为 0，开关恰好落在 64px 图标列中线，宽度过渡期间不瞬移 */}
      <div className="flex h-14 items-center px-4">
        <Link
          to="/"
          tabIndex={collapsed ? -1 : undefined}
          aria-hidden={collapsed || undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-md py-1 pr-2 transition-[opacity,background-color] duration-150 hover:bg-muted",
            collapsed && "pointer-events-none opacity-0",
          )}
        >
          <BrandMark size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              AgentLoom
            </p>
            <p className="truncate text-2xs uppercase tracking-wider text-muted-foreground">
              Studio
            </p>
          </div>
        </Link>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>

      <SidebarNav
        pathname={pathname}
        role={role}
        collapsed={collapsed}
        groupExpanded={groupExpanded}
        onToggleGroup={toggleGroup}
      />

      {/* 底部：设置 / 通知 / 用户 */}
      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        <NavItemLink
          to="/settings"
          icon={Settings}
          label="设置"
          active={settingsActive}
          collapsed={collapsed}
          indicatorLayoutId="sidebar-app-nav-indicator"
        />

        <div
          className={cn("flex items-center", collapsed ? "justify-center" : "px-2")}
          title={collapsed ? "通知" : undefined}
        >
          <NotificationBell />
        </div>

        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
