import { Outlet, createRootRoute, Link } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useAuthToken } from "@/features/execution";
import {
  NotificationBell,
  useNotificationSocket,
} from "@/features/notification";
import { indexRoute } from "./index";
import { workflowCanvasRoute } from "./workflows/$workflowId";
import { knowledgeBasesRoute } from "./settings/knowledge-bases";
import { knowledgeBaseDetailRoute } from "./settings/knowledge-bases/$knowledgeBaseId";
import { executionDebugRoute } from "./executions/$executionId";
import { toolLibraryRoute } from "./settings/tool-library";
import { templatesRoute } from "./templates";
import { marketplaceRoute } from "./marketplace";
import { marketplaceMyListingsRoute } from './marketplace.my-listings';

function RootLayout() {
  const authToken = useAuthToken();

  useNotificationSocket({ authToken });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <nav className="flex items-center gap-1">
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId: "draft" }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              工作流
            </Link>
            <Link
              to="/templates"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              模板
            </Link>
            <Link
              to="/marketplace"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              市场
            </Link>
            <Link
              to="/settings/tool-library"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              工具库
            </Link>
          </nav>
          <NotificationBell />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>

      <TanStackRouterDevtools />
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowCanvasRoute,
  executionDebugRoute,
  knowledgeBasesRoute,
  knowledgeBaseDetailRoute,
  toolLibraryRoute,
  templatesRoute,
  marketplaceRoute,
  marketplaceMyListingsRoute,
]);
