import { useMemo } from 'react'
import { useWorkflowInputSchema } from '@/features/workflow/api/workflowQueries'
import type { WorkflowInputSchema, WorkflowStatus } from '@/features/workflow/types'
import { normalizeWorkflowInputSchema } from '../lib/schemaHelpers'

interface UseResolvedWorkflowInputSchemaOptions {
  workflowId: string
  workflowStatus: WorkflowStatus
  draftInputSchema?: WorkflowInputSchema | null
  preferDraftSchema?: boolean
  enabled?: boolean
}

export function useResolvedWorkflowInputSchema({
  workflowId,
  workflowStatus,
  draftInputSchema,
  preferDraftSchema = false,
  enabled = true,
}: UseResolvedWorkflowInputSchemaOptions) {
  const isPublished = workflowStatus === 'published'
  const shouldUseDraftSchema = preferDraftSchema || !isPublished
  const publishedSchemaQuery = useWorkflowInputSchema(workflowId, {
    enabled: enabled && isPublished && !shouldUseDraftSchema,
  })

  const schema = useMemo(
    () =>
      shouldUseDraftSchema
        ? normalizeWorkflowInputSchema(draftInputSchema)
        : isPublished
        ? publishedSchemaQuery.data ?? normalizeWorkflowInputSchema(null)
        : normalizeWorkflowInputSchema(draftInputSchema),
    [draftInputSchema, isPublished, publishedSchemaQuery.data, shouldUseDraftSchema],
  )

  return {
    schema,
    isLoading: isPublished && !shouldUseDraftSchema ? publishedSchemaQuery.isLoading : false,
    error: isPublished && !shouldUseDraftSchema ? publishedSchemaQuery.error : null,
    refetch: publishedSchemaQuery.refetch,
  }
}
