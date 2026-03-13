import { createRoute } from "@tanstack/react-router";
import { ToolLibraryPage } from "@/features/mcp";
import { rootRoute } from "../__root";

export const toolLibraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/tool-library",
  component: ToolLibraryPage,
});
