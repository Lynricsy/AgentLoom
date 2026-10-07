import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useAuthToken } from "@/features/execution";
import { useIsAuthenticated, useAuthLoading } from "@/features/auth";
import { useAuthStore } from "@/features/auth";
import { useNotificationSocket } from "@/features/notification";
import { AppSidebar, MobileTopBar } from "@/shared/components/app-sidebar";
import { CommandPalette } from "@/shared/components/command-palette/CommandPalette";
import { Spinner } from "@/shared/components/spinner/Spinner";
import { useMediaQuery, LG_QUERY } from "@/shared/hooks/use-media-query";

const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback"];
const PUBLIC_ROUTE_PREFIXES = ["/s/", "/generated-apps/public/"];

export function RootLayout() {
  const authToken = useAuthToken();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  // 壳层按视口二选一挂载：同时挂载会出现两个 NotificationBell，
  // 而它的展开状态在全局 store 上，两个实例的外部点击监听会互相关掉下拉。
  const isDesktop = useMediaQuery(LG_QUERY);

  const pathname = window.location.pathname;
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((r) => pathname.startsWith(r));
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  useNotificationSocket({ authToken: isPublicRoute ? undefined : authToken });

  if (isLoading && !isPublicRoute) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicRoute) {
    window.location.href = `/login?returnUrl=${encodeURIComponent(pathname)}`;
    return null;
  }

  // 认证用户需要完成 onboarding → 重定向到 /onboarding
  if (isAuthenticated && needsOnboarding && !isOnboardingRoute) {
    window.location.href = "/onboarding";
    return null;
  }

  // onboarding 完成后的离开必须由向导在偏好步骤结束时决定，避免租户刷新抢跑最后一步。

  if (isPublicRoute || isOnboardingRoute) {
    return <Outlet />;
  }

  // 设置区不再替换主侧栏：它由 settingsLayoutRoute 提供二级导航并渲染在
  // 下方的 Outlet 内，因此壳层对所有非公开路由完全一致。
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {isDesktop ? <AppSidebar /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {isDesktop ? null : <MobileTopBar />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
