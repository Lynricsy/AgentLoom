import { useQuery } from "@tanstack/react-query";
import { fetchMcpTools } from "./mcpApi";
import { mcpKeys } from "./mcpKeys";

export { fetchMcpTools, mcpKeys };

export function useMcpTools(source = "mcp") {
  return useQuery({
    queryKey: mcpKeys.list(source),
    queryFn: () => fetchMcpTools(source),
    staleTime: 30_000,
  });
}
