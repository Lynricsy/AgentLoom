import { useCallback, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { NotificationBell } from "@/features/notification";
import { BrandMark } from "@/shared/components/brand";
import { cn } from "@/shared/lib/utils";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

const STORAGE_KEY = "agentloom-sidebar-collapsed";
const GROUP_EXPANDED_KEY = "agentloom-sidebar-group-expanded";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

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
      className="flex h-full shrink-0 flex-col border-r border-border bg-surface"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        transition: "width 250ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* 品牌区 + 折叠开关 */}
      <div
        className={cn(
          "flex h-16 items-center gap-2 px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {collapsed ? null : (
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-surface-elevated"
          >
            <BrandMark size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                AgentLoom
              </p>
              <p className="truncate text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Studio
              </p>
            </div>
          </Link>
        )}

        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <SidebarNav
        pathname={pathname}
        collapsed={collapsed}
        groupExpanded={groupExpanded}
        onToggleGroup={toggleGroup}
      />

      {/* 底部：设置 / 通知 / 用户 */}
      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        <Link
          to="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
            collapsed && "justify-center",
            settingsActive
              ? "bg-primary/10 text-primary"
              : "text-muted hover:bg-surface-elevated hover:text-foreground",
          )}
          title={collapsed ? "设置" : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {collapsed ? null : <span>设置</span>}
        </Link>

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
