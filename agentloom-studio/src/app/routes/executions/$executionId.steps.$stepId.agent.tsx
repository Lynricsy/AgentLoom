import { createRoute, useParams } from '@tanstack/react-router'
import { WorkflowAgentViewer } from '@/features/execution'
import { rootRoute } from '../__root'

function WorkflowAgentViewerRouteComponent() {
  const { executionId, stepId } = useParams({
    from: '/executions/$executionId/steps/$stepId/agent',
  })

  return <WorkflowAgentViewer executionId={executionId} stepId={stepId} />
}

export const executionAgentViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/executions/$executionId/steps/$stepId/agent',
  component: WorkflowAgentViewerRouteComponent,
})
