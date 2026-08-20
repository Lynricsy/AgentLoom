import { z } from "zod";

export const workflowListSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().catch(undefined),
  pageSize: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  search: z.string().optional().catch(undefined),
  sourceKind: z
    .enum(["manual", "share_imported"])
    .optional()
    .catch(undefined),
});

export type WorkflowListSearchParams = z.infer<typeof workflowListSearchSchema>;

export interface WorkflowListSearch {
  page: number;
  pageSize: number;
  status: string;
  search: string;
  sourceKind: "manual" | "share_imported";
}

export function parseWorkflowListSearch(
  input: unknown,
): WorkflowListSearchParams {
  return workflowListSearchSchema.parse(input);
}

export function resolveWorkflowListSearch(
  input: WorkflowListSearchParams,
): WorkflowListSearch {
  return {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 12,
    status: input.status ?? "",
    search: input.search ?? "",
    sourceKind: input.sourceKind ?? "manual",
  };
}
