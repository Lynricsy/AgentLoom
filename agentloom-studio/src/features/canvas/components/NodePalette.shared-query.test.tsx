import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mcpKeys } from "@/features/mcp";
import { NodePalette } from "./NodePalette";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("@/shared/api/client", () => ({
  apiClient: {
    get: getMock,
  },
}));

vi.mock("@/features/block-library/components/BlockLibraryPanel", () => ({
  BlockLibraryPanel: () => null,
}));

vi.mock("@/features/plugin", () => ({
  useActivePlugins: vi.fn(() => ({ data: undefined })),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeTool(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tool-1",
    name: "search-files",
    title: "搜索文件",
    description: "按关键字搜索文件",
    inputSchema: { type: "object" },
    outputSchema: null,
    portMappingMetadata: {
      inputs: [],
      outputs: [],
    },
    source: "mcp",
    mcpServerConfigId: "config-1",
    isActive: true,
    annotations: null,
    ...overrides,
  };
}

describe("NodePalette shared MCP query integration", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("updates imported tools when the shared MCP list cache changes", async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({
        data: [makeTool()],
      }),
    });

    const queryClient = createQueryClient();
    render(<NodePalette />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText("Imported Tools")).toBeInTheDocument();
      expect(screen.getByText("搜索文件")).toBeInTheDocument();
    });

    act(() => {
      queryClient.setQueryData(mcpKeys.list("mcp"), [
        makeTool({ isActive: false }),
      ]);
    });

    await waitFor(() => {
      expect(screen.queryByText("Imported Tools")).not.toBeInTheDocument();
      expect(screen.queryByText("搜索文件")).not.toBeInTheDocument();
    });

    act(() => {
      queryClient.setQueryData(mcpKeys.list("mcp"), [
        makeTool({ id: "tool-2", name: "summarize-files", title: "总结文件" }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText("Imported Tools")).toBeInTheDocument();
      expect(screen.getByText("总结文件")).toBeInTheDocument();
    });
  });
});
