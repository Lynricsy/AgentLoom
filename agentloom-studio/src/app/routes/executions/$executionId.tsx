import { createRoute, useParams } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { ExecutionDebugView } from '@/features/execution/components/ExecutionDebugView'
import { rootRoute } from '../__root'

function ExecutionDebugRouteComponent() {
  const { executionId } = useParams({ from: '/executions/$executionId' })

  return (
    <ReactFlowProvider>
      <ExecutionDebugView executionId={executionId} />
    </ReactFlowProvider>
  )
}

export const executionDebugRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/executions/$executionId',
  component: ExecutionDebugRouteComponent,
})
