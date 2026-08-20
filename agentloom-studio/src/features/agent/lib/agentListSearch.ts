import { z } from "zod";

export const agentListSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().catch(undefined),
  pageSize: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  search: z.string().optional().catch(undefined),
  sourceKind: z
    .enum(["manual", "share_imported"])
    .optional()
    .catch(undefined),
});

export type AgentListSearchParams = z.infer<typeof agentListSearchSchema>;

export interface AgentListSearch {
  page: number;
  pageSize: number;
  status: string;
  search: string;
  sourceKind: "manual" | "share_imported";
}

export function parseAgentListSearch(input: unknown): AgentListSearchParams {
  return agentListSearchSchema.parse(input);
}

export function resolveAgentListSearch(
  input: AgentListSearchParams,
): AgentListSearch {
  return {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 12,
    status: input.status ?? "",
    search: input.search ?? "",
    sourceKind: input.sourceKind ?? "manual",
  };
}
