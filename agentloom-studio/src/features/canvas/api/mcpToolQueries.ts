import {
  fetchMcpTools,
  useMcpTools as useSharedMcpTools,
} from "@/features/mcp";

export { fetchMcpTools };

export function useMcpTools(source = "mcp") {
  return useSharedMcpTools(source);
}
