import { useMemo } from 'react'
import { useWorkflowInputSchema } from '@/features/workflow/api/workflowQueries'
import type { WorkflowInputSchema, WorkflowStatus } from '@/features/workflow/types'
import { normalizeWorkflowInputSchema } from '../lib/schemaHelpers'

interface UseResolvedWorkflowInputSchemaOptions {
  workflowId: string
  workflowStatus: WorkflowStatus
  draftInputSchema?: WorkflowInputSchema | null
  enabled?: boolean
}

export function useResolvedWorkflowInputSchema({
  workflowId,
  workflowStatus,
  draftInputSchema,
  enabled = true,
}: UseResolvedWorkflowInputSchemaOptions) {
  const isPublished = workflowStatus === 'published'
  const publishedSchemaQuery = useWorkflowInputSchema(workflowId, {
    enabled: enabled && isPublished,
  })

  const schema = useMemo(
    () =>
      isPublished
        ? publishedSchemaQuery.data ?? normalizeWorkflowInputSchema(null)
        : normalizeWorkflowInputSchema(draftInputSchema),
    [draftInputSchema, isPublished, publishedSchemaQuery.data],
  )

  return {
    schema,
    isLoading: isPublished ? publishedSchemaQuery.isLoading : false,
    error: isPublished ? publishedSchemaQuery.error : null,
    refetch: publishedSchemaQuery.refetch,
  }
}
