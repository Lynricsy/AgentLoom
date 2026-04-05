import { createRoute } from "@tanstack/react-router";
import { WorkspaceDetailPage } from "@/features/workspace";
import { rootRoute } from "../__root";

export const workspaceDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/resources/workspaces/$workspaceId",
  component: () => {
    const { workspaceId } = workspaceDetailRoute.useParams();
    return <WorkspaceDetailPage workspaceId={workspaceId} />;
  },
});
